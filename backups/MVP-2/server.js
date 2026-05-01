const express = require('express');
const app = express();
app.use(express.json());

let signalWeights = { rates: 1, liquidity: 1, fii: 1, crude: 1 };
let evaluations = [];
let lastGoodWeights = { ...signalWeights };

// -----------------------------
// CONFIG
// -----------------------------
const MIN_EVAL_REQUIRED = 3;
const MIN_ACCURACY_THRESHOLD = 0.5;

// -----------------------------
// HELPERS
// -----------------------------
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// -----------------------------
// HYBRID DATA SOURCE
// -----------------------------
function getMarketData() {
  try {
    // Placeholder for real API later
    return {
      source: "synthetic",
      data: {
        rates: randomChoice(["rising", "falling"]),
        liquidity: randomChoice(["tight", "supportive"]),
        crude: randomChoice(["rising", "falling"]),
        fii: randomChoice(["buying", "selling"])
      }
    };
  } catch (e) {
    return {
      source: "synthetic",
      data: {
        rates: "neutral",
        liquidity: "neutral",
        crude: "neutral",
        fii: "neutral"
      }
    };
  }
}

// -----------------------------
// SIGNAL LOGIC
// -----------------------------
function generatePortfolio(inputs) {
  let score = { NBFC: 0, PSU_BANK: 0, IT: 0, FMCG: 0 };

  if (inputs.rates === "rising") {
    score.PSU_BANK += 2 * signalWeights.rates;
    score.NBFC -= 1 * signalWeights.rates;
  }

  if (inputs.liquidity === "supportive") {
    score.PSU_BANK += 1 * signalWeights.liquidity;
    score.NBFC += 1 * signalWeights.liquidity;
  }

  if (inputs.crude === "falling") {
    score.FMCG += 1 * signalWeights.crude;
  }

  if (inputs.fii === "buying") {
    score.IT += 1 * signalWeights.fii;
  }

  return {
    NBFC: Math.max(0, 25 + score.NBFC),
    PSU_BANK: Math.max(0, 25 + score.PSU_BANK),
    IT: Math.max(0, 25 + score.IT),
    FMCG: Math.max(0, 25 + score.FMCG)
  };
}

// -----------------------------
// ROUTES
// -----------------------------
app.post('/brain-auto', (req, res) => {
  const market = getMarketData();

  const output = generatePortfolio(market.data);

  const record = {
    id: Date.now(),
    inputsUsed: market.data,
    source: market.source,
    output,
    outcome: null,
    signalPerformance: null
  };

  evaluations.push(record);

  res.json(record);
});

// -----------------------------
app.post('/evaluate-performance', (req, res) => {
  const last = evaluations[evaluations.length - 1];
  if (!last) return res.json({ status: "no data" });

  // synthetic outcome
  const correct = Math.random() > 0.4;

  last.outcome = {
    result: correct ? "correct" : "wrong",
    source: last.source
  };

  res.json({ status: "evaluated", source: last.source });
});

// -----------------------------
app.post('/compute-signal-performance', (req, res) => {
  const valid = evaluations.filter(e => e.outcome);

  if (valid.length < MIN_EVAL_REQUIRED) {
    return res.json({ status: "SKIPPED", reason: "Not enough data" });
  }

  let correctCount = valid.filter(v => v.outcome.result === "correct").length;
  let accuracy = correctCount / valid.length;

  res.json({ status: "computed", accuracy });
});

// -----------------------------
app.post('/update-signal-weights', (req, res) => {
  const valid = evaluations.filter(e => e.outcome);

  if (valid.length < MIN_EVAL_REQUIRED) {
    return res.json({ status: "SKIPPED", reason: "Not enough data" });
  }

  let correctCount = valid.filter(v => v.outcome.result === "correct").length;
  let accuracy = correctCount / valid.length;

  // -----------------------------
  // 🚨 REGRESSION GUARD
  // -----------------------------
  if (accuracy < MIN_ACCURACY_THRESHOLD) {
    signalWeights = { ...lastGoodWeights };
    return res.json({
      status: "BLOCKED",
      reason: "Accuracy dropped - auto rollback triggered",
      accuracy
    });
  }

  // Save checkpoint
  lastGoodWeights = { ...signalWeights };

  // -----------------------------
  // 🧠 DATA-CONFIDENCE LEARNING
  // -----------------------------
  valid.forEach(v => {
    const sourceMultiplier = (v.outcome.source === "real") ? 1.0 : 0.25;

    // Optional safety: skip low-quality synthetic
    if (v.outcome.source === "synthetic" && accuracy < 0.5) return;

    Object.keys(signalWeights).forEach(k => {
      if (v.outcome.result === "correct") {
        signalWeights[k] += 0.1 * sourceMultiplier;
      } else {
        signalWeights[k] -= 0.1 * sourceMultiplier;
      }

      signalWeights[k] = Math.max(0.1, Math.min(2, signalWeights[k]));
    });
  });

  res.json({
    status: "UPDATED",
    signalWeights,
    accuracy
  });
});

// -----------------------------
app.get('/signal-weights', (req, res) => {
  res.json(signalWeights);
});

// -----------------------------
app.get('/regression-check', (req, res) => {
  let issues = [];

  if (!signalWeights) issues.push("Missing weights");
  if (!evaluations) issues.push("Missing evaluations");

  res.json({
    status: issues.length ? "FAIL" : "PASS",
    issues,
    evaluations: evaluations.length
  });
});

// -----------------------------
app.listen(3000, () => {
  console.log("DSS running on port 3000");
});
