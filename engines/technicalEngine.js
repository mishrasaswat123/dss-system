const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

async function getNiftyTechnical() {
  try {
    const result = await yahooFinance.chart("^NSEI", {
      period1: Math.floor(new Date("2024-01-01").getTime() / 1000),
      interval: "1d"
    });

    const quotes = result.quotes;

    const closes = quotes.map(q => q.close).filter(Boolean);
    const highs = quotes.map(q => q.high).filter(Boolean);
    const lows = quotes.map(q => q.low).filter(Boolean);

    if (closes.length < 200) throw new Error("Not enough data");

    const lastClose = closes[closes.length - 1];

    // =========================
    // CORE INDICATORS
    // =========================

    const rsi = calculateRSI(closes);
    const macdData = calculateMACD(closes);
    const stochastic = calculateStochastic(highs, lows, closes);

    const dma50 = calculateSMA(closes, 50);
    const dma200 = calculateSMA(closes, 200);

    const bb = calculateBollinger(closes);
    const adxData = calculateADXFull(highs, lows, closes);

    const sr = calculateSupportResistanceAdvanced(highs, lows);

    const trend = getTrendSignal(lastClose, dma50, dma200);

    // =========================
    // SIGNAL MAPPING
    // =========================

    const signals = {
      rsi: mapRSI(rsi),
      macd: mapMACD(macdData),
      stochastic: mapStochastic(stochastic),
      bollinger: mapBollinger(lastClose, bb),
      dma: mapDMA(lastClose, dma50, dma200),
      adx: mapADX(adxData)
    };

    // =========================
    // SCORING ENGINE
    // =========================

    const score = calculateScore(signals);

    const finalSignal =
      score >= 70 ? "STRONG BUY" :
      score >= 55 ? "BUY" :
      score >= 45 ? "NEUTRAL" :
      score >= 30 ? "SELL" :
      "STRONG SELL";

    const confidence =
      adxData.adx > 25 ? "HIGH" :
      adxData.adx > 18 ? "MEDIUM" :
      "LOW";

    const marketState =
      adxData.adx > 25 ? "TRENDING" : "RANGE";

    return {
      status: "OK",
      symbol: "NIFTY 50",
      lastClose,

      score,
      signal: finalSignal,
      confidence,
      marketState,

      signals,

      dma: {
        dma50: round(dma50),
        dma200: round(dma200)
      },

      supportResistance: sr,
      trend,

      raw: {
        rsi,
        macd: macdData,
        stochastic,
        adx: adxData
      },

      timestamp: Date.now()
    };

  } catch (err) {
    console.error("TECH ERROR:", err.message);
    throw new Error("TECHNICAL_FETCH_FAILED");
  }
}

module.exports = { getNiftyTechnical };


// =========================
// SCORING ENGINE
// =========================

function calculateScore(s) {
  let score = 50;

  // RSI
  if (s.rsi.label === "OVERSOLD") score += 10;
  if (s.rsi.label === "OVERBOUGHT") score -= 10;

  // MACD
  if (s.macd.label === "BUY") score += 15;
  if (s.macd.label === "SELL") score -= 15;

  // Stochastic
  if (s.stochastic.label === "OVERSOLD") score += 8;
  if (s.stochastic.label === "OVERBOUGHT") score -= 8;

  // DMA
  if (s.dma.label === "BULLISH") score += 10;
  if (s.dma.label === "BEARISH") score -= 10;

  // Bollinger
  if (s.bollinger.label === "OVERSOLD") score += 5;
  if (s.bollinger.label === "OVERBOUGHT") score -= 5;

  return Math.max(0, Math.min(100, score));
}


// =========================
// SIGNAL MAPPERS
// =========================

function mapRSI(rsi) {
  if (rsi > 70) return { value: round(rsi), label: "OVERBOUGHT" };
  if (rsi < 30) return { value: round(rsi), label: "OVERSOLD" };
  return { value: round(rsi), label: "WATCH" };
}

function mapMACD(m) {
  return {
    value: round(m.macd),
    label: m.macd > m.signal ? "BUY" : "SELL"
  };
}

function mapStochastic(s) {
  if (s.k > 80) return { value: round(s.k), label: "OVERBOUGHT" };
  if (s.k < 20) return { value: round(s.k), label: "OVERSOLD" };
  return { value: round(s.k), label: "NEUTRAL" };
}

function mapBollinger(price, bb) {
  if (price < bb.lower) return { label: "OVERSOLD" };
  if (price > bb.upper) return { label: "OVERBOUGHT" };
  return { label: "NORMAL" };
}

function mapDMA(price, dma50, dma200) {
  if (price > dma50 && dma50 > dma200) return { label: "BULLISH" };
  if (price < dma50 && dma50 < dma200) return { label: "BEARISH" };
  return { label: "NEUTRAL" };
}

function mapADX(adx) {
  return {
    value: round(adx.adx),
    label: adx.adx > 25 ? "STRONG_TREND" : "WEAK_TREND"
  };
}


// =========================
// INDICATORS
// =========================

function calculateRSI(data, period = 14) {
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * 13 + diff) / 14;
      avgLoss = (avgLoss * 13) / 14;
    } else {
      avgGain = (avgGain * 13) / 14;
      avgLoss = (avgLoss * 13 - diff) / 14;
    }
  }

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateEMA(data, period) {
  const k = 2 / (period + 1);
  let ema = [data[0]];
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calculateMACD(data) {
  const ema12 = calculateEMA(data, 12);
  const ema26 = calculateEMA(data, 26);

  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine.slice(26), 9);

  return {
    macd: macdLine.at(-1),
    signal: signalLine.at(-1)
  };
}

function calculateSMA(data, period) {
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calculateBollinger(data, period = 20) {
  const slice = data.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: mean + 2 * std,
    lower: mean - 2 * std
  };
}

function calculateStochastic(highs, lows, closes, period = 14) {
  const h = Math.max(...highs.slice(-period));
  const l = Math.min(...lows.slice(-period));
  const c = closes.at(-1);

  return { k: ((c - l) / (h - l)) * 100 };
}


// ===== TRUE ADX =====
function calculateADXFull(highs, lows, closes, period = 14) {
  let trs = [], plusDM = [], minusDM = [];

  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }

  const atr = avg(trs.slice(-period));
  const pDM = avg(plusDM.slice(-period));
  const mDM = avg(minusDM.slice(-period));

  const pDI = (pDM / atr) * 100;
  const mDI = (mDM / atr) * 100;

  const dx = Math.abs(pDI - mDI) / (pDI + mDI) * 100;

  return { adx: dx, pDI, mDI };
}


// ===== ADVANCED S/R =====
function calculateSupportResistanceAdvanced(highs, lows) {
  const recentHighs = highs.slice(-50);
  const recentLows = lows.slice(-50);

  return {
    support: round(Math.min(...recentLows)),
    resistance: round(Math.max(...recentHighs))
  };
}


// =========================
// UTILS
// =========================

const round = n => Number(n.toFixed(2));
const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length;

function getTrendSignal(price, dma50, dma200) {
  if (price > dma50 && dma50 > dma200) return "STRONG UPTREND";
  if (price > dma50) return "UPTREND";
  if (price < dma50 && dma50 < dma200) return "DOWNTREND";
  return "SIDEWAYS";
}
