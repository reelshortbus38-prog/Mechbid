# Labor numbers review — 2026-09-12

Reviewed by **Patrick Donald**, estimator.

The first outside read on the labor units. Recorded here as given, before any
interpretation, because the app's numbers have until now come from one person —
a refrigeration mechanic who installs the work — and a second qualified reading
is the thing that was missing. It is kept verbatim so that a later disagreement
can be traced to what was actually said rather than to what got typed into a
default.

**One number changed, and only after a second person settled it.** The footage
rate moved to 0.075 hr/ft once the mechanic who runs the pipe answered the
question the review left open (see below) — the only unit in this app standing
on a counted day.

Three pieces of scope that were absent from the app entirely — commissioning,
setting the rack, setting walk-in panels — were built on the back of it.

Everything else is recorded, not applied. The brazing times are now marked
*disputed* rather than confirmed, three answers came back in the wrong units and
cannot be used as given, and two questions were not answered. See
`src/steps/laborUnits.js`.

---

## As given

### Running copper

> 400 ft in a day, 3 men, 10 hours → **0.075 man-hours per foot**
> (app today 0.045)

### Supermarket refrigeration

| Item | Reviewer | App today |
|---|---|---|
| Braze joint — large | 0.15 hr | 1.1 hr |
| Case hookup | 1.0 hr | 1.5 hr |
| Rack rigging and set | 2.0 hr | *no line* |
| Commissioning per rack | 24–48 hr | *no line* |
| Walk-in panel | 0.45 hr | *no line* |

### Multipliers that hit the whole job

| Item | Reviewer | Asked for |
|---|---|---|
| Live store remodel | 10 hr | a multiplier (×) |
| Closed store remodel | 10 hr | a multiplier (×) |
| Crew efficiency | 30–45% | a multiplier (×) |

### Notes

- *Where does commissioning belong?* — "N/A"
- *Which way does a crew efficiency dial run?* — "Possible"
- *What is missing from all of this?* — "Possibly 1.5 hours per night work with
  case changes."

---

## What can be used, and what cannot

### Usable as evidence

**The per-foot day.** 400 ft, three men, ten hours is 30 man-hours over 400 ft
= 0.075 hr/ft. That is a measured day with a method behind it, which is more
than any footage number in this app has ever had.

It arrived with no pipe size, and the app carries three buckets — small (≤7/8"),
med (1⅛–1⅜"), large (≥1⅝"). **Resolved 2026-09-13** by the mechanic who runs
the pipe:

> "For the pipe size on the circuits I think that's just a general rule. The
> circuits we run are 1/2 liquid to 7/8 liquid and 5/8 suction to 1 5/8
> suction. The time is pretty much the same it's the materials that changes
> the price on the bid."

So the number applies to all three buckets, and the size split was not real for
this shop's range in the first place. That holds together with how the app
decomposes the work: brazing a bigger joint does take longer and is charged
separately in `perJoint*`, so what is left in the per-foot unit is hanging and
routing the line — and a hallway is the same length whatever is going down it.

**Applied.** All three footage rates are now 0.075, marked confirmed, and
`laborUnits.test.js` pins the equality so a later reader does not "fix" three
identical numbers back into a spread.

Neither answer alone was usable. A measured day with no size could have
belonged to any bucket; "the time is the same" with no measurement is not a
number. Together they are the only unit in this app resting on a job.

**Commissioning per rack, 24–48 hr.** The only figure here that two independent
sources agree on.

**Built 2026-09-13** (`src/steps/scopeUnits.js`). Commissioning the rack,
setting it in place, and setting walk-in panels were not under-estimated in
this app — they were **absent**, so every bid it produced was short by all
three. On a two-rack
store the commissioning alone is 48–96 man-hours that were charged at nothing.

They reach the job as field-task rows the estimator reads, edits and deletes,
not as a hidden total: one of the three units is still in open dispute, and a
number he cannot see is a number he cannot defend. Zeroing a unit says "the GC has
that on this job" and the row stops being generated.

The defaults are the reviewer's figures where they conflict with the PRD —
a named estimator who bids these against a document attributed to nobody — and
both figures are shown on screen:

| | Reviewer | PRD | Shipped default | Marked |
|---|---|---|---|---|
| Commission / rack | 24–48 hr | 24–48 hr | 36 hr | *varies* — both gave a range |
| Set rack in place | 2.0 hr | 16–24 hr | 2.0 hr | **confirmed** — see below |
| Walk-in panel | 0.45 hr | 1.5–2 hr | 0.45 hr | **disputed**, 3–4× apart |

**The rack set was never a dispute.** It shipped marked as one, 8–12× apart,
and the mechanic settled it the same day:

> "That 2 hour is for setting the rack in place."

So the two figures were describing different scopes rather than disagreeing.
The unit is renamed to say what it covers, and marked confirmed.

That leaves a real gap, stated rather than papered over: **offloading the rack
and getting it into the building is not in the 2 hours.** It is a crane or a
rigging crew, which is a subcontract or a rental and not crew hours — both of
those paths already exist in the app, and the Proposal step already lists
crane/rigging as a pass-through. No man-hour unit was invented for it, because
a number nobody has quoted does not belong in a bid.

The walk-in panel is still open, and it is worth asking the same question that
settled this one: what does each figure cover? A 3–4× gap is often two people
describing different scopes rather than disagreeing.

### Cannot be used as given

**The three multipliers were answered in hours.** The question asked how much
to scale a whole job by; the answers are flat hour figures. Live store and
closed store both came back as "10 hr", and those two exist precisely to be
different from each other — a live-store remodel is slower than a closed one,
and that is the whole reason the pair is on the sheet. A flat number also
cannot do a multiplier's job: it does not grow with the size of the store.

**Crew efficiency at 30–45% would double-count.** This is the important one.
The per-foot figure above is an OBSERVED rate — what three men actually did in
a real ten-hour day, with whatever the site threw at them already in it.
Applying an efficiency derate on top of an observed rate charges for the same
inefficiency twice.

The arithmetic, on a twenty-circuit store: the reviewer's own joint, footage
and case numbers together come to 280 man-hours. Divided by a 35% efficiency
that becomes 801 — against 341 for the app as it stands today. About $44,000 at
$95/man-hour, on a mistake of interpretation rather than of judgement.

An efficiency dial is only meaningful against BOOK rates — published units that
assume ideal conditions. It is meaningless against a rate measured on a real
job, and the app's rates are heading toward the latter.

**Two non-answers.** "Where does commissioning belong?" came back "N/A" and
"which way does the efficiency dial run?" came back "Possible". Both still need
asking.

### New, and not previously on anyone's list

**Night work with case changes, ~1.5 hr.** Volunteered under "what is missing".
Not currently anywhere in the app. Needs pinning down: 1.5 hours per what — per
case, per night, per circuit?

---

## Where the hours actually go

Worth having in front of you when reading the dispute below. On a twenty-circuit
store, at the app's numbers before this review:

| | Man-hours | Share |
|---|---|---|
| Joints | 144.5 | **45%** |
| Footage | 107.5 | 33% |
| Rack ties | 40.0 | 12% |
| Cases | 30.0 | 9% |

This matters for one reason. The footage rates were originally halved because
the circuit totals "read about double" — and the whole cut was taken on
footage, because the brazing numbers had been checked by a foreman and looked
right. But joints are the larger contributor, and a second estimator now puts
them at a seventh of what is standing there.

If the totals really did read double, that is where to look. Halving the
footage was most likely a correct instinct applied to the wrong line.

## The dispute that matters most

| | Reviewer | App today | Ratio |
|---|---|---|---|
| Braze joint, large | 0.15 hr | 1.1 hr | **7.3×** |

The app's 1.1 hr was marked *confirmed* — "checked with a working foreman,
brazing times looked right as they stood." So this is not a checked number
against an unchecked one. It is two people who do this work, 7× apart.

Joints dominate this estimate. On a twenty-circuit store:

| | Man-hours | At $95/man-hr |
|---|---|---|
| App today | 341 | $32,395 |
| Reviewer's joints | 217 | $20,634 |
| Reviewer's per-foot (all sizes) | 414 | $39,340 |
| Reviewer's joints + per-foot + cases | 280 | $26,638 |

Note the directions: the joint figure takes the bid **down** by about $11,800
and the footage figure takes it **up** by about $6,900. They do not cancel to
nothing, and they do not agree about which way the app is currently wrong.

Neither reading is being overruled by an app. Both are recorded, the units are
marked disputed on screen in red, and the estimator is told before the number
is leaned on.

---

## Still to ask

1. ~~What pipe size was the 400 ft day?~~ **Answered 2026-09-13** — the split
   is not real for the sizes this shop runs. Applied.
2. **The braze joint, with both figures on the table.** 0.15 hr and 1.1 hr for
   the same joint. Does the 1.1 include purge, cool, check and insulate, and
   the 0.15 only the braze itself? That would explain a good deal of a 7× gap.
3. **The three multipliers, re-asked as multipliers.** Live vs closed store,
   as a × on the whole job.
4. **Crew efficiency — against what?** If the app's rates are measured days,
   the dial has nothing left to correct.
5. **Night work case changes: 1.5 hr per what?**
6. ~~Where does commissioning belong?~~ **Built 2026-09-13** as its own line,
   per rack, separate from the per-circuit rack tie. Still worth confirming he
   agrees with that placement.
7. ~~Rig & set~~ **Answered 2026-09-13** — the 2 hours is setting the rack in
   place. Not in conflict with the PRD after all; renamed and confirmed.
8. **The walk-in panel.** 0.45 hr against 1.5–2. Same question again: what does
   each figure cover?
9. **Who rigs the rack in?** Not a labor unit — a crane or a rigging crew, so
   it wants a subcontractor or rental line. Worth knowing whether that is
   normally the shop's cost or the GC's.
