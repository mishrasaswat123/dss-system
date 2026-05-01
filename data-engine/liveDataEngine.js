const https = require("https");

// ------------------------------
// HELPER: HTTP GET (NO DEPENDENCY)
// ------------------------------
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";

        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

// ------------------------------
// YAHOO FINANCE ENDPOINTS
// ------------------------------
const YAHOO_CRUDE =
  "https://query1.finance.yahoo.com/v8/finance/chart/CL=F";

const YAHOO_VIX =
  "https://query1.finance.yahoo.com/v8/finance/chart/^VIX";

// ------------------------------
// FETCH CRUDE PRICE
// ------------------------------
async function getCrudePrice() {
  try {
    const data = await fetchJSON(YAHOO_CRUDE);
    const price =
      data.chart.result[0].meta.regularMarketPrice;

    return {
      value: price,
      reliability: 1,
      source: "yahoo",
    };
  } catch (err) {
    return {
      value: null,
      reliability: 0,
      source: "fallback",
    };
  }
}

// ------------------------------
// FETCH VIX
// ------------------------------
async function getVix() {
  try {
    const data = await fetchJSON(YAHOO_VIX);
    const vix =
      data.chart.result[0].meta.regularMarketPrice;

    return {
      value: vix,
      reliability: 1,
      source: "yahoo",
    };
  } catch (err) {
    return {
      value: null,
      reliability: 0,
      source: "fallback",
    };
  }
}

// ------------------------------
// SIGNAL MAPPING
// ------------------------------
function mapCrudeSignal(price) {
  if (price === null) return "neutral";
  if (price > 85) return "rising";
  if (price < 75) return "falling";
  return "neutral";
}

function mapVixSignal(vix) {
  if (vix === null) return "neutral";
  if (vix > 18) return "high";
  if (vix < 14) return "low";
  return "neutral";
}

// ------------------------------
// MAIN ENGINE
// ------------------------------
async function getLiveSignals() {
  const [crude, vix] = await Promise.all([
    getCrudePrice(),
    getVix(),
  ]);

  return {
    crudePrice: crude.value,
    vixValue: vix.value,

    signals: {
      crude: mapCrudeSignal(crude.value),
      vix: mapVixSignal(vix.value),
    },

    reliability: {
      crude: crude.reliability,
      vix: vix.reliability,
    },

    source: {
      crude: crude.source,
      vix: vix.source,
    },
  };
}

module.exports = { getLiveSignals };
