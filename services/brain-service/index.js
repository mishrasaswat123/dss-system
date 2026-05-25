const express = require("express");
const app = express();

app.use(express.json());

// ✅ MAIN DSS ROUTE
app.get("/brain", (req, res) => {

  const call = [
    "Reduce NBFC exposure",
    "Increase PSU Bank allocation"
  ];

  const reasons = [
    "Interest rates rising",
    "RBI liquidity supportive",
    "Crude adding inflation pressure",
    "FII selling trend"
  ];

  const impact = [
    "Rates ↑ → NBFC ↓ → Risk ↑",
    "Rates ↑ → PSU Banks ↑ → Opportunity"
  ];

  const risk = [
    "Rate-sensitive sectors under pressure",
    "Inflation risk increasing",
    "Market volatility risk increasing"
  ];

  const actions = [
    "Reduce NBFC exposure",
    "Increase PSU Bank allocation"
  ];

  res.json({
    call,
    horizon: "3-6 Months",
    confidence: "HIGH",
    reasons,
    impact,
    risk,
    actions,
    message:
      "We are reducing NBFC exposure and increasing PSU bank allocation.",
    timestamp: new Date().toLocaleString()
  });
});

// health check
app.get("/", (req, res) => {
  res.send("Brain Service Running");
});

// IMPORTANT
app.listen(5000, "0.0.0.0", () => {
  console.log("Brain service running on port 5000");
});
