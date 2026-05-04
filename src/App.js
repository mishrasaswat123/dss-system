import { useState, useEffect } from "react";

const SIGNALS = {
  marketScore: 48,
  vix: 13.42,
  pcr: 0.82,
  nifty: 22913,
  dma200: 23400,
  dma50: 23110,
  rsi: 42.3,
  fiiFlow: -8420,
  diiFlow: 11340,
  repoRate: 6.25,
  gsec10y: 6.91,
  dxy: 104.8,
  crude: 82.4,
  gold: 88240,
  fearGreed: 38,
  pe: 21.4,
  gdp: 6.8,
  cpi: 4.8,
};

const SECTOR_DATA = [
  { name: "FMCG", ret: 4.2, signal: "Strong Buy", phase: "LEADING", cls: "sb" },
  { name: "IT / Tech", ret: 2.8, signal: "Buy", phase: "IMPROVING", cls: "b" },
  { name: "Pharma", ret: 2.1, signal: "Buy", phase: "LEADING", cls: "b" },
  { name: "Pvt Banks", ret: 0.4, signal: "Neutral", phase: "WEAKENING", cls: "n" },
  { name: "PSU Banks", ret: -0.2, signal: "Neutral", phase: "NEUTRAL", cls: "n" },
  { name: "Auto", ret: -0.8, signal: "Neutral", phase: "LAGGING", cls: "n" },
  { name: "Cap Goods", ret: -1.4, signal: "Caution", phase: "LAGGING", cls: "be" },
  { name: "Metals", ret: -2.1, signal: "Caution", phase: "LAGGING", cls: "be" },
  { name: "Real Estate", ret: -3.2, signal: "Avoid", phase: "LAGGING", cls: "sbe" },
  { name: "Midcap Idx", ret: -4.1, signal: "Avoid", phase: "LAGGING", cls: "sbe" },
];


const GLOBAL_DATA = [
  { factor: "US Fed Policy", status: "Hawkish Hold 5.25%", impact: "FII outflows · INR pressure", sig: "RISK-OFF", bull: false },
  { factor: "DXY Strength", status: "104.8 · Elevated", impact: "EM capital outflows", sig: "HEADWIND", bull: false },
  { factor: "Crude Oil", status: "$82.4 · Stable-high", impact: "CAD pressure · Inflation risk", sig: "WATCH", bull: null },
  { factor: "Gold", status: "ATH · ₹88,240", impact: "Positive SGBs · Gold ETFs", sig: "TAILWIND", bull: true },
  { factor: "China PMI", status: "49.2 · Contraction", impact: "Metals/Infra weak", sig: "NEGATIVE", bull: false },
  { factor: "US S&P 500", status: "Sideways · 5,200", impact: "Risk sentiment moderate", sig: "NEUTRAL", bull: null },
  { factor: "EM MSCI Flow", status: "Outflow $4.2B", impact: "FII selling in India", sig: "OUTFLOW", bull: false },
  { factor: "US 10Y Treasury", status: "4.65% · Elevated", impact: "EM bond competition", sig: "ELEVATED", bull: null },
];

const OI_SIGNALS = [
  { name: "VIX Level", val: "13.42", meaning: "Moderate fear · Options premium elevated", sig: "CAUTION", bull: null },
  { name: "VIX Trend", val: "Rising", meaning: "Increasing uncertainty · Hedging activity up", sig: "RISING FEAR", bull: false },
  { name: "PCR (OI)", val: "0.82", meaning: "Call writers dominate · Bearish bias", sig: "BEARISH", bull: false },
  { name: "PCR (Vol)", val: "0.91", meaning: "Put buying increasing · Some hedging", sig: "HEDGING", bull: null },
  { name: "OI Build", val: "Short build", meaning: "Rising OI + falling price = fresh shorts", sig: "SHORT BUILD", bull: false },
  { name: "FII F&O", val: "−₹5,610Cr", meaning: "FIIs net short in index futures", sig: "FII SHORT", bull: false },
  { name: "Impl. Vol", val: "14.2%", meaning: "Above 30D realized vol · Premium to sell", sig: "IV > RV", bull: null },
  { name: "Max Pain", val: "23,000", meaning: "Price 913 pts below max pain", sig: "WATCH", bull: null },
];

function Chip({ label, bull }) {
  const style = bull === true
    ? { background: "rgba(0,201,122,0.15)", color: "#00c97a", border: "1px solid rgba(0,201,122,0.3)" }
    : bull === false
    ? { background: "rgba(255,77,109,0.15)", color: "#ff4d6d", border: "1px solid rgba(255,77,109,0.3)" }
    : { background: "rgba(245,166,35,0.15)", color: "#f5a623", border: "1px solid rgba(245,166,35,0.3)" };
  return (
    <span style={{ ...style, padding: "2px 7px", borderRadius: 3, fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", fontFamily: "monospace" }}>
      {label}
    </span>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: "#131c25", border: "1px solid #1e2d3d", borderRadius: 6,
      padding: 16, position: "relative", ...style
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(0,212,170,0.15),transparent)" }} />
      {children}
    </div>
  );
}

function PanelHead({ children }) {
  return <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3d5268", marginBottom: 10, fontFamily: "monospace" }}>{children}</div>;
}

function KPICard({ label, value, sub, color }) {
  return (
    <Panel style={{ borderLeft: `3px solid ${color || "#1e2d3d"}` }}>
      <PanelHead>{label}</PanelHead>
      <div style={{ fontFamily: "Georgia, serif", fontSize: "1.9rem", color: "#eef4fa", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: "0.68rem", color: "#7a9bb5", marginTop: 4 }}>{sub}</div>
    </Panel>
  );
}

function SignalBar({ name, score, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: "0.68rem", color: "#7a9bb5", width: 150, flexShrink: 0 }}>{name}</div>
      <div style={{ flex: 1, height: 5, background: "#080c10", borderRadius: 3 }}>
        <div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: color }} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "0.62rem", color, width: 28, textAlign: "right" }}>{score}</div>
    </div>
  );
}

// ── OVERVIEW TAB ──
function OverviewTab() {
  const stripItems = [
    { cat: "Macro", sig: "CAUTIOUS", desc: "RBI easing vs global uncertainty", color: "#f5a623" },
    { cat: "Equity Trend", sig: "SIDEWAYS", desc: "Nifty below 200DMA · consolidation", color: "#f5a623" },
    { cat: "Sector", sig: "DEFENSIVE SHIFT", desc: "FMCG, IT, Pharma leading", color: "#00c97a" },
    { cat: "Sentiment", sig: "FEAR", desc: "VIX rising · FII selling", color: "#ff4d6d" },
    { cat: "Global Risk", sig: "RISK-OFF", desc: "Fed hawkish · DXY firm · EM pressure", color: "#ff4d6d" },
  ];

  const scoreModules = [
    { name: "Macro / Fundamental", score: 58, color: "#f5a623" },
    { name: "Equity Technical", score: 42, color: "#ff4d6d" },
    { name: "Sector Momentum", score: 52, color: "#f5a623" },
    { name: "Debt / Rate Environment", score: 65, color: "#00c97a" },
    { name: "Global Risk Appetite", score: 35, color: "#ff4d6d" },
    { name: "OI / Derivatives Sentiment", score: 44, color: "#ff4d6d" },
  ];

  // SVG ring for composite score
  const r = 52, circ = 2 * Math.PI * r;
  const filled = circ * (48 / 100);

  return (
    <div>
      {/* Signal Strip */}
      <div style={{ display: "flex", background: "#0d1219", border: "1px solid #1e2d3d", borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {stripItems.map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "10px 14px", borderRight: i < 4 ? "1px solid #1e2d3d" : "none" }}>
            <div style={{ fontFamily: "monospace", fontSize: "0.56rem", color: "#3d5268", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.cat}</div>
            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: s.color, margin: "3px 0" }}>{s.sig}</div>
            <div style={{ fontSize: "0.6rem", color: "#7a9bb5" }}>{s.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, marginBottom: 14 }}>
        {/* Composite Ring */}
        <Panel>
          <PanelHead>Overall Market Score</PanelHead>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0" }}>
            <svg width={130} height={130} viewBox="0 0 140 140">
              <circle cx={70} cy={70} r={r} fill="none" stroke="#1e2d3d" strokeWidth={10} />
              <circle cx={70} cy={70} r={r} fill="none" stroke="#f5a623" strokeWidth={10}
                strokeDasharray={circ} strokeDashoffset={circ - filled}
                strokeLinecap="round" transform="rotate(-90 70 70)" />
              <text x={70} y={68} textAnchor="middle" fill="#eef4fa" fontSize={28} fontFamily="Georgia,serif">48</text>
              <text x={70} y={84} textAnchor="middle" fill="#3d5268" fontSize={11} fontFamily="monospace">/100</text>
            </svg>
            <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#f5a623", marginTop: 4 }}>CAUTIOUSLY NEUTRAL</div>
            <div style={{ fontSize: "0.62rem", color: "#3d5268", fontFamily: "monospace", marginTop: 2 }}>Composite of 24 signals</div>
          </div>
        </Panel>

        {/* Module Scores */}
        <Panel>
          <PanelHead>Signal Module Scores</PanelHead>
          {scoreModules.map((m, i) => <SignalBar key={i} name={m.name} score={m.score} color={m.color} />)}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        {/* Fear Greed */}
        <Panel>
          <PanelHead>India Fear & Greed Index</PanelHead>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
            <svg width={180} height={100} viewBox="0 0 180 100">
              <defs>
                <linearGradient id="fg" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ff4d6d" />
                  <stop offset="50%" stopColor="#f5a623" />
                  <stop offset="100%" stopColor="#00c97a" />
                </linearGradient>
              </defs>
              <path d="M20,90 A70,70 0 0,1 160,90" fill="none" stroke="#1e2d3d" strokeWidth={16} strokeLinecap="round" />
              <path d="M20,90 A70,70 0 0,1 160,90" fill="none" stroke="url(#fg)" strokeWidth={16} strokeLinecap="round" strokeDasharray={220} strokeDashoffset={132} />
              <line x1={90} y1={90} x2={42} y2={38} stroke="#eef4fa" strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={90} cy={90} r={5} fill="#eef4fa" />
              <text x={90} y={78} textAnchor="middle" fill="#ff4d6d" fontSize={22} fontFamily="Georgia,serif">38</text>
            </svg>
            <div style={{ fontFamily: "monospace", fontSize: "0.6rem", color: "#3d5268", letterSpacing: "0.08em" }}>FEAR · FII OUTFLOW PRESSURE</div>
          </div>
        </Panel>

        {/* Breadth */}
        <Panel>
          <PanelHead>Market Breadth</PanelHead>
          <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={{ textAlign: "left", padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Indicator</th>
        <th style={{ textAlign: "left", padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Value</th>
        <th style={{ padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Signal</th>
      </tr>
    </thead>
    <tbody>
      {[["Advance/Decline","0.72",false],["% Above 50 DMA","38%",false],["% Above 200 DMA","52%",null],["New 52W Highs","41",null],["New 52W Lows","87",false]].map(([n,v,b],i)=>(
        <tr key={i}>
          <td style={{ padding: "6px 8px", color: "#c8dae8", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>{n}</td>
          <td style={{ padding: "6px 8px", color: "#c8dae8", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>{v}</td>
          <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>
            <Chip label={b===false?"WEAK/BEAR":b===true?"STRONG":"NEUTRAL"} bull={b}/>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
        </Panel>

        {/* Flows */}
        <Panel>
          <PanelHead>Fund Flow Signals (MTD)</PanelHead>
          <div style={{ overflowX: "auto" }}>
  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        <th style={{ textAlign: "left", padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Indicator</th>
        <th style={{ textAlign: "left", padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Value</th>
        <th style={{ padding: "5px 8px", color: "#3d5268", fontSize: "0.58rem", fontFamily: "monospace", borderBottom: "1px solid #1e2d3d" }}>Signal</th>
      </tr>
    </thead>
    <tbody>
      {[["Advance/Decline","0.72",false],["% Above 50 DMA","38%",false],["% Above 200 DMA","52%",null],["New 52W Highs","41",null],["New 52W Lows","87",false]].map(([n,v,b],i)=>(
        <tr key={i}>
          <td style={{ padding: "6px 8px", color: "#c8dae8", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>{n}</td>
          <td style={{ padding: "6px 8px", color: "#c8dae8", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>{v}</td>
          <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(30,45,61,0.4)" }}>
            <Chip label={b===false?"WEAK/BEAR":b===true?"STRONG":"NEUTRAL"} bull={b}/>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
        </Panel>
      </div>
    </div>
  );
}


// --- EQUITY TAB (FINAL FSD LOCK) ---
function EquityTab() {

  const techSignals = [
    ["RSI (14D)", "42.3", "Neutral – Approaching oversold", "WATCH", null],
    ["MACD", "-128", "Below signal line – bearish crossover", "SELL", false],
    ["50 DMA", "23,110", "Price below short-term trend", "BELOW", false],
    ["200 DMA", "23,400", "Below long-term trend – Caution", "BELOW", false],
    ["Bollinger Bands", "Lower Band", "Near band support zone", "WATCH", null],
    ["ADX", "28.4", "Strong trend strength (downtrend)", "DOWNTREND", false],
    ["Stochastic", "22 / 18", "%K below %D – oversold zone", "OVERSOLD", null],
    ["OBV Trend", "Declining", "Volume confirming selling", "CONFIRM", false],
  ];

  const supportResistance = [
    ["Strong Support", "22,500", "Previous consolidation base – low"],
    ["Immediate Support", "22,750", "50% Fibonacci retracement"],
    ["Immediate Resistance", "23,100", "50 DMA – breakdown zone"],
    ["Strong Resistance", "23,400", "200 DMA – critical reclaim level"],
  ];

  return (
    <div>

      {/* HEADER */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:12,color:"#7a9bb5",letterSpacing:1}}>
          NIFTY 50 — TECHNICAL & FUNDAMENTAL SIGNALS
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
        gap:12,
        marginBottom:14
      }}>
        <KPICard label="Nifty 50 LTP" value="22,913" sub="▼ 87 pts (0.38%) today" color="#ff4d6d"/>
        <KPICard label="VS 200 DMA" value="-2.1%" sub="200 DMA at 23,400 • Below" color="#ff4d6d"/>
        <KPICard label="P/E Ratio (TTM)" value="21.4×" sub="5Y avg 22.1× • Slightly cheap" color="#f5a623"/>
        <KPICard label="Earnings Growth (FY25E)" value="+14.2%" sub="Nifty EPS est. ₹1,071" color="#00c97a"/>
      </div>

      {/* TECHNICAL TABLE */}
      <Panel>
        <PanelHead>Technical Signal Scorecard</PanelHead>

        <div style={{
          display:"grid",
          gridTemplateColumns:"1fr 70px 1.5fr 100px",
          fontSize:12,
          color:"#7a9bb5",
          marginBottom:6
        }}>
          <div>Indicator</div>
          <div>Value</div>
          <div>Reading</div>
          <div>Signal</div>
        </div>

        {techSignals.map(([n,v,r,s,b],i)=>(
          <div key={i} style={{
            display:"grid",
            gridTemplateColumns:"1fr 70px 1.5fr 100px",
            padding:"8px 0",
            borderBottom:"1px solid rgba(30,45,61,0.3)",
            alignItems:"center"
          }}>
            <div>{n}</div>
            <div style={{fontFamily:"monospace"}}>{v}</div>
            <div style={{color:"#a9c3dc"}}>{r}</div>
            <div>
              <Chip label={s} bull={b}/>
            </div>
          </div>
        ))}
      </Panel>

      {/* SUPPORT / RESISTANCE */}
      <Panel>
        <PanelHead>Support / Resistance Levels</PanelHead>

        <div style={{
          display:"grid",
          gridTemplateColumns:"1fr 80px 1.6fr",
          fontSize:12,
          color:"#7a9bb5",
          marginBottom:6
        }}>
          <div>Level</div>
          <div>Price</div>
          <div>Significance</div>
        </div>

        {supportResistance.map(([n,v,d],i)=>(
          <div key={i} style={{
            display:"grid",
            gridTemplateColumns:"1fr 80px 1.6fr",
            padding:"8px 0",
            borderBottom:"1px solid rgba(30,45,61,0.3)"
          }}>
            <div>{n}</div>
            <div style={{
              fontFamily:"monospace",
              color: n.includes("Support") ? "#00c97a" : "#ff4d6d"
            }}>{v}</div>
            <div style={{color:"#a9c3dc"}}>{d}</div>
          </div>
        ))}
      </Panel>

      {/* FUNDAMENTAL SIGNALS */}
      <Panel>
        <PanelHead>Fundamental Signals</PanelHead>
        {[
          ["Earnings Momentum",68,"#00c97a"],
          ["Valuation (P/E)",62,"#f5a623"],
          ["Revenue Growth",55,"#f5a623"],
          ["Margin Expansion",48,"#ff4d6d"],
          ["Credit Growth",60,"#00c97a"],
          ["GST Collections",72,"#00c97a"],
          ["IIP / PMI",58,"#f5a623"]
        ].map(([n,s,c],i)=>(
          <SignalBar key={i} name={n} score={s} color={c}/>
        ))}
      </Panel>

      {/* KEY MACRO */}
      <Panel>
        <PanelHead>Key Macro Numbers</PanelHead>
        {[
          ["CPI Inflation","4.8%","STICKY"],
          ["GDP Growth (FY25E)","6.8%","STRONG"],
          ["GST Collections","₹1.87L Cr","RECORD"],
          ["India PMI Mfg","58.8","EXPANSION"],
          ["Fiscal Deficit","5.1% GDP","INLINE"]
        ].map(([n,v,s],i)=>(
          <div key={i} style={{
            display:"flex",
            justifyContent:"space-between",
            padding:"6px 0",
            borderBottom:"1px solid rgba(30,45,61,0.3)"
          }}>
            <span style={{color:"#7a9bb5"}}>{n}</span>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontFamily:"monospace"}}>{v}</span>
              <Chip label={s}/>
            </div>
          </div>
        ))}
      </Panel>

      {/* FUND FLOW */}
      <Panel>
        <PanelHead>Fund Flow Signals (MTD)</PanelHead>
        {[
          ["FII Equity","-₹8,420 Cr",false],
          ["DII Equity","+₹11,340 Cr",true],
          ["MF SIP","+₹19,800 Cr",true],
          ["FII Futures","-₹5,610 Cr",false],
          ["FII Debt","+₹3,210 Cr",true]
        ].map(([n,v,b],i)=>(
          <div key={i} style={{
            display:"flex",
            justifyContent:"space-between",
            padding:"6px 0",
            borderBottom:"1px solid rgba(30,45,61,0.3)"
          }}>
            <span style={{color:"#7a9bb5"}}>{n}</span>
            <div style={{display:"flex",gap:8}}>
              <span style={{fontFamily:"monospace"}}>{v}</span>
              <Chip label={b ? "BUY" : "SELL"} bull={b}/>
            </div>
          </div>
        ))}
      </Panel>

    </div>
  );
}// ── SECTOR TAB ──
function SectorTab() {
  const hmColors = {
    sb: { bg:"rgba(0,201,122,0.25)", color:"#00c97a", border:"rgba(0,201,122,0.35)" },
    b:  { bg:"rgba(0,201,122,0.12)", color:"#5dd9a0", border:"rgba(0,201,122,0.18)" },
    n:  { bg:"rgba(122,155,181,0.1)", color:"#7a9bb5", border:"rgba(122,155,181,0.18)" },
    be: { bg:"rgba(255,77,109,0.12)", color:"#ff8fa3", border:"rgba(255,77,109,0.18)" },
    sbe:{ bg:"rgba(255,77,109,0.25)", color:"#ff4d6d", border:"rgba(255,77,109,0.35)" },
  };

  return (
    <div>
      <Panel style={{ marginBottom: 14 }}>
        <PanelHead>Sector Performance & Signal Heatmap — MTD Returns + Relative Strength</PanelHead>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginTop:10 }}>
          {SECTOR_DATA.map((s,i)=>{
            const c = hmColors[s.cls];
            return (
              <div key={i} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:5, padding:"10px 12px", cursor:"default" }}>
                <div style={{ fontSize:"0.62rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:c.color }}>{s.name}</div>
                <div style={{ fontFamily:"monospace", fontSize:"0.78rem", color:c.color, margin:"3px 0" }}>{s.ret > 0 ? "+" : ""}{s.ret}%</div>
                <div style={{ fontSize:"0.6rem", color:c.color, opacity:0.8 }}>{s.signal}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Panel>
          <PanelHead>Rotation Clock — Phase & Recommendation</PanelHead>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.7rem" }}>
            <thead><tr>
              {["Sector","Phase","RS vs Nifty","Rec"].map(h=>(
                <th key={h} style={{ textAlign:"left", padding:"5px 8px", color:"#3d5268", fontSize:"0.58rem", fontFamily:"monospace", borderBottom:"1px solid #1e2d3d" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[
                ["FMCG","LEADING","+6.2%",true,"OW"],
                ["IT","IMPROVING","+3.1%",true,"OW"],
                ["Pharma","LEADING","+2.8%",true,"OW"],
                ["Pvt Banks","WEAKENING","−0.4%",null,"EW"],
                ["Auto","LAGGING","−1.8%",null,"EW"],
                ["Cap Goods","LAGGING","−3.4%",false,"UW"],
                ["Real Estate","LAGGING","−5.1%",false,"UW"],
              ].map(([n,ph,rs,b,rec],i)=>(
                <tr key={i}>
                  <td style={{ padding:"6px 8px", color:"#c8dae8", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{n}</td>
                  <td style={{ padding:"6px 8px", borderBottom:"1px solid rgba(30,45,61,0.4)" }}><Chip label={ph} bull={b}/></td>
                  <td style={{ padding:"6px 8px", color: b===true?"#00c97a":b===false?"#ff4d6d":"#f5a623", fontFamily:"monospace", fontSize:"0.68rem", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{rs}</td>
                  <td style={{ padding:"6px 8px", borderBottom:"1px solid rgba(30,45,61,0.4)" }}><Chip label={rec} bull={b}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel>
          <PanelHead>Smart Money Sector Flow (MTD, ₹ Cr)</PanelHead>
          {[["FMCG",80,"#00c97a","+4,210"],["IT",65,"#00c97a","+3,420"],["Pharma",55,"#00c97a","+2,880"],["Pvt Banks",30,"#f5a623","−820"],["Cap Goods",40,"#ff4d6d","−2,140"],["Real Estate",55,"#ff4d6d","−3,610"],["Metals",48,"#ff4d6d","−2,980"]].map(([n,s,c,v],i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <div style={{ fontSize:"0.68rem", color:"#7a9bb5", width:90, flexShrink:0 }}>{n}</div>
              <div style={{ flex:1, height:5, background:"#080c10", borderRadius:3 }}>
                <div style={{ width:`${s}%`, height:"100%", borderRadius:3, background:c }} />
              </div>
              <div style={{ fontFamily:"monospace", fontSize:"0.62rem", color:c, width:52, textAlign:"right" }}>{v}</div>
            </div>
          ))}
          <div style={{ borderTop:"1px solid #1e2d3d", marginTop:14, paddingTop:12 }}>
            <PanelHead>Thematic Signals Active</PanelHead>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
              {[["Export IT Tailwind",true],["Pharma US Generics",true],["FMCG Rural Recovery",true],["Banking NIM Compression",null],["Capex Cycle Pause",false],["China Metal Demand",false]].map(([t,b],i)=>(
                <span key={i} style={{
                  padding:"3px 8px", borderRadius:3, fontSize:"0.6rem", fontWeight:700,
                  fontFamily:"monospace",
                  background: b===true?"rgba(0,201,122,0.12)":b===false?"rgba(255,77,109,0.12)":"rgba(245,166,35,0.12)",
                  color: b===true?"#00c97a":b===false?"#ff4d6d":"#f5a623",
                  border: `1px solid ${b===true?"rgba(0,201,122,0.25)":b===false?"rgba(255,77,109,0.25)":"rgba(245,166,35,0.25)"}`
                }}>{t}</span>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ── DEBT TAB ──
function DebtTab() {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap:12, marginBottom:14 }}>
        <KPICard label="RBI Repo Rate" value="6.25%" sub="Cut 25bps Feb 2025 · Easing cycle" color="#00c97a" />
        <KPICard label="10Y G-Sec Yield" value="6.91%" sub="▼ 3bps · Softening gradually" color="#f5a623" />
        <KPICard label="Yield Curve" value="Normal" sub="10Y − 2Y spread: +42bps" color="#00c97a" />
        <KPICard label="Real Rate" value="+2.1%" sub="Repo 6.25% − CPI 4.8%" color="#f5a623" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap:12 }}>
        <Panel>
          <PanelHead>India G-Sec Yield Curve</PanelHead>
          <svg width="100%" height={110} viewBox="0 0 500 110" preserveAspectRatio="none" style={{ marginTop:10 }}>
            <defs>
              <linearGradient id="ycGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00d4aa" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#00d4aa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <line x1={0} y1={100} x2={500} y2={100} stroke="#1e2d3d" strokeWidth={1} />
            <polyline points="0,88 80,80 160,72 240,64 320,58 400,53 500,48" fill="none" stroke="#00d4aa" strokeWidth={2.5} />
            <polygon points="0,88 80,80 160,72 240,64 320,58 400,53 500,48 500,100 0,100" fill="url(#ycGrad)" />
            {[[0,88,"3M"],[80,80,"6M"],[160,72,"1Y"],[240,64,"3Y"],[320,58,"5Y"],[400,53,"7Y"],[500,48,"10Y"]].map(([x,y,l],i)=>(
              <g key={i}>
                <circle cx={x} cy={y} r={4} fill="#00d4aa" />
                <text x={x} y={112} textAnchor="middle" fill="#3d5268" fontSize={10} fontFamily="monospace">{l}</text>
              </g>
            ))}
          </svg>

          <div style={{ borderTop:"1px solid #1e2d3d", marginTop:18, paddingTop:14 }}>
            <PanelHead>Rate Signal Matrix</PanelHead>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.7rem" }}>
              <thead><tr>
                {["Signal","Reading","Implication","Bond Signal"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"5px 8px", color:"#3d5268", fontSize:"0.58rem", fontFamily:"monospace", borderBottom:"1px solid #1e2d3d" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[
                  ["RBI Policy","Accommodative","Rate cuts likely H1 FY26","RALLY",true],
                  ["Inflation","4.8% → 4.3%E","Softening · Supports cuts","POSITIVE",true],
                  ["Fiscal Supply","₹14.82L Cr FY26","Heavy supply · Yield ceiling","WATCH",null],
                  ["JP Morgan GBI-EM","India Included","FII inflows into bonds","INFLOW",true],
                  ["USD/INR","84.42","Stable · EM bond positive","NEUTRAL",null],
                ].map(([s,r,imp,sig,b],i)=>(
                  <tr key={i}>
                    <td style={{ padding:"6px 8px", color:"#c8dae8", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{s}</td>
                    <td style={{ padding:"6px 8px", color:"#7a9bb5", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r}</td>
                    <td style={{ padding:"6px 8px", color:"#7a9bb5", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{imp}</td>
                    <td style={{ padding:"6px 8px", borderBottom:"1px solid rgba(30,45,61,0.4)" }}><Chip label={sig} bull={b}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <PanelHead>Debt Category Recommendations</PanelHead>
          {[
            ["Long Duration / Gilt","OVERWEIGHT",true,"Rate cut cycle underway · Duration play · 3–5Y horizon"],
            ["Corporate Bond Funds","OVERWEIGHT",true,"High quality AA/AAA · Carry + potential capital gains"],
            ["Liquid / Overnight","NEUTRAL",null,"Park short-term surplus · Rates still reasonable"],
            ["Credit Risk Funds","UNDERWEIGHT",false,"Default risk elevated in lower-rated paper · Avoid"],
          ].map(([name, label, bull, desc], i) => (
            <div key={i} style={{
              background:"#0d1219", border:`1px solid ${bull===true?"rgba(0,201,122,0.2)":bull===false?"rgba(255,77,109,0.2)":"rgba(245,166,35,0.2)"}`,
              borderRadius:5, padding:12, marginBottom:10
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                <div style={{ fontSize:"0.72rem", fontWeight:700, color:"#eef4fa" }}>{name}</div>
                <Chip label={label} bull={bull} />
              </div>
              <div style={{ fontSize:"0.65rem", color:"#7a9bb5" }}>{desc}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ── GLOBAL TAB ──
function GlobalTab() {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap:12, marginBottom:14 }}>
        <KPICard label="US Fed Funds Rate" value="5.25%" sub="Hold · 1 cut priced Dec 2025" color="#f5a623" />
        <KPICard label="DXY (Dollar Index)" value="104.8" sub="Firm · EM headwind" color="#f5a623" />
        <KPICard label="Brent Crude" value="$82.4" sub="OPEC+ cuts · Inflation risk" color="#f5a623" />
        <KPICard label="Gold Spot" value="₹88,240" sub="▲ All-time high · Safe haven" color="#00c97a" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Panel>
          <PanelHead>Global Signal Dashboard — India Impact</PanelHead>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.7rem" }}>
            <thead><tr>
              {["Factor","Status","India Impact","Signal"].map(h=>(
                <th key={h} style={{ textAlign:"left", padding:"5px 8px", color:"#3d5268", fontSize:"0.58rem", fontFamily:"monospace", borderBottom:"1px solid #1e2d3d" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {GLOBAL_DATA.map((r,i)=>(
                <tr key={i}>
                  <td style={{ padding:"6px 8px", color:"#c8dae8", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.factor}</td>
                  <td style={{ padding:"6px 8px", color:"#7a9bb5", fontSize:"0.65rem", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.status}</td>
                  <td style={{ padding:"6px 8px", color:"#7a9bb5", fontSize:"0.65rem", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.impact}</td>
                  <td style={{ padding:"6px 8px", borderBottom:"1px solid rgba(30,45,61,0.4)" }}><Chip label={r.sig} bull={r.bull}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel>
          <PanelHead>India ↔ Global Transmission Map</PanelHead>
          {[
            { label:"🔴 HEADWINDS", color:"#ff4d6d", bg:"rgba(255,77,109,0.08)", border:"rgba(255,77,109,0.2)",
              lines:["Fed holding rates → EM outflows → FII selling Indian equities","Strong DXY → INR under pressure → imported inflation","High crude ($80+) → India CAD widens → macro stress"] },
            { label:"🟢 TAILWINDS", color:"#00c97a", bg:"rgba(0,201,122,0.08)", border:"rgba(0,201,122,0.2)",
              lines:["Gold ATH → Indian gold ETF/SGB demand surge","JP Morgan GBI-EM inclusion → structural bond inflows","Strong India GDP vs weak EM peers → relative outperformance"] },
            { label:"🟡 WATCH", color:"#f5a623", bg:"rgba(245,166,35,0.08)", border:"rgba(245,166,35,0.2)",
              lines:["China slowdown → metals/infra sector spillover","Fed pivot timing → key trigger for EM rally resumption","US election risk → uncertainty in global risk appetite"] },
          ].map((s,i)=>(
            <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:5, padding:12, marginBottom:10 }}>
              <div style={{ fontSize:"0.6rem", fontWeight:700, color:s.color, letterSpacing:"0.08em", marginBottom:6 }}>{s.label}</div>
              {s.lines.map((l,j)=>(
                <div key={j} style={{ fontSize:"0.68rem", color:"#7a9bb5", lineHeight:1.7 }}>{l}</div>
              ))}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ── OI VIX TAB ──
function OiVixTab() {
  return (
    <div>
      <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap:12, marginBottom:14 }}>
        <KPICard label="India VIX" value="13.42" sub="▲ Rising · Moderate-elevated fear" color="#f5a623" />
        <KPICard label="Nifty PCR (OI)" value="0.82" sub="Below 1 → Bearish bias" color="#f5a623" />
        <KPICard label="Total Nifty OI" value="₹1.84L Cr" sub="▲ 8.2% WoW · Rising with fall" color="#ff4d6d" />
        <KPICard label="Max Pain (Weekly)" value="23,000" sub="Price 913 pts below max pain" color="#e8b84b" />
      </div>

      <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap:12 }}>
        <Panel>
          <PanelHead>Derivatives Signal Interpretation</PanelHead>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.7rem" }}>
            <thead><tr>
              {["Signal","Value","What It Means","View"].map(h=>(
                <th key={h} style={{ textAlign:"left", padding:"5px 8px", color:"#3d5268", fontSize:"0.58rem", fontFamily:"monospace", borderBottom:"1px solid #1e2d3d" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {OI_SIGNALS.map((r,i)=>(
                <tr key={i}>
                  <td style={{ padding:"6px 8px", color:"#c8dae8", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.name}</td>
                  <td style={{ padding:"6px 8px", color:"#eef4fa", fontFamily:"monospace", fontSize:"0.65rem", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.val}</td>
                  <td style={{ padding:"6px 8px", color:"#7a9bb5", fontSize:"0.65rem", borderBottom:"1px solid rgba(30,45,61,0.4)" }}>{r.meaning}</td>
                  <td style={{ padding:"6px 8px", borderBottom:"1px solid rgba(30,45,61,0.4)" }}><Chip label={r.sig} bull={r.bull}/></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop:"1px solid #1e2d3d", marginTop:14, paddingTop:12 }}>
            <PanelHead>Options OI Build — Strike-wise (Weekly Expiry)</PanelHead>
            {[["24,000 CE","Call Wall (Resistance)",18,"#ff4d6d"],["23,500 CE","High OI Resistance",38,"#ff4d6d"],["23,000 PE","Put Support",72,"#00c97a"],["22,500 PE","Strong Base / Max Support",88,"#00c97a"]].map(([s,l,pct,c],i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                <div style={{ fontFamily:"monospace", fontSize:"0.65rem", color:"#7a9bb5", width:80, flexShrink:0 }}>{s}</div>
                <div style={{ flex:1, height:5, background:"#080c10", borderRadius:3 }}>
                  <div style={{ width:`${pct}%`, height:"100%", borderRadius:3, background:c }} />
                </div>
                <div style={{ fontSize:"0.62rem", color:c, width:120, textAlign:"right" }}>{l}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHead>VIX Regime & Strategy Guide</PanelHead>
          {[
            { range:"VIX < 12", label:"LOW FEAR", color:"#00c97a", bg:"rgba(0,201,122,0.08)", border:"rgba(0,201,122,0.2)", active:false,
              text:"Trend following · Momentum long · Buy dips · Low hedging needed" },
            { range:"VIX 12–18", label:"CURRENT ZONE ← YOU ARE HERE", color:"#f5a623", bg:"rgba(245,166,35,0.1)", border:"rgba(245,166,35,0.3)", active:true,
              text:"Staggered entry · SIP preferred · Hedge 30–40% portfolio · Avoid leverage" },
            { range:"VIX 18–25", label:"HIGH FEAR", color:"#ff9c42", bg:"rgba(255,156,66,0.08)", border:"rgba(255,156,66,0.2)", active:false,
              text:"Contrarian buy zone · Lumpsum deployment · Quality stocks · Cover shorts" },
            { range:"VIX > 25", label:"PANIC / CRISIS", color:"#ff4d6d", bg:"rgba(255,77,109,0.08)", border:"rgba(255,77,109,0.2)", active:false,
              text:"Aggressive lumpsum · Multi-year opportunity · Maximum deployment zone" },
          ].map((v,i)=>(
            <div key={i} style={{ background:v.bg, border:`${v.active?"2px":"1px"} solid ${v.border}`, borderRadius:5, padding:12, marginBottom:10 }}>
              <div style={{ fontSize:"0.6rem", fontWeight:700, color:v.color, letterSpacing:"0.08em", marginBottom:4 }}>{v.range} — {v.label}</div>
              <div style={{ fontSize:"0.65rem", color:"#7a9bb5" }}>{v.text}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

// ── NARRATIVE TAB ──
function NarrativeTab() {
  const [audience, setAudience] = useState("IFA Advisory Pitch");
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const audiences = ["IFA Advisory Pitch","HNI Investment Committee Memo","Retail Investor Weekly Update","Internal Research Desk Note"];

  const signalPayload = `COMPOSITE SCORE: 48/100 — Cautiously Neutral (composite of 24 signals)
EQUITY TECHNICAL: Nifty 50 at 22,913. Below 50 DMA (23,110) and 200 DMA (23,400). RSI 42.3 (neutral-approaching oversold). MACD bearish crossover. ADX 28.4 showing downtrend. Bollinger bands near lower band. A/D ratio 0.72. Only 38% of stocks above 50 DMA.
FUNDAMENTALS: Nifty P/E 21.4x vs 5Y avg 22.1x — mildly cheap. FY25E earnings growth 14.2%. India GDP 6.8%. CPI 4.8%. PMI Manufacturing 58.8 (expansion). GST collections ₹1.87L Cr (record). Fiscal deficit 5.1% of GDP.
SECTOR ROTATION: Defensive rotation underway. FMCG +4.2% (Strong Buy), IT +2.8% (Buy), Pharma +2.1% (Buy). Capital Goods and Real Estate underperforming. Smart money rotating from growth/cyclical to defensive/export-oriented.
DEBT & RATES: RBI repo 6.25% — easing cycle started Feb 2025. 10Y G-Sec at 6.91% (softening). Normal yield curve (+42bps spread). Real rate +2.1%. JP Morgan GBI-EM inclusion driving structural bond inflows.
GLOBAL MACRO: US Fed 5.25% hawkish hold — 1 cut priced Dec 2025. DXY 104.8 (firm, EM headwind). Brent $82.4. Gold ATH ₹88,240. China PMI 49.2 (contraction). EM MSCI outflows $4.2B.
FUND FLOWS: FII equity MTD −₹8,420Cr. DII equity +₹11,340Cr. MF SIP inflows ₹19,800Cr. FII futures net short −₹5,610Cr. FII debt +₹3,210Cr.
DERIVATIVES/OI/VIX: India VIX 13.42 rising. PCR (OI) 0.82 — bearish bias. Rising OI with falling price = fresh shorts. Max pain 23,000. FII net short in index futures. IV 14.2% > realized vol.
FEAR & GREED: India Fear & Greed at 38 — FEAR zone. Breadth weak. 52W lows (87) > highs (41).`;

  async function generate() {
    setLoading(true);
    setError(null);
    setNarrative(null);

    const systemPrompt = `You are a senior equity strategist at a top Indian wealth management firm. Synthesize macro, technical, fundamental, sectoral, derivatives, and global signals into clear, actionable market intelligence. Write for a ${audience}. 

Return ONLY a JSON object — no markdown, no backticks, no preamble — with this exact structure:
{"verdict":"2-3 sentence headline view","signals":"paragraph synthesizing macro + technical + flow signals into a coherent story","sectors":"paragraph on sector rotation and smart money flow","global":"paragraph on how global factors transmit into India","risks":"paragraph listing 3-4 key risks","action":"paragraph with specific graded recommendations for ${audience}s — what to do, avoid, and watch"}

Use specific numbers from the data. Be direct and authoritative.`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: "user", content: `Signal data as of April 26, 2025:\n${signalPayload}\n\nAudience: ${audience}` }]
        })
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const raw = data.content.map(b => b.text || "").join("").replace(/```json?|```/gi,"").trim();
      const parsed = JSON.parse(raw);
      setNarrative(parsed);
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const sections = narrative ? [
    { title: "Market Verdict", content: narrative.verdict, color: "#f5a623" },
    { title: "What the Signals Are Telling Us", content: narrative.signals, color: "#00d4aa" },
    { title: "Where the Money Is Moving", content: narrative.sectors, color: "#9b6dff" },
    { title: "Global Context", content: narrative.global, color: "#0099ff" },
    { title: "Risk Factors to Watch", content: narrative.risks, color: "#ff4d6d" },
    { title: `Actionable Outlook — ${audience}`, content: narrative.action, color: "#00c97a" },
  ] : [];

  const contextItems = [
    ["Market Score","48/100 — Cautiously Neutral"],["Nifty vs 200DMA","−2.1% (Below)"],["India VIX","13.42 — Rising"],
    ["FII MTD Flow","−₹8,420 Cr (Selling)"],["DII MTD Flow","+₹11,340 Cr (Buying)"],["PCR (OI)","0.82 — Bearish Bias"],
    ["Top Sectors","FMCG, IT, Pharma"],["RBI Rate","6.25% — Easing Cycle"],["US Fed","5.25% — Hawkish Hold"],
    ["Gold","₹88,240 — All-Time High"],["Crude","$82.4 — Stable"],["10Y G-Sec","6.91% — Softening"],
  ];

  return (
    <div>
      {/* Signal snapshot */}
      <Panel style={{ marginBottom:14 }}>
        <PanelHead>Signal Snapshot — Inputs Being Fed to AI Engine</PanelHead>
        <div style={{ display:"grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap:10, marginTop:6 }}>
          {contextItems.map(([l,v],i)=>(
            <div key={i}>
              <div style={{ fontFamily:"monospace", fontSize:"0.58rem", color:"#3d5268", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }}>{l}</div>
              <div style={{ fontSize:"0.72rem", color:"#eef4fa", fontWeight:600 }}>{v}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Audience selector */}
      <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
        {audiences.map(a=>(
          <button key={a} onClick={()=>setAudience(a)} style={{
            padding:"6px 14px", borderRadius:3, border:`1px solid ${a===audience?"#00d4aa":"#1e2d3d"}`,
            background: a===audience?"rgba(0,212,170,0.1)":"transparent",
            color: a===audience?"#00d4aa":"#3d5268",
            fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase",
            cursor:"pointer", fontFamily:"monospace"
          }}>{a}</button>
        ))}
      </div>

      {/* AI Panel */}
      <div style={{ background:"#0d1219", border:"1px solid #1e2d3d", borderRadius:8, padding:"24px 28px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"#00d4aa", fontFamily:"monospace" }}>
            <span style={{ fontSize:"1rem" }}>◈</span>
            AI Market Intelligence Narrative — <span style={{ color:"#7a9bb5" }}>{audience}</span>
          </div>
          <button onClick={generate} disabled={loading} style={{
            background: loading?"rgba(0,212,170,0.05)":"rgba(0,212,170,0.1)",
            border:"1px solid #00d4aa", color:"#00d4aa",
            padding:"8px 20px", borderRadius:4, fontFamily:"Syne,sans-serif",
            fontSize:"0.72rem", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase",
            cursor: loading?"not-allowed":"pointer", opacity: loading?0.6:1
          }}>
            {loading ? "Generating…" : narrative ? "Regenerate" : "Generate Narrative"}
          </button>
        </div>

        {!narrative && !loading && !error && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:140, color:"#3d5268", gap:8 }}>
            <div style={{ fontSize:"2rem", opacity:0.3 }}>◈</div>
            <div style={{ fontFamily:"monospace", fontSize:"0.72rem" }}>Select audience format above, then click Generate Narrative</div>
            <div style={{ fontFamily:"monospace", fontSize:"0.6rem", color:"#1e2d3d" }}>AI will synthesize all 24 signal inputs into a structured market outlook</div>
          </div>
        )}

        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:10, padding:"20px 0", color:"#3d5268", fontFamily:"monospace", fontSize:"0.72rem" }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"#00d4aa", animation:"pulse 1s infinite" }} />
            Synthesizing 24 signal inputs into market narrative…
          </div>
        )}

        {error && (
          <div style={{ background:"rgba(245,166,35,0.08)", border:"1px solid rgba(245,166,35,0.2)", borderRadius:5, padding:16 }}>
            <div style={{ fontSize:"0.65rem", fontWeight:700, color:"#f5a623", letterSpacing:"0.08em", marginBottom:8 }}>API CONNECTION NOTE</div>
            <div style={{ fontFamily:"monospace", fontSize:"0.72rem", color:"#7a9bb5", lineHeight:1.8 }}>
              Unable to reach Anthropic API ({error}). In a deployed version with API access, this button calls <span style={{ color:"#00d4aa" }}>api.anthropic.com/v1/messages</span> with all 24 signal data points and generates a live, structured market narrative tailored to the selected audience format.<br/><br/>
              The signal snapshot panel above shows exactly what would be sent as the prompt payload.
            </div>
          </div>
        )}

        {narrative && sections.map((s,i)=>(
          <div key={i} style={{ marginBottom:20 }}>
            <div style={{ fontSize:"0.6rem", fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:s.color, marginBottom:8, fontFamily:"monospace" }}>{s.title}</div>
            <div style={{ fontFamily:"Georgia, serif", fontSize:"0.95rem", lineHeight:1.82, color:"#c8dae8" }}>{s.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TICKER DATA ──
const tickers = [
  { name:"NIFTY50", val:"22,913", chg:"▼ 0.38%", bull:false },
  { name:"SENSEX", val:"75,418", chg:"▼ 0.31%", bull:false },
  { name:"VIX", val:"13.42", chg:"▲ 4.1%", bull:true },
  { name:"DXY", val:"104.8", chg:"— 0.02%", bull:null },
  { name:"GOLD", val:"₹88,240", chg:"▲ 1.2%", bull:true },
  { name:"BRENT", val:"$82.4", chg:"▼ 0.6%", bull:false },
  { name:"10Y GSEC", val:"6.91%", chg:"▼ 3bps", bull:false },
];

const TABS = [
  { id:"overview", label:"Market Overview", Component: OverviewTab },
  { id:"equity",   label:"Equity Signals",  Component: EquityTab },
  { id:"sector",   label:"Sector Rotation", Component: SectorTab },
  { id:"debt",     label:"Debt & Rates",    Component: DebtTab },
  { id:"global",   label:"Global Macro",    Component: GlobalTab },
  { id:"oivix",    label:"OI & VIX",        Component: OiVixTab },
  { id:"narrative",label:"◈ AI Narrative",  Component: NarrativeTab },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString("en-IN", { hour12:false }) + " IST");
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.Component;

  return (
    <div style={{
  background:"#080c10",
  minHeight:"100vh",
  color:"#c8dae8",
  fontFamily:"Syne, sans-serif",
  overflowX:"hidden"
}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:#0d1219; }
        ::-webkit-scrollbar-thumb { background:#1e2d3d; border-radius:2px; }
        @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,201,122,0.5)} 50%{opacity:0.7;box-shadow:0 0 0 6px rgba(0,201,122,0)} }
      `}</style>

      {/* TOP BAR */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"rgba(8,12,16,0.97)", borderBottom:"1px solid #1e2d3d", padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", height:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontFamily:"monospace", fontSize:"0.72rem", letterSpacing:"0.12em", color:"#00d4aa", textTransform:"uppercase" }}>
            Market<span style={{ color:"#3d5268" }}>/</span>DSS <span style={{ color:"#3d5268" }}>· IFA Signal Console</span>
          </div>
          <div style={{ width:1, height:22, background:"#1e2d3d" }} />
          <div style={{ display:"flex", gap:16 }}>
            {tickers.map((t,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:5, fontFamily:"monospace", fontSize:"0.66rem" }}>
                <span style={{ color:"#3d5268" }}>{t.name}</span>
                <span style={{ color:"#eef4fa", fontWeight:600 }}>{t.val}</span>
                <span style={{ color: t.bull===true?"#00c97a":t.bull===false?"#ff4d6d":"#7a9bb5", fontSize:"0.62rem" }}>{t.chg}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:"#00c97a", animation:"pulse 2s infinite" }} />
          <div style={{ fontFamily:"monospace", fontSize:"0.62rem", color:"#3d5268" }}>LIVE</div>
          <div style={{ width:1, height:20, background:"#1e2d3d" }} />
          <div style={{ fontFamily:"monospace", fontSize:"0.62rem", color:"#3d5268" }}>{clock}</div>
        </div>
      </div>

      {/* NAV */}
      <div style={{ display:"flex", gap:2, padding:"0 20px", background:"#0d1219", borderBottom:"1px solid #1e2d3d", overflowX:"auto" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"10px 16px", fontSize:"0.65rem", fontWeight:700,
            letterSpacing:"0.07em", textTransform:"uppercase",
            color: t.id===activeTab?"#00d4aa":"#3d5268",
            borderBottom: `2px solid ${t.id===activeTab?"#00d4aa":"transparent"}`,
            background:"transparent", border:"none", borderBottom: `2px solid ${t.id===activeTab?"#00d4aa":"transparent"}`,
            cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.2s", fontFamily:"Syne,sans-serif"
          }}>{t.label}</button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding:"20px 20px 48px" }}>
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}
