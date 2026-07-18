# Vector CAD Takeoff — findings & roadmap

How the funded HVAC takeoff tools (iBeam, BuildVision) read plans, what MechBid
does today, and the path to matching them on clean vector drawings.

## How they work

Construction plans are almost always **vector PDFs** (AutoCAD/Revit exports).
Ducts, pipes, and symbols are real geometric objects with exact coordinates —
not pixels. Their pipeline:

1. **Read the vector layer** — polylines have exact endpoints, so duct length is
   *measured* off the geometry, not estimated from an image.
2. **Symbol/block detection** — repeated CAD blocks (a diffuser placed 40×) are
   counted; often the file names them, else trained object detection.
3. **Layers (OCG)** — `M-DUCT-SUPPLY` etc. classify linework for free.
4. **Text + schedules** — labels associated with nearby geometry; schedule
   tables parsed to structured specs. LLMs help here.
5. **Scale calibration** — from the title block or a user two-point click.
6. **Human-in-the-loop QA** — AI does ~90%, estimators catch the rest.

## What MechBid does

- **Refrigeration:** Excel BPRs (exact, direct read), Word RC schedules (text),
  redline **photos** (raster → vision). No vector geometry to mine — vision is
  the ceiling for everyone here. This is the moat; the vector edge does **not**
  apply.
- **HVAC PDFs:** render page → vision LLM → estimate duct length off a stamped
  scale bar. This is the weakest rung: vision-only estimation.

## Prototype findings (real mechanical PDF, `afdb_final_mechanical_design`)

pdf.js (already a dependency) exposes the full vector operator stream. Verified:

- Page 3 = **60,000+** stroked segments; page 5 = ~12,000. Geometry is all there.
- Walking the operator list with CTM tracking measures every segment **exactly**.
- **Layers didn't map cleanly** — the marked-content OCG ids
  (`beginMarkedContentProps` → `{type:'OCG', id:'903R'}`) don't match the named
  groups from `getOptionalContentConfig().getGroups()` (`1R`, `8R`, …). So
  layer-name isolation is unreliable on this drawing.
- **Color is the reliable signal.** Length by stroke color, page 5:
  | color | length @ 1/4" | meaning |
  |---|---|---|
  | cyan (0,255,255) | 4,096 ft | ductwork |
  | black | 1,860 ft | walls/dims/title block |
  | light blue | 323 ft | return/piping |
  | gray/green/red | ~90 ft | symbols/annotations |
  Cyan/blue = duct is a near-universal mechanical convention.
- **Outline ≠ centerline:** a plan duct is two parallel lines, so colored length
  is ~2× the run. Centerline ≈ outline ÷ 2.

## Shipped (v1): geometry cross-check

`src/api/ductVectors.js` + `measureVectorDucts()` in `pdfRender.js`, wired into
`analyzeHvacPlanPdf`. On a scaled vector drawing page it measures duct-colored
linework and surfaces an **independent** footage number next to the vision
takeoff (page 5 → ~2,242 ft centerline). Two methods that catch each other — a
trust feature the generic tools don't offer. Fully unit-tested (geometry math
with synthetic operator lists; validated against the real PDF).

Deliberately labeled as a cross-check (outline ÷ 2 centerline estimate), NOT a
final priced takeoff, because the hard parts below aren't done.

## Roadmap to exact per-size takeoff (the real competitor parity)

1. **Parallel-line pairing** — pair the two sides of each duct run to get true
   centerline + width; the fiddly part, needs several real drawings to tune.
2. **Label association** — match `24x12` text to the run it sits on (nearest
   polyline / bounding proximity) → per-size footage, not just a total.
3. **Fittings** — elbows/transitions/tees from geometry corners + symbol blocks.
4. **Layer support** — where OCG layers ARE clean, prefer them over color.
5. **Feed the LLM the exact geometry + image together** (hybrid) so it assigns
   service (supply/return/OA) and reconciles labels against measured runs.

## Strategic call

Build this out when seriously pushing the **commercial HVAC blueprint** side.
It does nothing for grocery refrigeration remodels (no vector geometry in
Excel/Word/redline-photo inputs), which remain the moat. The v1 cross-check
already differentiates on vector HVAC plans; the roadmap above reaches full
parity when it's worth the multi-week investment.
