const express = require("express");
const app = express();

app.use(express.json());

/* -----------------------------
   BASE CONFIG (UNCHANGED)
----------------------------- */

const WEIGHTS = {
  rates: 0.15,
  liquidity: 0.2,
  crude: 0.15,
  fii: 0.2,
  vix: 0.15,
  trend: 0.05
};

/* -----------------------------
   SIGNAL SCORING (UNCHANGED)
----------------------------- */

function scoreSignal(type, value) {
  const map = {
    rates: { rising: -1, falling: 1 },
    liquidity: { supportive: 1, tight: -1 },
    crude: { rising: -1, falling: 1 },
    fii: { buying: 1, selling: -1 },
    vix: { low: 1, high: -1 },
    trend: { bullish: 1, bearish: -1, neutral: 0 }
  };
  return map[type][value] ?? 0;
}

/* -----------------------------
   ADAPTER LAYER (PHASE 3)
----------------------------- */

function fetchVixSignal(input) {
  return input;
}

function fetchFiiSignal(input) {
  return input;
}

function fetchLiquiditySignal(input) {
  return input;
}

/* -----------------------------
   AUTO TREND (UNCHANGED)
----------------------------- */

function deriveTrend(inputs) {
  let score = 0;
  score += scoreSignal("fii", inputs.fii);
  score += scoreSignal("liquidity", inputs.liquidity);
  score += scoreSignal("vix", inputs.vix);

  if (score > 0) return "bullish";
  if (score < 0) return "bearish";
  return "neutral";
}

/* -----------------------------
   MEMORY (PHASE 2C)
----------------------------- */

let lastRegime = null;

/* -----------------------------
   MAIN ENGINE
----------------------------- */

app.post("/brain-auto", (req, res) => {

  let inputs = { ...req.body };

  // APPLY ADAPTERS
  inputs.vix = fetchVixSignal(inputs.vix);
  inputs.fii = fetchFiiSignal(inputs.fii);
  inputs.liquidity = fetchLiquiditySignal(inputs.liquidity);

  // AUTO TREND
  if (inputs.autoTrend) {
    inputs.trend = deriveTrend(inputs);
  }

  let signals = {};
  let attribution = {};
  let compositeScore = 0;

  for (let key in WEIGHTS) {
    const score = scoreSignal(key, inputs[key]);

    signals[key] = {
      value: inputs[key],
      score: score,
      label: score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral",
      weight: WEIGHTS[key]
    };

    attribution[key] = {
      impact: score,
      weight: WEIGHTS[key]
    };

    compositeScore += score * WEIGHTS[key];
  }

  compositeScore = Math.round((compositeScore + 1) * 50);

  /* -----------------------------
     REGIME LOGIC
  ----------------------------- */

  let regime = "NEUTRAL";

  if (compositeScore > 70) regime = "STRONG RISK ON";
  else if (compositeScore > 55) regime = "RISK ON";
  else if (compositeScore < 30) regime = "STRONG RISK OFF";
  else if (compositeScore < 45) regime = "RISK OFF";

  /* -----------------------------
     HARD SUPPRESSION
  ----------------------------- */

  if (Math.abs(compositeScore - 50) < 8) {
    regime = "NEUTRAL";
  }

  /* -----------------------------
     MEMORY STABILITY
  ----------------------------- */

  if (lastRegime && lastRegime !== regime) {
    if (Math.abs(compositeScore - 50) < 12) {
      regime = lastRegime;
    }
  }

  lastRegime = regime;

  /* -----------------------------
     CONFIDENCE
  ----------------------------- */

  let confidence = Math.abs(compositeScore - 50) * 2;
  confidence = Math.min(100, Math.round(confidence));

  /* -----------------------------
     ALLOCATION
  ----------------------------- */

  let output = {
    NBFC: 25,
    PSU_BANK: 25,
    IT: 25,
    FMCG: 25
  };

  if (regime.includes("RISK ON")) {
    output = { NBFC: 28, PSU_BANK: 38, IT: 24, FMCG: 10 };
  } else if (regime.includes("RISK OFF")) {
    output = { NBFC: 15, PSU_BANK: 5, IT: 20, FMCG: 60 };
  }

  /* -----------------------------
     OUTLOOK
  ----------------------------- */

  const outlook = `
MARKET THEME: ${regime}

Confidence: ${confidence}%

MARKET INTERPRETATION:
Multi-signal intelligence active (VIX + FII + Liquidity).

SYSTEM EDGE:
Deterministic + adaptive + explainable engine.

STRATEGY:
Align allocation with regime strength.
`;

  res.json({
    inputsUsed: inputs,
    signals,
    attribution,
    regime,
    compositeScore,
    confidence,
    output,
    outlook
  });

});

/* ----------------------------- */

app.listen(3000, () => {
  console.log("DSS running on port 3000");
});
