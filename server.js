/*
VERSION: MVP-9-D26-BASELINE
FEATURES:
- Signal Persistence
- V8 Memory Engine
- Regime Intelligence
- Adaptive Position Sizing (V9)
- Stability Engine
STATUS: PRODUCTION BASELINE
*/

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const { AbortController } = require("node-abort-controller");
const pino = require("pino");
const logger = pino({
  level: "info",
  transport: {
    target: "pino-pretty"
  }
});
const db = new sqlite3.Database("./dss.db", (err) => {
  if (err) {
    logger.error({ err }, "DB connection error");
  } else {
    logger.info("Connected to SQLite DB");
  }
});
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      value TEXT,
      score INTEGER,
      weight REAL,
      timestamp INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      regime TEXT,
      score INTEGER,
      confidence INTEGER,
      timestamp INTEGER
    )
  `);
db.run('CREATE INDEX IF NOT EXISTS idx_signals_time ON signals(timestamp)');
db.run('CREATE INDEX IF NOT EXISTS idx_decisions_time ON decisions(timestamp)');
});
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require("fs");
// ==============================
// STABILITY LAYER — SAFE EXECUTION
// ==============================

function safeExecute(fn, fallback = null) {
  try {
    return fn();
  } catch (err) {
    logger.error({ err }, "SafeExecute failure");
    return fallback;
  }
}

async function safeExecuteAsync(fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    logger.error({ err }, "SafeExecuteAsync failure");
    return fallback;
  }
}
const app = express();

const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/brain-auto", limiter);

app.use(express.json());

app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    body: req.body
  }, "Incoming request");
  next();
});
// const { getLiveSignals } = require("../data-engine/liveDataEngine");

const VERSION = "MVP-9-D26-BASELINE";
const DEFAULT_SIGNALS = {
  rates: "neutral",
  crude: "falling",
  fii: "buying",
  liquidity: "supportive",
  vix: "low",
  trend: "neutral",

  // ✅ NEW (D25)
  momentum: "neutral",
  strength: "neutral",
  breadth: 0.5
};
const RELEASE_TAG = "BASELINE-D26";

/* ==============================
   V7 — MEMORY ENGINE (PERSISTENT)
============================== */

const path = require("path");
const MEMORY_FILE = path.join(__dirname, "memory.json");

function loadMemory() {
  try {
    const data = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));

    return {
      decisions: data.decisions || [],
      regimeHistory: data.regimeHistory || [],
      accuracy: data.accuracy || {
        total: 0,
        correct: 0,
        pnlSeries: []
      }
    };
  } catch {
    return {
      decisions: [],
      regimeHistory: [],
      accuracy: {
        total: 0,
        correct: 0,
        pnlSeries: []
      }
    };
  }
}

function saveMemory(mem) {
  const tempFile = MEMORY_FILE + ".tmp";

  // Write to temp file first
  fs.writeFileSync(tempFile, JSON.stringify(mem, null, 2), "utf-8");

  // Copy temp → actual file (safer across devices/filesystems)
  fs.copyFileSync(tempFile, MEMORY_FILE);

  // Remove temp file
  fs.unlinkSync(tempFile);
}
let MEMORY = loadMemory();
if (!Array.isArray(MEMORY.decisions)) MEMORY.decisions = [];
if (!Array.isArray(MEMORY.regimeHistory)) MEMORY.regimeHistory = [];
if (!MEMORY.accuracy) {
  MEMORY.accuracy = { total: 0, correct: 0, pnlSeries: [] };
}
if (!Array.isArray(MEMORY.accuracy.pnlSeries)) {
  MEMORY.accuracy.pnlSeries = [];
}// ===== V8 MEMORY INIT =====
if (!Array.isArray(MEMORY.signalsHistory)) MEMORY.signalsHistory = [];
if (!Array.isArray(MEMORY.alerts)) MEMORY.alerts = [];
if (!MEMORY.lastSnapshot) MEMORY.lastSnapshot = null;

/* =========================
   EXISTING STATE (UNCHANGED)
========================= */

let lastCrudeSignal = "falling";
let lastVixSignal = "low";
// ===============================
// CIRCUIT BREAKER + CACHE
// ===============================

let marketCache = {
  crudePrice: null,
  vixValue: null,
  lastUpdated: null
};

let circuitBreaker = {
  crude: { failures: 0, blockedUntil: 0 },
  vix: { failures: 0, blockedUntil: 0 }
};

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 60 * 1000; // 1 min
let regimeHistory = MEMORY.regimeHistory || [];
let fallbackState = {
  crude: false,
  vix: false
};
/* =========================
   NEW STATE (ADDITIVE ONLY)
========================= */

let portfolioState = {
  activePositions: [],
  totalPnL: 0,
  lastUpdate: null
};

// ==============================
// D27 RISK ENGINE STATE
// ==============================
let riskState = {
  peakPnL: 0,
  currentDrawdown: 0,
  killSwitch: false,
  lastTrigger: null
};

let signalReliability = {
  rates: 1,
  liquidity: 1,
  crude: 1,
  fii: 1,
  vix: 1,
  trend: 1,

  // ✅ NEW
  momentum: 1,
  strength: 1,
  breadth: 1
};
const SIGNAL_REGISTRY = {
  rates: { weight: 0.2, scorer: v => (v === "falling" ? 1 : v === "rising" ? -1 : 0), intensity: () => 1 },
  liquidity: { weight: 0.2, scorer: v => (v === "supportive" ? 1 : v === "tightening" ? -1 : 0), intensity: () => 1.2 },
  crude: { weight: 0.15, scorer: v => (v === "falling" ? 1 : v === "rising" ? -1 : 0), intensity: () => 1.1 },
  fii: { weight: 0.2, scorer: v => (v === "buying" ? 1 : v === "selling" ? -1 : 0), intensity: () => 1.3 },
  vix: { weight: 0.15, scorer: v => (v === "low" ? 1 : v === "high" ? -1 : 0), intensity: () => 1.2 },
  trend: { weight: 0.1, scorer: v => (v === "bullish" ? 1 : v === "bearish" ? -1 : 0), intensity: () => 1.5 },

  // ✅ NEW SIGNALS (D25)
  momentum: {
  weight: 0.1,
  scorer: v => (v === "bullish" ? 1 : v === "bearish" ? -1 : 0),
  intensity: () => 1.2
},
  strength: {
    weight: 0.1,
    scorer: v => (v === "strong" ? 1 : v === "weak" ? -1 : 0),
    intensity: () => 1.1
  },
  breadth: {
    weight: 0.1,
    scorer: v => (v > 0.55 ? 1 : v < 0.45 ? -1 : 0),
    intensity: () => 1.1
  }
};

async function safeFetch(url, timeout = 2000, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      return await res.json();
    } catch (err) {
      logger.warn({ url, attempt: i + 1, err: err.message }, "Fetch failed");

      if (i === retries) {
        logger.error({ url }, "All retries failed");
        return null;
      }
    }
  }
}
async function fetchCrude() {
  const now = Date.now();

  if (circuitBreaker.crude.blockedUntil > now) {
    logger.warn("Crude API blocked — using cache");
fallbackState.crude = true;
return marketCache.crudePrice ?? 80;   // crude default
  }

  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/CL=F";
    const data = await safeFetch(url);

    const result = data?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;

    if (!price) throw new Error("Invalid crude price");

    circuitBreaker.crude.failures = 0;
    marketCache.crudePrice = price;
    marketCache.lastUpdated = now;
    fallbackState.crude = false;

    return price;

  } catch (err) {
    circuitBreaker.crude.failures++;

    logger.warn({
      failures: circuitBreaker.crude.failures,
      err: err.message
    }, "Crude fetch failed");

    if (circuitBreaker.crude.failures >= FAILURE_THRESHOLD) {
      circuitBreaker.crude.blockedUntil = now + COOLDOWN_MS;
      logger.error("Crude circuit breaker ACTIVATED");
    }
fallbackState.crude = true;
return marketCache.crudePrice ?? 80;   // crude default
  }
}

async function fetchVix() {
  const now = Date.now();

  if (circuitBreaker.vix.blockedUntil > now) {
    logger.warn("VIX API blocked — using cache");
    fallbackState.vix = true;
    return marketCache.vixValue ?? 18;     // vix default
  }

  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX";
    const data = await safeFetch(url);

    const result = data?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;

    if (!price) throw new Error("Invalid VIX value");

    circuitBreaker.vix.failures = 0;
    marketCache.vixValue = price;
    marketCache.lastUpdated = now;
    fallbackState.vix = false;

    return price;

  } catch (err) {
    circuitBreaker.vix.failures++;

    logger.warn({
      failures: circuitBreaker.vix.failures,
      err: err.message
    }, "VIX fetch failed");

    if (circuitBreaker.vix.failures >= FAILURE_THRESHOLD) {
      circuitBreaker.vix.blockedUntil = now + COOLDOWN_MS;
      logger.error("VIX circuit breaker ACTIVATED");
    }
    fallbackState.vix = true;
    return marketCache.vixValue ?? 18;     // vix default
  }
}
// ===============================
// EMA HELPER (D25)
// ===============================
function EMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}
async function fetchNiftyData() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=5d&interval=5m";
    const data = await safeFetch(url);

    const result = data?.chart?.result?.[0];

    return {
      prices: result?.indicators?.quote?.[0]?.close?.filter(Boolean),
      open: result?.indicators?.quote?.[0]?.open?.[0],
      current: result?.meta?.regularMarketPrice
    };
  } catch {
    return null;
  }
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

  // ✅ ADD THESE 3 LINES (D25 SAFETY)
  momentum: body.momentum ?? DEFAULT_SIGNALS.momentum,
strength: body.strength ?? DEFAULT_SIGNALS.strength,
breadth: body.breadth ?? DEFAULT_SIGNALS.breadth,

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
    const adaptiveWeight = getAdaptiveWeight(key, baseWeight);
    const weight = adaptiveWeight * getAdaptiveMultiplier(key, regime);
    const rawScore = config.scorer(inputs[key]);
const reliability = signalReliability[key] || 1;
const score = rawScore * reliability;

    signals[key] = {
      value: inputs[key],
      score,
      weight,
      baseWeight,
      reliability: signalReliability[key],
      strength: Math.abs(score) === 1 ? "strong" : "neutral"
    };

    composite += score * weight;
  }

  const normalizedScore = Math.round((composite + 1) * 50); 
return { signals, compositeScore: normalizedScore };
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

function buildTradeDecision(regime, confidence, marketQuality, intelligence, signals) {
  let action = "HOLD";

  if (regime.includes("RISK ON")) action = "BUY";
  if (regime.includes("RISK OFF")) action = "SELL";

  // ==============================
// ADAPTIVE POSITION SIZING ENGINE (V9)
// ==============================

// 1. Base allocation
let normalizedConviction = Math.min(100, intelligence.conviction);

let allocation = (confidence * 0.6 + normalizedConviction * 0.4);

// 2. Regime multiplier
let regimeFactor = 1;

if (regime === "STRONG RISK ON") regimeFactor = 1.2;
else if (regime === "RISK ON") regimeFactor = 1.05;
else if (regime === "RISK OFF") regimeFactor = 0.75;
else if (regime === "STRONG RISK OFF") regimeFactor = 0.5;

// 3. Market quality adjustment
let qualityFactor = 1;

if (marketQuality === "STRONG") qualityFactor = 1.1;
if (marketQuality === "WEAK") qualityFactor = 0.7;

// 4. Conflict penalty
let conflictFactor = intelligence.conflict ? 0.7 : 1;

// 5. VIX-based volatility adjustment
let vixFactor = 1;
const vixSignal = signals?.vix || null;

if (vixSignal && vixSignal.score === -1) {
  vixFactor = 0.7;
} else {
  vixFactor = 1.05;
}

// 6. Regime stability boost
let stabilityFactor = 1;
const recentHistory = regimeHistory || [];

if (recentHistory.length >= 3) {
  const last3 = recentHistory.slice(-3);
  const stable = last3.every(r => r.regime === regime);

  if (stable) stabilityFactor = 1.1;
}

// 7. Final allocation
allocation =
  allocation *
  regimeFactor *
  qualityFactor *
  conflictFactor *
  vixFactor *
  stabilityFactor;

// 8. Clamp
// Clamp base
allocation = Math.round(Math.max(10, Math.min(90, allocation)));

// 🔥 Unified risk ceiling (ORDERED)
let cap = 90;

// Confidence caps
if (confidence < 65) cap = Math.min(cap, 70);
if (confidence < 55) cap = Math.min(cap, 60);

// Market quality cap
if (marketQuality === "WEAK") cap = Math.min(cap, 30);

// Conflict cap
if (intelligence.conflict) cap = Math.min(cap, 60);

// Apply final cap
allocation = Math.min(allocation, cap);
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
    const accuracy = MEMORY.accuracy?.total
  ? MEMORY.accuracy.correct / MEMORY.accuracy.total
  : 0.5;

// Reward good signals when system is performing well
if (accuracy > 0.6 && signals[key].score === 1) {
  signalReliability[key] = Math.min(1.2, signalReliability[key] + 0.02);
}

// Penalize when system is underperforming
else if (accuracy < 0.5 && signals[key].score === -1) {
  signalReliability[key] = Math.max(0.8, signalReliability[key] - 0.02);
}
  }
}
// ==============================
// ADAPTIVE WEIGHT ENGINE
// ==============================

function getAdaptiveWeight(signalKey, baseWeight) {
  const reliability = signalReliability[signalKey] || 1;

  // Bound between 0.8x and 1.2x
  const adaptiveFactor = Math.max(0.8, Math.min(1.2, reliability));

  return baseWeight * adaptiveFactor;
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

// ==============================
// D27 RISK ENGINE
// ==============================

function updateDrawdown(portfolioState) {
  const pnl = portfolioState.totalPnL;

  if (pnl > riskState.peakPnL) {
    riskState.peakPnL = pnl;
  }

  const drawdown = riskState.peakPnL !== 0
  ? ((riskState.peakPnL - pnl) / Math.abs(riskState.peakPnL)) * 100
  : 0;
  riskState.currentDrawdown = drawdown;

  return drawdown;
}

// Reset logic (IMPORTANT)
riskState.killSwitch = false;

function evaluateKillSwitch(drawdown, signals, regime) {
  if (drawdown >= 20) {
    riskState.killSwitch = true;
  }

  if (signals.vix?.score === -1 && regime.includes("RISK OFF")) {
    riskState.killSwitch = true;
  }

  const negativeSignals = Object.values(signals).filter(s => s.score === -1).length;
  if (negativeSignals >= 4) {
    riskState.killSwitch = true;
  }

  if (riskState.killSwitch) {
    riskState.lastTrigger = Date.now();
  }

  return riskState.killSwitch;
}

function applyRiskCaps(allocation, confidence, marketQuality, drawdown) {
  let cap = 90;

  if (confidence < 65) cap = Math.min(cap, 70);
  if (confidence < 55) cap = Math.min(cap, 60);

  if (marketQuality === "WEAK") cap = Math.min(cap, 30);

  if (drawdown >= 10) cap = Math.min(cap, 50);
  if (drawdown >= 15) cap = Math.min(cap, 30);
  if (drawdown >= 20) cap = Math.min(cap, 10);

  return Math.min(allocation, cap);
}

function applyVolatilityAdjustment(allocation, signals) {
  if (signals.vix?.score === -1) {
    return Math.round(allocation * 0.7);
  }
  return allocation;
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
/* ==============================
   V7 — ANALYTICS ENGINE
============================== */

function logDecision(snapshot) {
  MEMORY.decisions.push(snapshot);
  if (MEMORY.decisions.length > 100) MEMORY.decisions.shift();
}

function detectRegimeTransition(currentRegime, compositeScore) {
  // 🔒 HARD GUARD (non-negotiable)
  if (!MEMORY || typeof MEMORY !== "object") {
    MEMORY = {};
  }

  if (!Array.isArray(MEMORY.regimeHistory)) {
    MEMORY.regimeHistory = [];
  }

  const history = MEMORY.regimeHistory;

  const prev = history.length > 0 ? history[history.length - 1] : null;

  let transition = null;

  if (prev && prev.regime !== currentRegime) {
    transition = {
      from: prev.regime,
      to: currentRegime,
      ts: Date.now()
    };
  }

  history.push({
    regime: currentRegime,
    score: compositeScore,
    ts: Date.now()
  });

  if (history.length > 200) history.shift();

  return transition;
}

function computeDiff(currentSignals) {
  const prev = (MEMORY.decisions || []).slice(-1)[0];
  if (!prev) return null;

  const diff = [];

  for (let key in currentSignals) {
    const prevVal = prev.signals?.[key]?.value;
    const currVal = currentSignals[key].value;

    if (prevVal !== currVal) {
      diff.push({
        signal: key,
        from: prevVal,
        to: currVal
      });
    }
  }

  return diff;
}

function updateAccuracy(tradeDecision, compositeScore) {
  const last = (MEMORY.decisions || []).slice(-1)[0];
  if (!last) return;

  MEMORY.accuracy.total++;

  let correct = false;

  if (last.action === "BUY" && compositeScore > last.score - 5) correct = true;
  if (last.action === "SELL" && compositeScore < last.score + 5) correct = true;

  if (correct) MEMORY.accuracy.correct++;

  MEMORY.accuracy.pnlSeries.push({
    ts: Date.now(),
    pnl: compositeScore - last.score
  });

  if (MEMORY.accuracy.pnlSeries.length > 200)
    MEMORY.accuracy.pnlSeries.shift();
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
    release: RELEASE_TAG,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "local",
    timestamp: Date.now()
  });
});
app.post("/brain-auto", async (req, res) => {
  try {
// RESET FALLBACK STATE (per request)
fallbackState = { crude: false, vix: false };
const body = req.body || {};

  const inputs = await safeExecuteAsync(
  () => autoFillInputs(body),
  DEFAULT_SIGNALS
);
if (!inputs.crude) inputs.crude = lastCrudeSignal;
if (!inputs.vix) inputs.vix = lastVixSignal;
  // const liveData = await getLiveSignals();
// 📊 Compute Trend from NIFTY
const niftyData = await safeExecuteAsync(
  fetchNiftyData,
  null
);

let trendSignal = "neutral";
let momentumSignal = "neutral";
let strengthSignal = "neutral";
let breadthSignal = 0.5;

if (niftyData && Array.isArray(niftyData.prices) && niftyData.prices.length >= 50) {

  const ema20 = EMA(niftyData.prices.slice(-20), 20);
  const ema50 = EMA(niftyData.prices.slice(-50), 50);

  // ✅ TREND
  trendSignal = ema20 > ema50 ? "bullish" : "bearish";

  // ✅ MOMENTUM
  const momentumDiff = (niftyData.current - ema20) / ema20;

if (momentumDiff > 0.002) momentumSignal = "bullish";
else if (momentumDiff < -0.002) momentumSignal = "bearish";
else momentumSignal = "neutral";

  // ✅ STRENGTH
  const strength = (niftyData.current - niftyData.open) / niftyData.open;

 if (strength > 0.002) {
  strengthSignal = "strong";
} else if (strength < -0.002) {
  strengthSignal = "weak";
} else {
  strengthSignal = "neutral";
}

  // ✅ BREADTH
  breadthSignal = (niftyData.current - niftyData.open) > 0 ? 0.6 : 0.4;
}



// OVERRIDE INPUT
inputs.trend = trendSignal;
inputs.momentum = momentumSignal;
inputs.strength = strengthSignal;
inputs.breadth = breadthSignal;

// EXISTING

// inputs.crude = liveData.signals.crude;
// inputs.vix = liveData.signals.vix;

  let { signals, compositeScore } = safeExecute(
  () => buildSignals(inputs, "NEUTRAL"),
  { signals: {}, compositeScore: 50 }
);

let regime = getRegime(compositeScore);

// ==============================
// REGIME STABILITY ENGINE
// ==============================

const prevRegime = MEMORY.regimeHistory?.slice(-1)[0]?.regime;

if (prevRegime && prevRegime !== regime) {
  const scoreDiff = Math.abs(compositeScore - 50);

  // Prevent weak flips
  if (scoreDiff < 10) {
    regime = prevRegime;
    logger.warn("Regime flip prevented (stability filter)");
  }
}

({ signals, compositeScore } = safeExecute(
  () => buildSignals(inputs, regime),
  { signals, compositeScore }
));


// 🔻 FALLBACK INTELLIGENCE LAYER (ADD EXACTLY HERE)

if (fallbackState.crude) {
  if (signals.crude) {
    signalReliability.crude = Math.max(0.8, signalReliability.crude * 0.9);
signals.crude.reliability = signalReliability.crude;
  }
  logger.warn("Crude using fallback — reliability reduced");
}

if (fallbackState.vix) {
  if (signals.vix) {
    signalReliability.vix = Math.max(0.8, signalReliability.vix * 0.9);
signals.vix.reliability = signalReliability.vix;
  }
  logger.warn("VIX using fallback — reliability reduced");
}

  const intelligence = computeSignalIntelligence(signals);
  let confidence = getConfidence(signals);
// ==============================
// ADAPTIVE CONFIDENCE CALIBRATION
// ==============================

const accuracy = MEMORY.accuracy?.total
  ? MEMORY.accuracy.correct / MEMORY.accuracy.total
  : 0.5;

// Reduce confidence if system is underperforming
if (accuracy < 0.5) {
  confidence = Math.max(20, Math.round(confidence * 0.8));
}

// Boost confidence if system is performing well
if (accuracy > 0.65) {
  confidence = Math.min(95, Math.round(confidence * 1.1));
}

// 🔻 degrade confidence if fallback used
if (fallbackState.crude || fallbackState.vix) {
  confidence = Math.max(20, Math.round(confidence * 0.8));
}
// ✅ FIX 2 — Prevent under-confidence in strong regimes
if (regime === "STRONG RISK ON") {
  confidence = Math.max(confidence, 60);
} else if (regime === "RISK ON") {
  confidence = Math.max(confidence, 50);
}
  const marketQuality = getMarketQuality(confidence);
  const sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
  const strategy = buildStrategy(regime, confidence, marketQuality, sectorAllocation);
  const explanation = buildExplanation(signals);
  const tradeDecision = buildTradeDecision(regime, confidence, marketQuality, intelligence, signals);
 
  updateSignalReliability(signals);

  const portfolioStateData = updatePortfolioState(tradeDecision, compositeScore);
  // ==============================
// D27 RISK PIPELINE
// ==============================

const drawdown = updateDrawdown(portfolioStateData);

const killSwitch = evaluateKillSwitch(drawdown, signals, regime);

// Start with computed allocation
let finalAllocation = parseInt(tradeDecision.allocation);

// Apply volatility adjustment
finalAllocation = applyVolatilityAdjustment(finalAllocation, signals);

// Apply caps
finalAllocation = applyRiskCaps(finalAllocation, confidence, marketQuality, drawdown);

// Kill switch override
if (killSwitch) {
  finalAllocation = 0;
  tradeDecision.action = "SELL";
}

// Update trade decision
tradeDecision.allocation = finalAllocation + "%";

// Final risk output
const risk = {
  exposure: finalAllocation + "%",
  riskLevel:
    finalAllocation > 70 ? "HIGH" :
    finalAllocation > 40 ? "MEDIUM" : "LOW",
  drawdown,
  killSwitch
};

// ✅ MOVE PORTFOLIO BUILD HERE
const portfolio = buildPortfolio(
  regime,
  strategy,
  sectorAllocation,
  tradeDecision
);

  const now = Date.now();
const timestamp = now;

// ===== V8 SNAPSHOT =====
const currentSnapshot = {
  ts: now,
  signals: Object.fromEntries(
    Object.entries(signals).map(([k, v]) => [k, v.score])
  ),
  compositeScore,
  regime,
  confidence
};
// ===== V8 SIGNAL CHANGES =====
let signalChanges = [];

if (MEMORY.lastSnapshot && MEMORY.lastSnapshot.signals) {
  for (const key of Object.keys(currentSnapshot.signals)) {
    const prev = MEMORY.lastSnapshot.signals[key];
    const curr = currentSnapshot.signals[key];

    if (prev !== curr) {
      signalChanges.push({
        signal: key,
        from: prev,
        to: curr
      });
    }
  }
}
// ===== V8 REGIME TRANSITION =====
let regimeTransition = null;


if (MEMORY.lastSnapshot && MEMORY.lastSnapshot.regime !== regime) {
  regimeTransition = {
    from: MEMORY.lastSnapshot.regime,
    to: regime,
    ts: now
  };
MEMORY.alerts.push({
  type: "REGIME_CHANGE",
  message: `Market shifted from ${MEMORY.lastSnapshot.regime} → ${regime}`,
  severity: "HIGH",
  ts: now
});

if (MEMORY.alerts.length > 200) {
  MEMORY.alerts.shift();
}
}


// ===== V8 HISTORY =====
MEMORY.signalsHistory.push(currentSnapshot);
if (MEMORY.signalsHistory.length > 100) {
  MEMORY.signalsHistory.shift();
}
MEMORY.v8_regimeHistory = MEMORY.v8_regimeHistory || [];

MEMORY.v8_regimeHistory.push({
  regime,
  score: compositeScore,
  ts: now
});

if (MEMORY.v8_regimeHistory.length > 100)
  MEMORY.v8_regimeHistory.shift();

// limit size

// update snapshot
MEMORY.lastSnapshot = currentSnapshot;
// ===== V8 TREND =====
const last10 = Array.isArray(MEMORY.signalsHistory)
  ? MEMORY.signalsHistory.slice(-10)
  : [];

const trend = {
  score: last10.map(x => x.compositeScore),
  confidence: last10.map(x => x.confidence),
  timestamps: last10.map(x => x.ts)
};

const alerts = [];
// Signal change alerts
signalChanges.forEach(change => {
let severity = "LOW";

if (["trend", "vix", "liquidity"].includes(change.signal)) {
  severity = "HIGH";
} else if (["fii", "crude"].includes(change.signal)) {
  severity = "MEDIUM";
}

alerts.push({
  type: "SIGNAL_CHANGE",
  signal: change.signal,
  message: `${change.signal} changed from ${change.from} → ${change.to}`,
  severity,
  ts: now
});
});

// Regime change alert


// ===== SAVE ALERTS =====
MEMORY.alerts = MEMORY.alerts || [];
MEMORY.alerts.push(...alerts);

if (MEMORY.alerts.length > 200) {
  MEMORY.alerts.shift();
}

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
/* ==============================
   V7 EXECUTION (CORRECT PLACE)
============================== */

const v7_transition = detectRegimeTransition(regime, compositeScore);
const v7_diff = computeDiff(signals);

updateAccuracy(tradeDecision, compositeScore);

logDecision({
  ts: Date.now(),
  regime,
  score: compositeScore,
  action: tradeDecision.action,
  allocation: tradeDecision.allocation,
  signals
});

if (MEMORY.alerts.length > 200) {
  MEMORY.alerts = MEMORY.alerts.slice(-200);
}

try {
  saveMemory(MEMORY);
} catch (err) {
  logger.error({ err }, "Memory save failed");
}
// Save signals
safeExecute(() => {
  Object.entries(signals).forEach(([name, s]) => {
    db.run(
      `INSERT INTO signals (name, value, score, weight, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [name, s.value, s.score, s.weight, timestamp],
      (err) => {
        if (err) {
          logger.error({ err, signal: name }, "DB insert error (signals)");
        }
      }
    );
  });
});

// Save decision
safeExecute(() => {
  db.run(
    `INSERT INTO decisions (regime, score, confidence, timestamp)
     VALUES (?, ?, ?, ?)`,
    [regime, compositeScore, confidence, timestamp],
    (err) => {
      if (err) {
        logger.error({ err }, "DB insert error (decision)");
      }
    }
  );
});
// THEN response
  res.json({
    version: VERSION,
    inputsUsed: inputs,
meta: {
  fallbackUsed: {
    crude: fallbackState.crude,
    vix: fallbackState.vix
  }
},
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
    narrative,
v8: {
  signalChanges,
  regimeTransition,
  alerts: (MEMORY.alerts || []).slice(-10),
  trend
},
  v7: {
    transition: v7_transition,
    diff: v7_diff,
    accuracy: {
      hitRate: MEMORY.accuracy.total
        ? Math.round((MEMORY.accuracy.correct / MEMORY.accuracy.total) * 100)
        : 0,
      total: MEMORY.accuracy.total
    },
    history: (MEMORY.regimeHistory || []).slice(-20),
lastDecisions: (MEMORY.decisions || []).slice(-10)
}

});

  } catch (err) {
    logger.error({ err }, "CRITICAL ROUTE FAILURE");

    return res.status(500).json({
      error: "SYSTEM_FAILURE",
      message: "Fallback response triggered",
      timestamp: Date.now()
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`DSS running on port ${PORT} (${VERSION})`);
});
