import { useState, useRef, useCallback } from "react";

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

const TRADE_TYPES = {
  COMM_REFRIG: "Commercial Refrigeration",
  COMM_HVAC: "Commercial HVAC",
  RES_HVAC: "Residential HVAC",
};

const TABS = [
  { id: "upload", label: "Blueprint Upload", icon: "📐" },
  { id: "estimate", label: "Line-Item Estimate", icon: "📋" },
  { id: "legend", label: "Legend & Redlines", icon: "🔴" },
  { id: "bid", label: "Bid Proposal", icon: "📄" },
];

const DEFAULT_LINE_ITEMS = {
  COMM_REFRIG: [
    { id: 1, description: "Walk-in Cooler Evaporator Unit", qty: 1, unit: "EA", unitMaterial: 1850, unitLabor: 480 },
    { id: 2, description: "Condensing Unit (3-5 Ton)", qty: 1, unit: "EA", unitMaterial: 3200, unitLabor: 620 },
    { id: 3, description: "Refrigerant Copper Line Set (3/8\" x 7/8\")", qty: 50, unit: "LF", unitMaterial: 8.5, unitLabor: 4.2 },
    { id: 4, description: "Refrigerant R-448A (per lb)", qty: 15, unit: "LB", unitMaterial: 22, unitLabor: 0 },
    { id: 5, description: "Thermostat / Controller (Commercial)", qty: 1, unit: "EA", unitMaterial: 420, unitLabor: 180 },
    { id: 6, description: "Electrical Disconnect (40A)", qty: 2, unit: "EA", unitMaterial: 95, unitLabor: 140 },
  ],
  COMM_HVAC: [
    { id: 1, description: "Rooftop Unit (RTU) 5 Ton", qty: 1, unit: "EA", unitMaterial: 5800, unitLabor: 1200 },
    { id: 2, description: "Supply Ductwork (26ga)", qty: 200, unit: "LF", unitMaterial: 14, unitLabor: 9 },
    { id: 3, description: "Return Air Ductwork (26ga)", qty: 120, unit: "LF", unitMaterial: 12, unitLabor: 8 },
    { id: 4, description: "Supply Diffuser (24x24)", qty: 8, unit: "EA", unitMaterial: 65, unitLabor: 55 },
    { id: 5, description: "Return Air Grille (24x24)", qty: 4, unit: "EA", unitMaterial: 45, unitLabor: 45 },
    { id: 6, description: "Thermostat / BAS Interface", qty: 1, unit: "EA", unitMaterial: 380, unitLabor: 220 },
    { id: 7, description: "Roof Curb / Adapter", qty: 1, unit: "EA", unitMaterial: 320, unitLabor: 280 },
  ],
  RES_HVAC: [
    { id: 1, description: "Air Handler / Furnace (4 Ton)", qty: 1, unit: "EA", unitMaterial: 1650, unitLabor: 480 },
    { id: 2, description: "Condenser Unit (4 Ton 16 SEER)", qty: 1, unit: "EA", unitMaterial: 2400, unitLabor: 560 },
    { id: 3, description: "Lineset (1/4\" x 3/4\", 25ft)", qty: 1, unit: "SET", unitMaterial: 145, unitLabor: 180 },
    { id: 4, description: "Flex Duct (6\")", qty: 120, unit: "LF", unitMaterial: 3.2, unitLabor: 2.8 },
    { id: 5, description: "Register Boot (6\" x 10\")", qty: 10, unit: "EA", unitMaterial: 18, unitLabor: 22 },
    { id: 6, description: "Programmable Thermostat", qty: 1, unit: "EA", unitMaterial: 120, unitLabor: 85 },
    { id: 7, description: "Filter/Return Box", qty: 1, unit: "EA", unitMaterial: 95, unitLabor: 110 },
  ],
};

const LEGEND_SYMBOLS = {
  COMM_REFRIG: [
    { symbol: "❄️", code: "EV", name: "Evaporator Unit", color: "#3b82f6" },
    { symbol: "🔵", code: "CU", name: "Condensing Unit", color: "#1d4ed8" },
    { symbol: "━", code: "SL", name: "Suction Line", color: "#64748b" },
    { symbol: "─", code: "LL", name: "Liquid Line", color: "#94a3b8" },
    { symbol: "⚡", code: "EP", name: "Electrical Panel", color: "#f59e0b" },
    { symbol: "🌡️", code: "TC", name: "Temperature Controller", color: "#10b981" },
  ],
  COMM_HVAC: [
    { symbol: "🔲", code: "RTU", name: "Rooftop Unit", color: "#7c3aed" },
    { symbol: "→", code: "SA", name: "Supply Air Duct", color: "#3b82f6" },
    { symbol: "←", code: "RA", name: "Return Air Duct", color: "#f97316" },
    { symbol: "◉", code: "SD", name: "Supply Diffuser", color: "#06b6d4" },
    { symbol: "◎", code: "RG", name: "Return Grille", color: "#f59e0b" },
    { symbol: "⬡", code: "VAV", name: "VAV Box", color: "#8b5cf6" },
  ],
  RES_HVAC: [
    { symbol: "🏠", code: "AH", name: "Air Handler", color: "#3b82f6" },
    { symbol: "⭕", code: "CD", name: "Condenser", color: "#ef4444" },
    { symbol: "⬤", code: "REG", name: "Register", color: "#10b981" },
    { symbol: "◻", code: "GRL", name: "Return Grille", color: "#f59e0b" },
    { symbol: "〰", code: "FLX", name: "Flex Duct", color: "#64748b" },
    { symbol: "T", code: "TSTAT", name: "Thermostat", color: "#8b5cf6" },
  ],
};

// ── CLAUDE API CALL ────────────────────────────────────────────────────────────

async function callClaude(messages, systemPrompt) {
  // Calls our secure Vercel serverless proxy — API key never exposed to browser
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map((b) => b.text || "").join("\n");
}

// ── MAIN APP ───────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("upload");
  const [tradeType, setTradeType] = useState("COMM_HVAC");
  const [projectInfo, setProjectInfo] = useState({
    name: "", address: "", contractor: "", date: new Date().toISOString().split("T")[0], notes: ""
  });

  // Blueprint state
  const [blueprintText, setBlueprintText] = useState("");
  const [blueprintFile, setBlueprintFile] = useState(null);
  const [blueprintAnalysis, setBlueprintAnalysis] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Estimate state
  const [lineItems, setLineItems] = useState(() =>
    DEFAULT_LINE_ITEMS.COMM_HVAC.map(i => ({ ...i }))
  );
  const [markup, setMarkup] = useState(15);
  const [taxRate, setTaxRate] = useState(8.25);

  // Legend/Redline state
  const [redlineNotes, setRedlineNotes] = useState([]);
  const [redlineText, setRedlineText] = useState("");
  const [legendAnalysis, setLegendAnalysis] = useState("");
  const [analyzingLegend, setAnalyzingLegend] = useState(false);

  // Bid state
  const [generatingBid, setGeneratingBid] = useState(false);
  const [bidText, setBidText] = useState("");

  const fileInputRef = useRef();

  // ── HANDLERS ──

  const handleTradeChange = (t) => {
    setTradeType(t);
    setLineItems(DEFAULT_LINE_ITEMS[t].map(i => ({ ...i })));
    setBlueprintAnalysis("");
    setBidText("");
    setLegendAnalysis("");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBlueprintFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBlueprintText(ev.target.result.slice(0, 6000));
    reader.readAsText(file);
  };

  const analyzeBlueprint = async () => {
    if (!blueprintText.trim()) return;
    setAnalyzing(true);
    setBlueprintAnalysis("");
    try {
      const result = await callClaude(
        [{ role: "user", content: `Analyze this blueprint/plan document for a ${TRADE_TYPES[tradeType]} project. Extract:\n1. Equipment listed (type, quantity, model if visible)\n2. Duct or piping sizes and lengths (estimated)\n3. Key notes or specifications\n4. Rooms or zones served\n5. Any legend symbols mentioned\n6. Suggested line items for estimating\n\nDocument text:\n${blueprintText}` }],
        `You are an expert ${TRADE_TYPES[tradeType]} estimator and blueprint reader. Extract structured takeoff information from blueprint text. Be concise, specific, and practical. Format your response with clear sections using headers.`
      );
      setBlueprintAnalysis(result);

      // Auto-suggest line items based on analysis
      try {
        const itemsJson = await callClaude(
          [{ role: "user", content: `Based on this blueprint analysis, suggest 5-8 specific line items for a ${TRADE_TYPES[tradeType]} estimate. Return ONLY a JSON array with fields: description, qty, unit, unitMaterial, unitLabor. No markdown, no explanation.\n\nAnalysis:\n${result}` }],
          "You are a cost estimator. Return only valid JSON array. No backticks, no explanation."
        );
        const cleaned = itemsJson.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLineItems(parsed.map((item, i) => ({ ...item, id: i + 1 })));
          setActiveTab("estimate");
        }
      } catch (_) { /* fallback to defaults */ }
    } catch (err) {
      setBlueprintAnalysis(`Error: ${err.message}`);
    }
    setAnalyzing(false);
  };

  const analyzeLegend = async () => {
    if (!blueprintText.trim() && redlineNotes.length === 0) return;
    setAnalyzingLegend(true);
    setLegendAnalysis("");
    try {
      const notes = redlineNotes.map(n => `• [${n.type}] ${n.note}`).join("\n");
      const result = await callClaude(
        [{ role: "user", content: `Interpret the following legend symbols, redline markups, and notes from a ${TRADE_TYPES[tradeType]} blueprint.\n\nBluprint context:\n${blueprintText.slice(0, 2000)}\n\nRedline notes:\n${notes || "None added yet"}\n\nExplain what each symbol/markup means, flag any conflicts or missing information, and summarize the scope changes indicated by the redlines.` }],
        `You are an expert ${TRADE_TYPES[tradeType]} engineer and blueprint interpreter. Provide clear, practical interpretation of legend symbols and redline markups. Flag scope changes that affect cost.`
      );
      setLegendAnalysis(result);
    } catch (err) {
      setLegendAnalysis(`Error: ${err.message}`);
    }
    setAnalyzingLegend(false);
  };

  const generateBid = async () => {
    setGeneratingBid(true);
    setBidText("");
    const subtotalMat = lineItems.reduce((s, i) => s + i.qty * i.unitMaterial, 0);
    const subtotalLab = lineItems.reduce((s, i) => s + i.qty * i.unitLabor, 0);
    const subtotal = subtotalMat + subtotalLab;
    const markupAmt = subtotal * (markup / 100);
    const tax = subtotalMat * (taxRate / 100);
    const total = subtotal + markupAmt + tax;

    try {
      const result = await callClaude(
        [{ role: "user", content: `Write a professional bid proposal letter for:\n\nProject: ${projectInfo.name || "Project"}\nAddress: ${projectInfo.address || "TBD"}\nContractor: ${projectInfo.contractor || "Your Company"}\nDate: ${projectInfo.date}\nTrade: ${TRADE_TYPES[tradeType]}\n\nScope summary:\n${lineItems.map(i => `- ${i.description}: ${i.qty} ${i.unit}`).join("\n")}\n\nTotal Bid: $${total.toFixed(2)}\n\nAdditional notes: ${projectInfo.notes || "None"}\n\nWrite a complete, professional proposal including scope of work, exclusions, payment terms, and validity period.` }],
        "You are an expert contractor proposal writer. Write professional, complete bid proposals for mechanical contractors. Use formal but clear language. Include standard contractor terms."
      );
      setBidText(result);
    } catch (err) {
      setBidText(`Error generating bid: ${err.message}`);
    }
    setGeneratingBid(false);
  };

  const addRedlineNote = () => {
    if (!redlineText.trim()) return;
    setRedlineNotes(prev => [...prev, {
      id: Date.now(),
      note: redlineText,
      type: "REDLINE",
      timestamp: new Date().toLocaleTimeString()
    }]);
    setRedlineText("");
  };

  const updateItem = (id, field, val) => {
    setLineItems(prev => prev.map(i => i.id === id ? { ...i, [field]: field === "description" || field === "unit" ? val : parseFloat(val) || 0 } : i));
  };

  const addItem = () => {
    const newId = Math.max(...lineItems.map(i => i.id), 0) + 1;
    setLineItems(prev => [...prev, { id: newId, description: "New Item", qty: 1, unit: "EA", unitMaterial: 0, unitLabor: 0 }]);
  };

  const removeItem = (id) => setLineItems(prev => prev.filter(i => i.id !== id));

  // ── CALCS ──
  const subtotalMaterial = lineItems.reduce((s, i) => s + i.qty * i.unitMaterial, 0);
  const subtotalLabor = lineItems.reduce((s, i) => s + i.qty * i.unitLabor, 0);
  const subtotal = subtotalMaterial + subtotalLabor;
  const markupAmount = subtotal * (markup / 100);
  const taxAmount = subtotalMaterial * (taxRate / 100);
  const grandTotal = subtotal + markupAmount + taxAmount;

  const fmt = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── RENDER ──
  return (
    <div style={{ fontFamily: "'DM Mono', 'Courier New', monospace", background: "#0d1117", minHeight: "100vh", color: "#e2e8f0" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1a2332 0%, #0d1117 100%)", borderBottom: "1px solid #1e3a5f", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.05em" }}>
            ⚙ MECH<span style={{ color: "#f97316" }}>BID</span>
          </div>
          <div style={{ fontSize: 11, color: "#64748b", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Commercial & Residential Estimating Platform
          </div>
        </div>

        {/* Trade Selector */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(TRADE_TYPES).map(([key, label]) => (
            <button key={key} onClick={() => handleTradeChange(key)}
              style={{ padding: "6px 12px", fontSize: 11, borderRadius: 4, border: `1px solid ${tradeType === key ? "#38bdf8" : "#1e3a5f"}`, background: tradeType === key ? "#0c2d48" : "transparent", color: tradeType === key ? "#38bdf8" : "#64748b", cursor: "pointer", letterSpacing: "0.08em", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Project Info Bar */}
      <div style={{ background: "#111827", borderBottom: "1px solid #1e2d3d", padding: "10px 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[["name", "Project Name", "text"], ["address", "Address", "text"], ["contractor", "Contractor", "text"], ["date", "Date", "date"]].map(([field, placeholder, type]) => (
          <input key={field} type={type} placeholder={placeholder} value={projectInfo[field]}
            onChange={e => setProjectInfo(p => ({ ...p, [field]: e.target.value }))}
            style={{ background: "#0d1117", border: "1px solid #1e3a5f", borderRadius: 4, color: "#e2e8f0", padding: "5px 10px", fontSize: 12, fontFamily: "inherit", flex: "1 1 140px", minWidth: 120 }} />
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e2d3d", background: "#0d1117" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "12px 20px", fontSize: 12, background: activeTab === tab.id ? "#111827" : "transparent", color: activeTab === tab.id ? "#38bdf8" : "#64748b", border: "none", borderBottom: activeTab === tab.id ? "2px solid #38bdf8" : "2px solid transparent", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>

        {/* ── TAB: BLUEPRINT UPLOAD ── */}
        {activeTab === "upload" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <SectionHeader>Blueprint / Plan Upload</SectionHeader>
              <div style={{ border: "2px dashed #1e3a5f", borderRadius: 8, padding: 32, textAlign: "center", marginBottom: 16, cursor: "pointer", background: "#0a0f1a" }}
                onClick={() => fileInputRef.current.click()}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
                <div style={{ color: "#38bdf8", fontSize: 13, marginBottom: 4 }}>
                  {blueprintFile ? `✓ ${blueprintFile.name}` : "Click to upload blueprint PDF or text file"}
                </div>
                <div style={{ color: "#475569", fontSize: 11 }}>PDF, TXT, CSV supported</div>
                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv" onChange={handleFileUpload} style={{ display: "none" }} />
              </div>

              <div style={{ marginBottom: 12 }}>
                <Label>Or paste blueprint / spec text directly:</Label>
                <textarea value={blueprintText} onChange={e => setBlueprintText(e.target.value)}
                  placeholder={`Paste blueprint notes, equipment schedules, spec sections, or any plan text here...\n\nExample:\nEquipment Schedule:\n- RTU-1: 5 Ton Carrier 48HCDA06A2A5-0A0A0 on Grid-E / 3rd Floor\n- FC-1: Fan Coil Unit 2 Ton, Supply 200 CFM\nDuct Notes: 26ga galv, insulated R-6 supply, uninsulated return\nZones: Conference (600 SF), Open Office (1200 SF)...`}
                  rows={10} style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: 12, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <ActionButton onClick={analyzeBlueprint} disabled={analyzing || !blueprintText.trim()}>
                {analyzing ? "⏳ Analyzing Blueprint..." : "🔍 Analyze Blueprint & Extract Takeoff"}
              </ActionButton>
            </div>

            <div>
              <SectionHeader>AI Blueprint Analysis</SectionHeader>
              {blueprintAnalysis ? (
                <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 480, overflowY: "auto", color: "#94a3b8" }}>
                  {blueprintAnalysis}
                </div>
              ) : (
                <EmptyState icon="🔍" text="Upload or paste a blueprint to extract equipment, quantities, duct sizes, and auto-populate estimate line items." />
              )}

              {blueprintAnalysis && (
                <div style={{ marginTop: 12 }}>
                  <ActionButton onClick={() => setActiveTab("estimate")} variant="secondary">
                    → View Auto-Generated Estimate
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: LINE-ITEM ESTIMATE ── */}
        {activeTab === "estimate" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <SectionHeader style={{ margin: 0 }}>{TRADE_TYPES[tradeType]} — Line-Item Estimate</SectionHeader>
              <ActionButton onClick={addItem} variant="secondary" style={{ padding: "6px 14px", fontSize: 11 }}>+ Add Item</ActionButton>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#0c2d48", color: "#38bdf8" }}>
                    {["Description", "Qty", "Unit", "Unit Material", "Unit Labor", "Total Material", "Total Labor", "Line Total", ""].map(h => (
                      <th key={h} style={{ padding: "10px 8px", textAlign: h === "Description" ? "left" : "right", borderBottom: "1px solid #1e3a5f", fontWeight: 600, letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => {
                    const totalMat = item.qty * item.unitMaterial;
                    const totalLab = item.qty * item.unitLabor;
                    const lineTotal = totalMat + totalLab;
                    return (
                      <tr key={item.id} style={{ background: idx % 2 === 0 ? "#0a0f1a" : "#0d1117", borderBottom: "1px solid #111827" }}>
                        <td style={{ padding: "6px 8px" }}>
                          <input value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)}
                            style={{ background: "transparent", border: "none", color: "#e2e8f0", width: "100%", fontFamily: "inherit", fontSize: 12, outline: "none" }} />
                        </td>
                        {[["qty", 60], ["unit", 55]].map(([f, w]) => (
                          <td key={f} style={{ padding: "6px 8px", textAlign: "right" }}>
                            <input value={item[f]} onChange={e => updateItem(item.id, f, e.target.value)}
                              style={{ background: "transparent", border: "none", color: "#93c5fd", width: w, fontFamily: "inherit", fontSize: 12, textAlign: "right", outline: "none" }} />
                          </td>
                        ))}
                        {[["unitMaterial", "$"], ["unitLabor", "$"]].map(([f]) => (
                          <td key={f} style={{ padding: "6px 8px", textAlign: "right" }}>
                            <input type="number" value={item[f]} onChange={e => updateItem(item.id, f, e.target.value)}
                              style={{ background: "transparent", border: "none", color: "#fbbf24", width: 80, fontFamily: "inherit", fontSize: 12, textAlign: "right", outline: "none" }} />
                          </td>
                        ))}
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#64748b" }}>{fmt(totalMat)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#64748b" }}>{fmt(totalLab)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: "#38bdf8", fontWeight: 600 }}>{fmt(lineTotal)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center" }}>
                          <button onClick={() => removeItem(item.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ display: "flex", gap: 24, marginTop: 24, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 280px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 20 }}>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 12, letterSpacing: "0.1em" }}>ADJUSTMENTS</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <Label>Markup %</Label>
                    <input type="number" value={markup} onChange={e => setMarkup(parseFloat(e.target.value) || 0)}
                      style={{ background: "#0d1117", border: "1px solid #1e3a5f", borderRadius: 4, color: "#fbbf24", padding: "6px 10px", width: 70, fontFamily: "inherit", fontSize: 13 }} />
                  </div>
                  <div>
                    <Label>Tax Rate %</Label>
                    <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                      style={{ background: "#0d1117", border: "1px solid #1e3a5f", borderRadius: 4, color: "#fbbf24", padding: "6px 10px", width: 70, fontFamily: "inherit", fontSize: 13 }} />
                  </div>
                </div>
              </div>

              <div style={{ flex: "1 1 320px", background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 20 }}>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 12, letterSpacing: "0.1em" }}>COST SUMMARY</div>
                {[
                  ["Material Subtotal", subtotalMaterial, "#94a3b8"],
                  ["Labor Subtotal", subtotalLabor, "#94a3b8"],
                  [`Markup (${markup}%)`, markupAmount, "#fbbf24"],
                  [`Tax on Materials (${taxRate}%)`, taxAmount, "#fbbf24"],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                    <span style={{ color: "#475569" }}>{label}</span>
                    <span style={{ color }}>{fmt(val)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #1e3a5f", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
                  <span style={{ color: "#38bdf8" }}>GRAND TOTAL</span>
                  <span style={{ color: "#38bdf8" }}>{fmt(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <ActionButton onClick={() => setActiveTab("bid")}>→ Generate Bid Proposal</ActionButton>
            </div>
          </div>
        )}

        {/* ── TAB: LEGEND & REDLINES ── */}
        {activeTab === "legend" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <SectionHeader>Symbol Legend — {TRADE_TYPES[tradeType]}</SectionHeader>
              <div style={{ background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, marginBottom: 20 }}>
                {LEGEND_SYMBOLS[tradeType].map(sym => (
                  <div key={sym.code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #111827" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 4, background: sym.color + "22", border: `1px solid ${sym.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {sym.symbol}
                    </div>
                    <div>
                      <div style={{ color: sym.color, fontSize: 12, fontWeight: 600 }}>{sym.code}</div>
                      <div style={{ color: "#64748b", fontSize: 11 }}>{sym.name}</div>
                    </div>
                  </div>
                ))}
              </div>

              <SectionHeader>Redline Notes</SectionHeader>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={redlineText} onChange={e => setRedlineText(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addRedlineNote()}
                  placeholder="Type redline markup or scope change note..."
                  style={{ flex: 1, background: "#0a0f1a", border: "1px solid #ef4444", borderRadius: 4, color: "#e2e8f0", padding: "8px 12px", fontSize: 12, fontFamily: "inherit" }} />
                <button onClick={addRedlineNote} style={{ background: "#ef4444", border: "none", borderRadius: 4, color: "#fff", padding: "8px 14px", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>+ Add</button>
              </div>
              {redlineNotes.map(n => (
                <div key={n.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 4, padding: "8px 12px", marginBottom: 6 }}>
                  <span style={{ color: "#ef4444", fontSize: 11, marginTop: 1 }}>●</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#fca5a5" }}>{n.note}</div>
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{n.timestamp}</div>
                  </div>
                  <button onClick={() => setRedlineNotes(prev => prev.filter(r => r.id !== n.id))} style={{ background: "none", border: "none", color: "#7f1d1d", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              ))}

              <div style={{ marginTop: 16 }}>
                <ActionButton onClick={analyzeLegend} disabled={analyzingLegend}>
                  {analyzingLegend ? "⏳ Interpreting..." : "🔴 Interpret Legend & Redlines with AI"}
                </ActionButton>
              </div>
            </div>

            <div>
              <SectionHeader>AI Redline Interpretation</SectionHeader>
              {legendAnalysis ? (
                <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 560, overflowY: "auto", color: "#94a3b8" }}>
                  {legendAnalysis}
                </div>
              ) : (
                <EmptyState icon="🔴" text="Add redline notes or paste blueprint text, then click 'Interpret' to get AI analysis of scope changes, legend symbols, and cost impacts." />
              )}
            </div>
          </div>
        )}

        {/* ── TAB: BID PROPOSAL ── */}
        {activeTab === "bid" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24 }}>
            <div>
              <SectionHeader>Bid Summary</SectionHeader>

              <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 12, letterSpacing: "0.1em" }}>PROJECT</div>
                <InfoRow label="Name" value={projectInfo.name || "—"} />
                <InfoRow label="Address" value={projectInfo.address || "—"} />
                <InfoRow label="Contractor" value={projectInfo.contractor || "—"} />
                <InfoRow label="Trade" value={TRADE_TYPES[tradeType]} />
                <InfoRow label="Date" value={projectInfo.date} />
              </div>

              <div style={{ background: "#0a1628", border: "1px solid #1e3a5f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ color: "#64748b", fontSize: 11, marginBottom: 12, letterSpacing: "0.1em" }}>COST BREAKDOWN</div>
                <InfoRow label="Material" value={fmt(subtotalMaterial)} />
                <InfoRow label="Labor" value={fmt(subtotalLabor)} />
                <InfoRow label={`Markup (${markup}%)`} value={fmt(markupAmount)} />
                <InfoRow label={`Tax (${taxRate}%)`} value={fmt(taxAmount)} />
                <div style={{ borderTop: "1px solid #1e3a5f", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700 }}>
                  <span style={{ color: "#38bdf8" }}>TOTAL BID</span>
                  <span style={{ color: "#38bdf8" }}>{fmt(grandTotal)}</span>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Label>Additional Notes / Scope Clarifications</Label>
                <textarea value={projectInfo.notes} onChange={e => setProjectInfo(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Exclusions, assumptions, special conditions..."
                  rows={4} style={{ width: "100%", background: "#0a0f1a", border: "1px solid #1e3a5f", borderRadius: 6, color: "#e2e8f0", padding: 10, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              <ActionButton onClick={generateBid} disabled={generatingBid}>
                {generatingBid ? "⏳ Writing Proposal..." : "📄 Generate Bid Proposal Letter"}
              </ActionButton>
            </div>

            <div>
              <SectionHeader>Bid Proposal Letter</SectionHeader>
              {bidText ? (
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20, fontSize: 12.5, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "#1e293b", maxHeight: 560, overflowY: "auto", fontFamily: "Georgia, serif" }}>
                  {bidText}
                </div>
              ) : (
                <EmptyState icon="📄" text="Fill in project details and set your estimate on the Line-Item tab, then generate a professional bid proposal letter." />
              )}
              {bidText && (
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button onClick={() => { navigator.clipboard.writeText(bidText); }}
                    style={{ background: "#0c2d48", border: "1px solid #1e3a5f", borderRadius: 4, color: "#38bdf8", padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    📋 Copy to Clipboard
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── SMALL COMPONENTS ──────────────────────────────────────────────────────────

function SectionHeader({ children, style }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14, borderLeft: "3px solid #f97316", paddingLeft: 10, ...style }}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5, letterSpacing: "0.08em" }}>{children}</div>;
}

function ActionButton({ children, onClick, disabled, variant = "primary", style }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: variant === "primary" ? (disabled ? "#0c2d48" : "linear-gradient(135deg, #0369a1, #0c4a6e)") : "#0a1628", border: `1px solid ${variant === "primary" ? "#0369a1" : "#1e3a5f"}`, borderRadius: 6, color: disabled ? "#334155" : "#38bdf8", padding: "10px 20px", fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", letterSpacing: "0.06em", fontWeight: 600, ...style }}>
      {children}
    </button>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ border: "1px dashed #1e3a5f", borderRadius: 8, padding: 40, textAlign: "center", background: "#0a0f1a" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
      <div style={{ color: "#475569", fontSize: 12, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #0f172a", fontSize: 12 }}>
      <span style={{ color: "#475569" }}>{label}</span>
      <span style={{ color: "#cbd5e1" }}>{value}</span>
    </div>
  );
}
