const express = require("express");
const router = express.Router();

const { getNiftyData } = require("../services/marketData");
const {
  calculateRSI,
  calculateMACD,
  interpretRSI,
  interpretMACD,
} = require("../engines/technicalEngine");

router.post("/equity-signals", async (req, res) => {
  try {
    const data = await getNiftyData();

    const rsi = calculateRSI(data.closes);
    const macd = calculateMACD(data.closes);

    const rsiView = interpretRSI(rsi);
    const macdView = interpretMACD(macd.macd, macd.signal);

    res.json({
      index: {
        name: "NIFTY 50",
        ltp: Number(data.ltp.toFixed(2)),
        change: Number(data.change.toFixed(2)),
        changePct: Number(data.changePct.toFixed(2)),
      },
      technicals: {
        rsi: {
          value: Number(rsi.toFixed(2)),
          ...rsiView,
        },
        macd: {
          value: Number(macd.macd.toFixed(2)),
          ...macdView,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "EQUITY_SIGNALS_FAILED" });
  }
});

module.exports = router;
