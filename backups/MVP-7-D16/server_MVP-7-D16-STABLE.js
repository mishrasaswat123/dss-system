/*
VERSION: MVP-7-D16 (TRADE + FULL REGIME INTEL — STABLE)
*/

const express = require("express");
const app = express();
app.use(express.json());

const VERSION = "MVP-7-D16";

const WEIGHTS = {
  rates: 0.2,
  liquidity: 0.2,
  crude: 0.15,
  fii: 0.2,
  vix: 0.15,
  trend: 0.1,
};

let lastCrudeSignal = "falling";
let lastVixSignal = "low";
let regimeHistory = [];

async function safeFetch(url, timeout = 2000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function fetchCrude() {
  const data = await safeFetch("https://api.api-ninjas.com/v1/commodities?name=crude_oil");
  if (!data || !data[0]) return null;
  return data[0].price;
}

async function fetchVix() {
  const data = await safeFetch("https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5EVIX");
  if (!data || !data.quoteResponse) return null;
  return data.quoteResponse.result[0]?.regularMarketPrice;
}

function interpretCrude(price, last) {
  if (!price) return last;
  return price > 80 ? "rising" : "falling";
}

function interpretVix(vix, last) {
  if (!vix) return last;
  return vix > 18 ? "high" : "low";
}

function scoreSignal(type, value) {
  const map = {
    rates: { rising: -1, falling: 1 },
    liquidity: { supportive: 1, tight: -1 },
    crude: { rising: -1, falling: 1 },
    fii: { buying: 1, selling: -1 },
    vix: { low: 1, high: -1 },
    trend: { bullish: 1, bearish: -1 },
  };
  return map[type]?.[value] ?? 0;
}

function getIntensity(type, value) {
  const map = {
    rates: { rising: 1, falling: 1 },
    liquidity: { supportive: 1.2, tight: 1.2 },
    crude: { rising: 1.1, falling: 1.1 },
    fii: { buying: 1.3, selling: 1.3 },
    vix: { low: 1.2, high: 1.2 },
    trend: { bullish: 1.5, bearish: 1.5 },
  };
  return map[type]?.[value] ?? 1;
}

async function autoFillInputs(body) {
  const crudePrice = await fetchCrude();
  const vixValue = await fetchVix();

  const crudeSignal = interpretCrude(crudePrice, lastCrudeSignal);
  const vixSignal = interpretVix(vixValue, lastVixSignal);

  if (crudeSignal) lastCrudeSignal = crudeSignal;
  if (vixSignal) lastVixSignal = vixSignal;

  return {
    rates: body.rates || "rising",
    crude: crudeSignal,
    fii: "buying",
    liquidity: "supportive",
    vix: vixSignal,
    trend: body.autoTrend ? "bullish" : "bearish",
    liveData: { crudePrice, vixValue }
  };
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
  return Math.round((positives / 6) * 100);
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
function buildStrategy(regime, confidence, marketQuality, sectorAllocation) {
  let stance = "NEUTRAL";
  let positionSizing = "MEDIUM";
  let riskManagement = [];
  let preferredSectors = Object.keys(sectorAllocation);
  let avoid = [];

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

function buildExplanation(signals) {
  const positive = [];
  const negative = [];

  for (const key in signals) {
    if (signals[key].score === 1) positive.push(key);
    else negative.push(key);
  }

  return {
    summary: "Market driven by macro signals",
    keyDrivers: positive,
    riskFlags: negative,
    reasoning:
      "Positive: " + positive.join(", ") +
      " | Negative: " + negative.join(", ")
  };
}

function computeSignalIntelligence(signals) {
  let weightedScore = 0;
  let positive = 0;
  let negative = 0;

  for (const key in signals) {
    const s = signals[key];
    const intensity = getIntensity(key, s.value);
    weightedScore += s.score * s.weight * intensity * 100;

    if (s.score > 0) positive++;
    else if (s.score < 0) negative++;
  }

  const total = positive + negative;

  return {
    conviction: Math.round(Math.abs(weightedScore)),
    signalBalance: total ? Math.round((positive / total) * 100) : 50,
    conflict: positive > 0 && negative > 0,
    positiveSignals: positive,
    negativeSignals: negative
  };
}

/* NEW — TRADE DECISION */
function buildTradeDecision(regime, confidence, marketQuality, intelligence) {
  let action = "HOLD";

  if (regime.includes("RISK ON")) action = "BUY";
  if (regime.includes("RISK OFF")) action = "SELL";

  let allocation = 20;

  if (confidence > 80 && intelligence.conviction > 75) allocation = 90;
  else if (confidence > 65) allocation = 70;
  else if (confidence > 50) allocation = 50;

  if (marketQuality === "WEAK") allocation = Math.min(allocation, 30);
  if (intelligence.conflict) allocation = Math.min(allocation, 60);
  if (confidence < 50) action = "HOLD";

  return {
    action,
    allocation: allocation + "%",
    confidence,
    conviction: intelligence.conviction
  };
}

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    version: VERSION,
    uptime: process.uptime()
  });
});

app.post("/brain-auto", async (req, res) => {

  const inputs = await autoFillInputs(req.body);

  const signals = {};
  let composite = 0;

  for (const key in WEIGHTS) {
    const score = scoreSignal(key, inputs[key]);

    signals[key] = {
      value: inputs[key],
      score,
      weight: WEIGHTS[key],
      strength: Math.abs(score) === 1 ? "strong" : "neutral"
    };

    composite += score * WEIGHTS[key] * 100;
  }

  const compositeScore = Math.round(composite);
  const intelligence = computeSignalIntelligence(signals);

  const regime = getRegime(compositeScore);
  const confidence = getConfidence(signals);
  const marketQuality = getMarketQuality(confidence);
  const sectorAllocation = getSectorAllocation(regime);
  const strategy = buildStrategy(regime, confidence, marketQuality, sectorAllocation);
  const explanation = buildExplanation(signals);
  const tradeDecision = buildTradeDecision(regime, confidence, marketQuality, intelligence);

  /* FULL D15 REGIME INTEL RESTORED */
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
    regimeIntel
  });

});

app.listen(3000, () => {
  console.log("DSS running on port 3000 (" + VERSION + ")");
});
