const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// ===== Helpers =====
function EMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function SMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;

  let gains = 0, losses = 0;

  for (let i = prices.length - period; i < prices.length - 1; i++) {
    const diff = prices[i + 1] - prices[i];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  const rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

function calculateBollinger(prices, period = 20) {
  if (!prices || prices.length < period) return null;

  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;

  const variance = slice.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    upper: mean + 2 * stdDev,
    lower: mean - 2 * stdDev,
    middle: mean
  };
}

// ===== Fetch =====
async function fetchNifty() {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=6mo&interval=1d";
    const res = await fetch(url);
    const json = await res.json();

    const result = json?.chart?.result?.[0];

    const closesRaw = result?.indicators?.quote?.[0]?.close || [];
    const closes = closesRaw.filter(v => v !== null && v !== undefined);
    const current = result?.meta?.regularMarketPrice;

    return { closes, current };

  } catch (err) {
    return { closes: null, current: null };
  }
}

// NSE Breadth
async function fetchBreadth() {
  try {
    const res = await fetch("https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%2050", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
      }
    });

    const json = await res.json();
    const stocks = json?.data || [];

    let advances = 0, declines = 0;

    stocks.forEach(s => {
      if (s.pChange > 0) advances++;
      else if (s.pChange < 0) declines++;
    });

    return { advances, declines };

  } catch (err) {
    return null;
  }
}

// ===== SCORING =====
function scoreSignal(signal) {
  if (signal === "BUY") return 100;
  if (signal === "SELL") return 0;
  return 50;
}

function computeScore(signals) {
  const weights = {
    "RSI (14)": 0.15,
    "50 DMA": 0.20,
    "MACD": 0.20,
    "Bollinger Position": 0.10,
    "Market Breadth": 0.20
  };

  let total = 0;
  let weightSum = 0;

  signals.forEach(s => {
    const w = weights[s.name];
    if (w) {
      total += scoreSignal(s.signal) * w;
      weightSum += w;
    }
  });

  return weightSum > 0 ? Math.round(total / weightSum) : 50;
}

function detectRegime(score) {
  if (score >= 65) return "RISK_ON";
  if (score <= 35) return "RISK_OFF";
  return "NEUTRAL";
}

// ===== MAIN =====
exports.fetchEquitySignals = async () => {
  try {
    const { closes, current } = await fetchNifty();

    if (!closes || closes.length < 50) {
      return {
        dataStatus: "unavailable",
        payload: { technicalSignals: [] }
      };
    }

    const rsi = calculateRSI(closes);
    const dma50 = SMA(closes, 50);

    const ema12 = EMA(closes.slice(-50), 12);
    const ema26 = EMA(closes.slice(-50), 26);
    const macd = ema12 - ema26;
    const signalLine = EMA(closes.slice(-50), 9);

    const boll = calculateBollinger(closes);
    const breadth = await fetchBreadth();

    const timestamp = Date.now();
    const signals = [];

    if (rsi !== null) {
      signals.push({
        name: "RSI (14)",
        value: Number(rsi.toFixed(2)),
        signal: rsi < 30 ? "BUY" : rsi > 70 ? "SELL" : "WATCH",
        timestamp
      });
    }

    if (dma50 !== null) {
      signals.push({
        name: "50 DMA",
        value: Number(dma50.toFixed(2)),
        signal: current > dma50 ? "BUY" : "SELL",
        timestamp
      });
    }

    if (macd !== null) {
      signals.push({
        name: "MACD",
        value: Number(macd.toFixed(2)),
        signal: macd > signalLine ? "BUY" : "SELL",
        timestamp
      });
    }

    if (boll) {
      signals.push({
        name: "Bollinger Position",
        value: Number(((current - boll.lower) / (boll.upper - boll.lower)).toFixed(2)),
        signal: current > boll.upper ? "SELL" : current < boll.lower ? "BUY" : "WATCH",
        timestamp
      });
    }

    if (breadth) {
      const ratio = breadth.advances / (breadth.declines || 1);

      signals.push({
        name: "Market Breadth",
        value: Number(ratio.toFixed(2)),
        signal: ratio > 1 ? "BUY" : "SELL",
        timestamp
      });
    }

    // ✅ FINAL DSS OUTPUT

const equityScore = computeScore(signals);
const regime = detectRegime(equityScore);

return {
  dataStatus: "live",
  payload: {
    technicalSignals: signals,
    equityScore,
    regime
  }
};

  } catch (err) {
    return {
      dataStatus: "unavailable",
      payload: { technicalSignals: [] }
    };
  }
};
