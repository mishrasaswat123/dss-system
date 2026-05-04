require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// ===== ROUTES =====

// Existing technical API (KEEP THIS)
app.get("/api/technical/nifty", async (req, res) => {
  try {
    // If you already have logic here, KEEP it
    // This is fallback mock (only if needed)

    res.json({
      status: "OK",
      symbol: "NIFTY 50",
      lastClose: 23997.55,
      signals: {
        rsi: { value: 50.27, label: "WATCH" },
        macd: { value: 72.42, label: "BUY" },
        stochastic: { value: 42.25, label: "NEUTRAL" }
      },
      dma: {
        dma50: 24137.63,
        dma200: 25101.17,
        label: "BEARISH"
      },
      adx: {
        value: 4.77,
        label: "WEAK_TREND"
      }
    });

  } catch (err) {
    res.status(500).json({ error: "Technical API failed" });
  }
});

// ===== NEW EQUITY ROUTE =====
const equityRoutes = require("./routes/equity.routes");
app.use("/api/equity", equityRoutes);

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("DSS Backend Running 🚀");
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
