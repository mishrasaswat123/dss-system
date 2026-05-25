/*
VERSION: MVP-7-D21-STABLE (ADVISORY + NARRATIVE COMPLETE — ZERO REGRESSION)
*/

const express = require("express");
const fetch = require("node-fetch");
const app = express();
app.use(express.json());
// const { getLiveSignals } = require("../data-engine/liveDataEngine");

const VERSION = "MVP-7-D21-STABLE";
const DEFAULT_SIGNALS = {
  rates: "neutral",
  crude: "falling",
  fii: "buying",
  liquidity: "supportive",
  vix: "low",
  trend: "neutral"
};
const RELEASE_TAG = "D21-STABLE-BASELINE";

/* =========================
   EXISTING STATE (UNCHANGED)
========================= */

let lastCrudeSignal = "falling";
let lastVixSignal = "low";
let regimeHistory = [];

/* =========================
   NEW STATE (ADDITIVE ONLY)
========================= */

let portfolioState = {
  activePositions: [],
  totalPnL: 0,
  lastUpdate: null
};

let signalReliability = {
  rates: 1,
  liquidity: 1,
  crude: 1,
  fii: 1,
  vix: 1,
  trend: 1
};
const SIGNAL_REGISTRY = {
  rates: { weight: 0.2, scorer: v => (v === "falling" ? 1 : -1), intensity: () => 1 },
  liquidity: { weight: 0.2, scorer: v => (v === "supportive" ? 1 : -1), intensity: () => 1.2 },
  crude: { weight: 0.15, scorer: v => (v === "falling" ? 1 : -1), intensity: () => 1.1 },
  fii: { weight: 0.2, scorer: v => (v === "buying" ? 1 : -1), intensity: () => 1.3 },
  vix: { weight: 0.15, scorer: v => (v === "low" ? 1 : -1), intensity: () => 1.2 },
  trend: { weight: 0.1, scorer: v => (v === "bullish" ? 1 : -1), intensity: () => 1.5 }
};

async function safeFetch(url, timeout = 2000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchCrude() {
  const data = await safeFetch("https://api.api-ninjas.com/v1/commodities?name=crude_oil");
  return data?.[0]?.price || null;
}

async function fetchVix() {
  const data = await safeFetch("https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EVIX");
  return data?.quoteResponse?.result?.[0]?.regularMarketPrice || null;
}

function interpretCrude(price, last) {
  if (!price) return last;
  return price > 80 ? "rising" : "falling";
}

function interpretVix(vix, last) {
  if (!vix) return last;
  return vix > 18 ? "high" : "low";
}

async function autoFillInputs(body) {
  body = body || {};

  const crudePrice = await fetchCrude();
  const vixValue = await fetchVix();

  const crudeSignal = interpretCrude(crudePrice, lastCrudeSignal);
  const vixSignal = interpretVix(vixValue, lastVixSignal);

  if (crudeSignal) lastCrudeSignal = crudeSignal;
  if (vixSignal) lastVixSignal = vixSignal;

  return {
  rates: body.rates || DEFAULT_SIGNALS.rates,
  crude: crudeSignal || DEFAULT_SIGNALS.crude,
  fii: body.fii || DEFAULT_SIGNALS.fii,
  liquidity: body.liquidity || DEFAULT_SIGNALS.liquidity,
  vix: vixSignal || DEFAULT_SIGNALS.vix,
  trend: body.autoTrend
    ? "bullish"
    : body.trend || DEFAULT_SIGNALS.trend,
liveData: {
  crudePrice,
  vixValue
}
};
}

function getAdaptiveMultiplier(signal, regime) {
  let m = 1;

  if (regime.includes("RISK ON")) {
    if (signal === "trend" || signal === "fii") m = 1.1;
    if (signal === "vix") m = 0.95;
  }

  if (regime.includes("RISK OFF")) {
    if (signal === "vix" || signal === "liquidity") m = 1.1;
    if (signal === "trend") m = 0.9;
  }

  return m;
}

function buildSignals(inputs, regime = "NEUTRAL") {
  const signals = {};
  let composite = 0;

  for (const key in SIGNAL_REGISTRY) {
    const config = SIGNAL_REGISTRY[key];
    const baseWeight = config.weight;
    const weight = baseWeight * getAdaptiveMultiplier(key, regime);
    const score = config.scorer(inputs[key]);

    signals[key] = {
      value: inputs[key],
      score,
      weight,
      baseWeight,
      reliability: signalReliability[key],
      strength: Math.abs(score) === 1 ? "strong" : "neutral"
    };

    composite += score * weight * 100;
  }

  return { signals, compositeScore: Math.round(composite) };
}
function getRegime(score) {
  if (score >= 70) return "STRONG RISK ON";
  if (score >= 55) return "RISK ON";
  if (score >= 45) return "NEUTRAL";
  if (score >= 30) return "RISK OFF";
  return "STRONG RISK OFF";
}

function getConfidence(signals) {
  const positives = Object.values(signals).filter(s => s.score === 1).length;
  return Math.round((positives / Object.keys(signals).length) * 100);
}

function getMarketQuality(confidence) {
  if (confidence >= 70) return "STRONG";
  if (confidence >= 50) return "MODERATE";
  return "WEAK";
}

function getSectorAllocation(regime) {
  if (regime === "STRONG RISK ON") return { NBFC: 35, PSU_BANK: 35, IT: 20, FMCG: 10 };
  if (regime === "RISK ON") return { NBFC: 30, PSU_BANK: 30, IT: 25, FMCG: 15 };
  if (regime === "RISK OFF") return { NBFC: 15, PSU_BANK: 15, IT: 30, FMCG: 40 };
  return { NBFC: 20, PSU_BANK: 20, IT: 30, FMCG: 30 };
}
/* ==============================
   SECTOR INTELLIGENCE ENGINE (PHASE 2)
   ADDITIVE — NO REGRESSION
============================== */

function getDynamicSectorAllocation(regime, signals, intelligence) {
  // Start with base allocation (existing logic)
  let base = getSectorAllocation(regime);

  let adjusted = { ...base };

  // --------------------------
  // SIGNAL-DRIVEN ADJUSTMENTS
  // --------------------------

  // Liquidity + FII → Boost NBFC / PSU_BANK
  if (signals.liquidity.score === 1 && signals.fii.score === 1) {
    adjusted.NBFC += 5;
    adjusted.PSU_BANK += 5;
  }

  // High VIX → Defensive tilt
  if (signals.vix.score === -1) {
    adjusted.FMCG += 10;
    adjusted.NBFC -= 5;
    adjusted.PSU_BANK -= 5;
  }

  // Crude rising → hurt consumption / banks slightly
  if (signals.crude.score === -1) {
    adjusted.IT += 5;
    adjusted.NBFC -= 3;
    adjusted.PSU_BANK -= 2;
  }

  // Weak trend → move defensive
  if (signals.trend.score === -1) {
    adjusted.FMCG += 5;
    adjusted.IT += 5;
  }

  // --------------------------
  // CONFLICT ADJUSTMENT
  // --------------------------

  if (intelligence.conflict) {
    adjusted.FMCG += 5;
    adjusted.NBFC -= 3;
    adjusted.PSU_BANK -= 2;
  }

  // --------------------------
  // NORMALIZATION (CRITICAL)
  // --------------------------

  const total = Object.values(adjusted).reduce((a, b) => a + b, 0);

Object.keys(adjusted).forEach(k => {
  adjusted[k] = Math.max(0, Math.round((adjusted[k] / total) * 100));
});

// ✅ FIX: Ensure total = 100 exactly
let totalAdjusted = Object.values(adjusted).reduce((a, b) => a + b, 0);

if (totalAdjusted !== 100) {
  const maxKey = Object.keys(adjusted).reduce((a, b) =>
    adjusted[a] > adjusted[b] ? a : b
  );

  adjusted[maxKey] += (100 - totalAdjusted);
}

return adjusted;
}
function computeSignalIntelligence(signals) {
  let weightedScore = 0, positive = 0, negative = 0;

  for (const key in signals) {
    const s = signals[key];
    const intensity = SIGNAL_REGISTRY[key].intensity(s.value);
    weightedScore += s.score * s.weight * intensity * 100;

    if (s.score > 0) positive++;
    else if (s.score < 0) negative++;
  }

  const total = positive + negative;
  const signalBalance = total ? (positive / total) * 100 : 50;

  return {
    conviction: Math.round(Math.abs(weightedScore)),
    signalBalance: Math.round(signalBalance),
    conflict: (negative >= 1 && signalBalance < 70),
    positiveSignals: positive,
    negativeSignals: negative
  };
}

function buildStrategy(regime, confidence, marketQuality, sectorAllocation) {
  let stance = "NEUTRAL", positionSizing = "MEDIUM", riskManagement = [];
  let preferredSectors = Object.keys(sectorAllocation), avoid = [];

  if (regime === "STRONG RISK ON") {
    stance = "AGGRESSIVE LONG";
    positionSizing = confidence > 75 ? "HIGH" : "MEDIUM";
    avoid = ["FMCG"];
  }

  if (regime === "RISK ON") stance = "LONG BIAS";

  if (regime === "RISK OFF") {
    stance = "DEFENSIVE";
    positionSizing = "LOW";
    avoid = ["NBFC", "PSU_BANK"];
  }

  if (regime === "STRONG RISK OFF") {
    stance = "RISK OFF / CAPITAL PROTECTION";
    positionSizing = "VERY LOW";
    avoid = ["NBFC", "PSU_BANK"];
  }

  if (marketQuality === "WEAK") {
    positionSizing = "LOW";
    riskManagement.push("Reduce exposure due to weak alignment");
  }

  if (confidence < 50) {
    riskManagement.push("Avoid aggressive trades");
  }

  return { stance, positionSizing, preferredSectors, avoid, riskManagement };
}

function buildTradeDecision(regime, confidence, marketQuality, intelligence) {
  let action = "HOLD";

  if (regime.includes("RISK ON")) action = "BUY";
  if (regime.includes("RISK OFF")) action = "SELL";

  let allocation = confidence * 0.7 + intelligence.conviction * 0.3;
  allocation = Math.min(90, Math.max(20, Math.round(allocation)));

  if (marketQuality === "WEAK") allocation = Math.min(allocation, 30);
  if (intelligence.conflict) allocation = Math.min(allocation, 60);
  if (confidence < 50) action = "HOLD";

  return { action, allocation: allocation + "%", confidence, conviction: intelligence.conviction };
}

function buildPortfolio(regime, strategy, sectorAllocation, tradeDecision) {
  const totalAllocation = parseInt(tradeDecision.allocation);

  const buckets = [
    { bucket: "CORE", allocation: Math.round(totalAllocation * 0.6) },
    { bucket: "TACTICAL", allocation: Math.round(totalAllocation * 0.3) },
    { bucket: "DEFENSIVE", allocation: Math.round(totalAllocation * 0.1) }
  ];

  const sectorToStocks = {
    NBFC: ["BAJFINANCE", "CHOLAFIN"],
    PSU_BANK: ["SBIN", "BANKBARODA"],
    IT: ["TCS", "INFY"],
    FMCG: ["HUL", "ITC"]
  };

  const instruments = [];

  for (const sector in sectorAllocation) {
    const weight = Math.round((sectorAllocation[sector] / 100) * totalAllocation);
    const stocks = sectorToStocks[sector] || [];

    stocks.forEach(stock => {
      instruments.push({
        sector,
        instrument: stock,
        weight: Math.round(weight / stocks.length),
        rationale: sector + " exposure aligned with " + regime
      });
    });
  }

  return { stance: strategy.stance, totalAllocation: totalAllocation + "%", buckets, instruments };
}

function buildExplanation(signals) {
  const positive = [], negative = [];

  for (const key in signals) {
    if (signals[key].score === 1) positive.push(key);
    else negative.push(key);
  }

  return {
    summary: "Market driven by macro signals",
    keyDrivers: positive,
    riskFlags: negative,
    reasoning: "Positive: " + positive.join(", ") + " | Negative: " + negative.join(", ")
  };
}
function updateSignalReliability(signals) {
  for (const key in signals) {
    if (signals[key].score === 1) signalReliability[key] = Math.min(1.05, signalReliability[key] + 0.01);
    else signalReliability[key] = Math.max(0.95, signalReliability[key] - 0.01);
  }
}

/* 🔥 PnL FIX (SCORE-BASED DRIFT — NO REGRESSION) */
function updatePortfolioState(tradeDecision, compositeScore) {
  const now = Date.now();

  if (tradeDecision.action === "BUY") {
    portfolioState.activePositions = [{
      ts: now,
      allocation: parseInt(tradeDecision.allocation),
      entryScore: compositeScore,
      currentScore: compositeScore
    }];
  }

  if (tradeDecision.action === "SELL") {
    portfolioState.activePositions = [];
  }

  let pnl = 0;

  portfolioState.activePositions.forEach(pos => {
    pos.currentScore = compositeScore;
    pnl += (pos.currentScore - pos.entryScore) * (pos.allocation / 100);
  });

  portfolioState.totalPnL = Math.round(pnl);
  portfolioState.lastUpdate = now;

  return portfolioState;
}

function computeRisk(portfolio) {
  let exposure = portfolio.activePositions.reduce((sum, p) => sum + p.allocation, 0);

  let riskLevel = "LOW";
  if (exposure > 70) riskLevel = "HIGH";
  else if (exposure > 40) riskLevel = "MEDIUM";

  return { exposure: exposure + "%", riskLevel };
}
/* ==============================
   INTERPRETATION ENGINE (PHASE 1)
   ADDITIVE — NO REGRESSION
============================== */

/* ==============================
   ADVISORY ENGINE (PHASE 3)
   ADDITIVE — NO REGRESSION
============================== */

/* ==============================
   NARRATIVE ENGINE (PHASE 4)
   ADDITIVE — NO REGRESSION
============================== */

function buildNarrative({ regime, interpretation, advisory }) {
  let headline = "";
  let marketSummary = "";
  let sectorNarrative = "";
  let advisoryNarrative = "";
  let closingNote = "";

  // --------------------------
  // HEADLINE
  // --------------------------

  if (regime.includes("RISK ON")) {
    headline = "Markets remain supportive with a positive bias";
  } else if (regime.includes("RISK OFF")) {
    headline = "Markets are turning cautious with defensive undertones";
  } else {
    headline = "Markets are in a transitional phase";
  }

  // --------------------------
  // MARKET SUMMARY
  // --------------------------

  marketSummary = `${interpretation.summary.trim()} ${interpretation.signalNarrative.trim()}`;

  // --------------------------
  // SECTOR NARRATIVE
  // --------------------------

  sectorNarrative = interpretation.sectorView;

  // --------------------------
  // ADVISORY NARRATIVE
  // --------------------------

advisoryNarrative =
  "Current stance suggests " + advisory.stance.toLowerCase() +
  " positioning. Investors may consider " + advisory.action.toLowerCase() +
  ". " + advisory.allocationGuidance +
  ". " + advisory.riskNote + ".";

  // --------------------------
  // CLOSING NOTE
  // --------------------------

closingNote = advisory.clientSuitability + ".";

  return {
    headline,
    marketSummary,
    sectorNarrative,
    advisoryNarrative,
    closingNote
  };
}

function buildAdvisory({
  regime,
  confidence,
  marketQuality,
  intelligence,
  sectorAllocation,
  risk
}) {
  let stance = "Neutral";
  let action = "Hold / Wait";
  let allocationGuidance = "";
  let sectorFocus = "";
  let riskNote = "";
  let clientSuitability = "";

  // --------------------------
  // CORE STANCE
  // --------------------------

  if (regime === "STRONG RISK ON") {
    stance = "Aggressive Growth";
    action = "Increase equity exposure";
  } else if (regime === "RISK ON") {
    stance = "Growth Bias";
    action = "Accumulate on dips";
  } else if (regime === "RISK OFF") {
    stance = "Defensive";
    action = "Reduce equity exposure";
  } else if (regime === "STRONG RISK OFF") {
    stance = "Capital Preservation";
    action = "Minimize risk exposure";
  }

  // --------------------------
  // ALLOCATION GUIDANCE
  // --------------------------

  if (confidence >= 75) {
    allocationGuidance = "High conviction environment — higher allocation justified";
  } else if (confidence >= 50) {
    allocationGuidance = "Moderate conviction — staggered allocation recommended";
  } else {
    allocationGuidance = "Low conviction — maintain low exposure";
  }

  // --------------------------
  // SECTOR FOCUS
  // --------------------------

  const sortedSectors = Object.entries(sectorAllocation)
    .sort((a, b) => b[1] - a[1])
    .map(s => s[0]);

  sectorFocus = "Focus on: " + sortedSectors.slice(0, 2).join(", ");

  // --------------------------
  // RISK NOTE (VERY IMPORTANT)
  // --------------------------

  if (intelligence.conflict) {
    riskNote = "Conflicting signals — avoid aggressive positioning";
  } else if (marketQuality === "WEAK") {
    riskNote = "Weak participation — rallies may not sustain";
  } else if (risk.riskLevel === "HIGH") {
    riskNote = "High portfolio exposure — manage downside risk";
  } else {
    riskNote = "Risk environment stable";
  }

// --------------------------
// CLIENT SUITABILITY
// --------------------------

if (regime.includes("RISK ON")) {
  clientSuitability = "Suitable for moderate to aggressive investors";
} else if (regime.includes("RISK OFF")) {
  clientSuitability = "Suitable for conservative investors";
} else {
  clientSuitability = "Suitable for balanced portfolios";
}

  return {
    stance,
    action,
    allocationGuidance,
    sectorFocus,
    riskNote,
    clientSuitability
  };
}

function interpretRegime(regime) {
  const map = {
    "STRONG RISK ON": "Broad-based bullish environment",
    "RISK ON": "Positive market conditions with selective strength",
    "NEUTRAL": "Indecisive or transitioning market phase",
    "RISK OFF": "Defensive environment with downside risks",
    "STRONG RISK OFF": "High-risk environment prioritizing capital preservation"
  };
  return map[regime] || "Unknown regime";
}

function interpretMarketTone(score) {
  if (score >= 70) return "Strong bullish momentum";
  if (score >= 55) return "Moderately positive market tone";
  if (score >= 45) return "Neutral and range-bound conditions";
  if (score >= 30) return "Weak market with downside bias";
  return "Strong bearish conditions";
}

function interpretRisk(vixSignal, conflict, marketQuality) {
  if (conflict) return "Elevated uncertainty due to conflicting signals";
  if (vixSignal > 0 && marketQuality === "STRONG") return "Low risk environment";
  if (marketQuality === "WEAK") return "Fragile market conditions";
  return "Moderate risk environment";
}

function interpretParticipation(confidence) {
  if (confidence >= 70) return "Broad market participation";
  if (confidence >= 50) return "moderate participation";
  return "Weak participation";
}

function interpretConviction(conviction) {
  if (conviction >= 70) return "Strong conviction in trend";
  if (conviction >= 50) return "Moderate conviction";
  return "Low conviction / uncertain trend";
}

function interpretConflict(conflict) {
  return conflict
    ? "Market signals show internal conflict"
    : "Signals are well aligned";
}

function buildSignalNarrative(signals) {
  const positives = [];
  const negatives = [];

  for (const key in signals) {
    if (signals[key].score === 1) positives.push(key);
    else if (signals[key].score === -1) negatives.push(key);
  }

  return `Positive drivers: ${positives.join(", ") || "None"}. Risks: ${negatives.join(", ") || "None"}.`;
}
function buildSectorView(signals, regime) {
  const views = [];

  if (regime.includes("RISK OFF")) {
    views.push("Defensive sectors likely to outperform");
  }

  if (signals.liquidity.score === 1 && !regime.includes("RISK OFF")) {
    views.push("Liquidity supports financial sectors");
  }

  if (signals.fii.score === 1 && !regime.includes("RISK OFF")) {
    views.push("FII flows favor equities");
  }

  if (signals.vix.score === -1) {
    views.push("High volatility favors defensive sectors");
  }

  if (signals.crude.score === -1) {
    views.push("Rising crude may pressure consumption");
  }

  return views.join(". ") || "Sector signals are neutral";
}
function generateSummary({ tone, participation, risk }) {
  return `${tone} with ${participation}. ${risk}.`;
}
function interpretationEngine(data) {
  const {
    regime,
    compositeScore,
    signals,
    confidence,
    marketQuality,
    conviction,
    conflict
  } = data;

  const regimeMeaning = interpretRegime(regime);
  const tone = interpretMarketTone(compositeScore);
  const risk = interpretRisk(signals?.vix?.score || 0, conflict, marketQuality);
  const participation = interpretParticipation(confidence);
  const convictionInsight = interpretConviction(conviction || 0);
  const conflictInsight = interpretConflict(conflict);
  const signalNarrative = buildSignalNarrative(signals);

  const summary = generateSummary({
    tone,
    participation,
    risk
  });

return {
  regimeMeaning,
  marketTone: tone,
  signalNarrative,
  riskInterpretation: risk,
  participationQuality: participation,
  convictionInsight,
  conflictInsight,
  sectorView: buildSectorView(signals, regime),   // ✅ ADD THIS LINE
  summary
};
}
/* =========================
   CALLBACK (BREEZE SESSION — FIXED ABSOLUTE PATH)
========================= */

/* =========================
   API
========================= */

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    version: VERSION,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "local",
    timestamp: Date.now()
  });
});
app.post("/brain-auto", async (req, res) => {
const body = req.body || {};

  const inputs = await autoFillInputs(body);
  // const liveData = await getLiveSignals();

// inputs.crude = liveData.signals.crude;
// inputs.vix = liveData.signals.vix;

  let { signals, compositeScore } = buildSignals(inputs, "NEUTRAL");
  const regime = getRegime(compositeScore);
  ({ signals, compositeScore } = buildSignals(inputs, regime));

  const intelligence = computeSignalIntelligence(signals);
  const confidence = getConfidence(signals);
  const marketQuality = getMarketQuality(confidence);
  const sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
  const strategy = buildStrategy(regime, confidence, marketQuality, sectorAllocation);
  const explanation = buildExplanation(signals);
  const tradeDecision = buildTradeDecision(regime, confidence, marketQuality, intelligence);
  const portfolio = buildPortfolio(regime, strategy, sectorAllocation, tradeDecision);

  updateSignalReliability(signals);

  const portfolioStateData = updatePortfolioState(tradeDecision, compositeScore);
  const risk = computeRisk(portfolioStateData);

  const now = Date.now();
  regimeHistory.push({ ts: now, regime, score: compositeScore });
  if (regimeHistory.length > 20) regimeHistory.shift();

  let duration = 1;
  for (let i = regimeHistory.length - 2; i >= 0; i--) {
    if (regimeHistory[i].regime === regime) duration++;
    else break;
  }

  let change = false;
  if (regimeHistory.length > 1) {
    const prev = regimeHistory[regimeHistory.length - 2].regime;
    if (prev !== regime) change = true;
  }

  let momentum = "flat";
  if (regimeHistory.length >= 5) {
    const avg = regimeHistory.slice(-5).reduce((a, b) => a + b.score, 0) / 5;
    if (compositeScore > avg + 5) momentum = "strengthening";
    else if (compositeScore < avg - 5) momentum = "weakening";
  }

  const regimeIntel = {
    duration,
    change,
    momentum,
    ...intelligence
  };
// ==============================
// INTERPRETATION LAYER EXECUTION
// ==============================

const interpretation = interpretationEngine({
  regime,
  compositeScore,
  signals,
  confidence,
  marketQuality,
  conviction: intelligence.conviction,
  conflict: intelligence.conflict
});
// ==============================
// ADVISORY ENGINE EXECUTION
// ==============================

const advisory = buildAdvisory({
  regime,
  confidence,
  marketQuality,
  intelligence,
  sectorAllocation,
  risk
});
// ==============================
// NARRATIVE ENGINE EXECUTION
// ==============================

const narrative = buildNarrative({
  regime,
  interpretation,
  advisory
});

  res.json({
    version: VERSION,
    inputsUsed: inputs,
    signals,
    regime,
    compositeScore,
    confidence,
    marketQuality,
    sectorAllocation,
    strategy,
    explanation,
    tradeDecision,
    portfolio,
    regimeIntel,
    portfolioState: portfolioStateData,
    risk,
    interpretation,
    advisory,
    narrative
  });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("DSS running on port " + PORT + " (" + VERSION + ")");
});
