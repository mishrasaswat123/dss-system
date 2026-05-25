const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.json());

// =========================
// MEMORY FILE
// =========================
const MEMORY_FILE = "./memory.json";

// Load previous regime
function loadMemory() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE));
  } catch {
    return { lastRegime: "NEUTRAL" };
  }
}

// Save regime
function saveMemory(regime) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify({ lastRegime: regime }));
}

// =========================
// BASE WEIGHTS
// =========================
const baseWeights = {
  rates: 0.15,
  liquidity: 0.2,
  crude: 0.15,
  fii: 0.2,
  vix: 0.15,
  trend: 0.05
};

// =========================
// SIGNAL SCORING
// =========================
function getScore(signal, value) {
  const map = {
    rates: { rising: -1, falling: 1 },
    liquidity: { supportive: 1, tight: -1 },
    crude: { rising: -1, falling: 1 },
    fii: { buying: 1, selling: -1 },
    vix: { low: 1, high: -1 },
    trend: { bullish: 1, bearish: -1, neutral: 0 }
  };
  return map[signal][value] ?? 0;
}

// =========================
// AUTO TREND
// =========================
function deriveTrend(signals) {
  const score =
    getScore("rates", signals.rates) +
    getScore("liquidity", signals.liquidity) +
    getScore("crude", signals.crude) +
    getScore("fii", signals.fii) +
    getScore("vix", signals.vix);

  if (score >= 2) return "bullish";
  if (score <= -2) return "bearish";
  return "neutral";
}

// =========================
// CONFIDENCE ENGINE
// =========================
function calculateConfidence(signals) {
  let positives = 0;
  let negatives = 0;

  Object.values(signals).forEach(s => {
    if (s.score > 0) positives++;
    if (s.score < 0) negatives++;
  });

  const total = positives + negatives;

  const agreement = Math.max(positives, negatives) / (total || 1);

  const strength = Math.abs(
    Object.values(signals).reduce((sum, s) => sum + s.score * s.weight, 0)
  );

  const noise = 1 - Math.abs(positives - negatives) / (total || 1);

  let confidence =
    (agreement * 50) +
    (strength * 30) +
    ((1 - noise) * 20);

  return Math.round(Math.min(100, confidence));
}

// =========================
// NOISE FACTOR
// =========================
function getNoiseFactor(signals) {
  let positives = 0;
  let negatives = 0;

  Object.values(signals).forEach(s => {
    if (s.score > 0) positives++;
    if (s.score < 0) negatives++;
  });

  const total = positives + negatives;

  if (total === 0) return 1;

  const imbalance = Math.abs(positives - negatives) / total;

  return 0.6 + (imbalance * 0.4);
}

// =========================
// REGIME MEMORY ENGINE (NEW)
// =========================
function applyRegimeMemory(newRegime, confidence) {
  const memory = loadMemory();
  const last = memory.lastRegime;

  // If confidence is weak → stick to previous
  if (confidence < 55) {
    return last;
  }

  // If strong shift → allow change
  if (confidence > 75) {
    saveMemory(newRegime);
    return newRegime;
  }

  // Medium confidence → cautious switch
  if (newRegime !== last) {
    return last;
  }

  saveMemory(newRegime);
  return newRegime;
}

// =========================
// MAIN ENGINE
// =========================
app.post("/brain-auto", (req, res) => {
  const input = req.body;

  const trend = input.autoTrend
    ? deriveTrend(input)
    : input.trend || "neutral";

  const signals = {};

  Object.keys(baseWeights).forEach(k => {
    const value = k === "trend" ? trend : input[k];

    const score = getScore(k, value);

    signals[k] = {
      value,
      score,
      weight: baseWeights[k]
    };
  });

  // BASE SCORE
  let rawScore = 0;
  Object.values(signals).forEach(s => {
    rawScore += (s.score * s.weight);
  });

  // NOISE ADJUSTMENT
  const noiseFactor = getNoiseFactor(signals);
  const adjustedScore = rawScore * noiseFactor;

  let compositeScore = Math.round((adjustedScore + 1) * 50);

  // RAW REGIME
  let newRegime = "NEUTRAL";
  if (compositeScore > 70) newRegime = "STRONG RISK ON";
  else if (compositeScore > 55) newRegime = "RISK ON";
  else if (compositeScore < 30) newRegime = "STRONG RISK OFF";
  else if (compositeScore < 45) newRegime = "RISK OFF";

  // CONFIDENCE
  const confidence = calculateConfidence(signals);

  // APPLY MEMORY
  const regime = applyRegimeMemory(newRegime, confidence);

  // ALLOCATION
  let output = {};
  if (regime.includes("RISK ON")) {
    output = { NBFC: 28, PSU_BANK: 38, IT: 24, FMCG: 10 };
  } else if (regime.includes("RISK OFF")) {
    output = { NBFC: 15, PSU_BANK: 5, IT: 20, FMCG: 60 };
  } else {
    output = { NBFC: 25, PSU_BANK: 25, IT: 25, FMCG: 25 };
  }

  // ATTRIBUTION
  const attribution = {};
  Object.keys(signals).forEach(k => {
    attribution[k] = {
      impact: signals[k].score,
      weight: signals[k].weight
    };
  });

  res.json({
    inputsUsed: { ...input, trend },
    signals,
    attribution,
    regime,
    compositeScore,
    confidence,
    output,
    outlook:
      `\nMARKET THEME: ${regime}\n\nConfidence: ${confidence}%\n\n` +
      `MARKET INTERPRETATION:\nMemory-adjusted regime stability.\n\n` +
      `SYSTEM EDGE:\nDeterministic + adaptive + stable.\n\n` +
      `STRATEGY:\nAvoid overreaction. Follow regime persistence.`
  });
});

app.listen(3000, () => console.log("Server running on 3000"));
