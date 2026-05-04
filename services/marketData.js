const axios = require("axios");

async function getNiftyData() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/^NSEI?range=3mo&interval=1d";

  const res = await axios.get(url);
  const result = res.data.chart.result[0];

  const closes = result.indicators.quote[0].close;
  const highs = result.indicators.quote[0].high;
  const lows = result.indicators.quote[0].low;

  const latest = closes[closes.length - 1];
  const prev = closes[closes.length - 2];

  return {
    closes,
    highs,
    lows,
    ltp: latest,
    change: latest - prev,
    changePct: ((latest - prev) / prev) * 100,
  };
}

module.exports = { getNiftyData };
