#!/usr/bin/env python3
"""
Session 20C Patch 2: /brain-auto POST route → reads RegimeEngine, no independent buildSignals/getRegime.
Preserves: risk pipeline, memory, DB logging, response shape.
"""
import sys

SRC = "/home/ubuntu/dss-system/server.js"

with open(SRC, "r") as f:
    code = f.read()

# ── BLOCK A: remove niftyData fetch + buildSignals + getRegime ──
# From "const inputs = await safeExecuteAsync" through end of stability engine
# ending just before "({ signals, compositeScore } = safeExecute(() => buildSignals(inputs, regime)"

OLD_A = '''\t\t  const inputs = await safeExecuteAsync(
\t\t  () => autoFillInputs(body),
\t\t  DEFAULT_SIGNALS
\t\t);
\t\t// REMOVE THESE 2 LINES
\t\t// if (!inputs.crude) inputs.crude = lastCrudeSignal;
\t\t// if (!inputs.vix) inputs.vix = lastVixSignal;
\t\t  // const liveData = await getLiveSignals();
\t\t// 📊 Compute Trend from NIFTY
\t\tconst niftyData = await safeExecuteAsync(
\t\t  fetchNiftyData,
\t\t  null
\t\t);

\t\tlet trendSignal = "neutral";
\t\tlet momentumSignal = "neutral";
\t\tlet strengthSignal = "neutral";
\t\tlet breadthSignal = 0.5;

\t\tif (niftyData && Array.isArray(niftyData.prices) && niftyData.prices.length >= 50) {
\t\t  if (!niftyData.current) {
\t\t\ttrendSignal = "neutral";
\t\t\tmomentumSignal = "neutral";
\t\t\tstrengthSignal = "neutral";
\t\t\tbreadthSignal = 0.5;
\t\t  } else {
\t\t  const ema20 = EMA(niftyData.prices.slice(-20), 20);
\t\t  const ema50 = EMA(niftyData.prices.slice(-50), 50);

\t\t  // ✅ TREND
\t\t  if (ema20 && ema50) {
\t\t  trendSignal = ema20 > ema50 ? "bullish" : "bearish";
\t\t} else {
\t\t  trendSignal = "neutral";
\t\t}

\t\t  // ✅ MOMENTUM
\t\t  if (ema20 && ema20 !== 0) {
\t\t  const momentumDiff = (niftyData.current - ema20) / ema20;

\t\t  if (momentumDiff > 0.002) momentumSignal = "bullish";
\t\t  else if (momentumDiff < -0.002) momentumSignal = "bearish";
\t\t  else momentumSignal = "neutral";
\t\t} else {
\t\t  momentumSignal = "neutral";
\t\t}

\t\t  // ✅ STRENGTH
\t\t  const openPrice = niftyData.open || niftyData.prices?.[0] || niftyData.current;

\t\tconst strength = openPrice
\t\t  ? (niftyData.current - openPrice) / openPrice
\t\t  : 0;

\t\t if (strength > 0.002) {
\t\t  strengthSignal = "strong";
\t\t} else if (strength < -0.002) {
\t\t  strengthSignal = "weak";
\t\t} else {
\t\t  strengthSignal = "neutral";
\t\t}

\t\t  // ✅ BREADTH
\t\t\tbreadthSignal = openPrice
\t\t\t? (niftyData.current - openPrice) > 0 ? 0.6 : 0.4
\t\t\t: 0.5;
\t\t  }
\t\t}  // ✅ THIS LINE WAS MISSING



\t\t// OVERRIDE INPUT
\t\t// ✅ Respect manual input priority (CRITICAL FIX)
\t\tinputs.trend = body.trend ?? trendSignal;
\t\tinputs.momentum = body.momentum ?? momentumSignal;
\t\tinputs.strength = body.strength ?? strengthSignal;
\t\tinputs.breadth = body.breadth ?? breadthSignal;

\t\t// EXISTING

\t\t// inputs.crude = liveData.signals.crude;
\t\t// inputs.vix = liveData.signals.vix;

\t\t  let { signals, compositeScore } = safeExecute(
\t\t  () => buildSignals(inputs, "NEUTRAL"),
\t\t  { signals: {}, compositeScore: 50 }
\t\t);

\t\tlet regime = getRegime(compositeScore);

\t\t// ===== D27.1 REGIME TRACKING =====
\t\tif (regime !== MEMORY.lastSnapshot?.regime) {
\t\t  MEMORY.lastRegimeChangeTs = Date.now();
\t\t  MEMORY.cyclesSinceChange = 0;
\t\t} else {
\t\t  MEMORY.cyclesSinceChange += 1;
\t\t}

\t\t// ==============================
\t\t// REGIME STABILITY ENGINE
\t\t// ==============================

\t\tconst prevRegime = MEMORY.regimeHistory?.slice(-1)[0]?.regime;

\t\tif (prevRegime && prevRegime !== regime) {
\t\t  const scoreDiff = Math.abs(compositeScore - 50);

\t\t  // Prevent weak flips
\t\t  if (scoreDiff < 10) {
\t\t\tregime = prevRegime;
\t\t\tlogger.warn("Regime flip prevented (stability filter)");
\t\t  }
\t\t}

\t\t({ signals, compositeScore } = safeExecute(
\t\t  () => buildSignals(inputs, regime),
\t\t  { signals, compositeScore }
\t\t));


\t\t// 🔻 FALLBACK INTELLIGENCE LAYER (ADD EXACTLY HERE)

\t\tif (fallbackState.crude) {
\t\t  if (signals.crude) {
\t\t\tsignalReliability.crude = Math.max(0.8, signalReliability.crude * 0.9);
\t\tsignals.crude.reliability = signalReliability.crude;
\t\t  }
\t\t  logger.warn("Crude using fallback — reliability reduced");
\t\t}

\t\tif (fallbackState.vix) {
\t\t  if (signals.vix) {
\t\t\tsignalReliability.vix = Math.max(0.8, signalReliability.vix * 0.9);
\t\tsignals.vix.reliability = signalReliability.vix;
\t\t  }
\t\t  logger.warn("VIX using fallback — reliability reduced");
\t\t}

\t\t  const intelligence = computeSignalIntelligence(signals);
\t\t  let confidence = getConfidence(signals);
\t\t// ==============================
\t\t// ADAPTIVE CONFIDENCE CALIBRATION
\t\t// ==============================



\t\t// 🔻 degrade confidence if fallback used
\t\tif (fallbackState.crude || fallbackState.vix) {
\t\t  confidence = Math.max(20, Math.round(confidence * 0.8));
\t\t}
\t\t// ✅ FIX 2 — Prevent under-confidence in strong regimes
\t\tif (regime === "STRONG RISK ON") {
\t\t  confidence = Math.max(confidence, 60);
\t\t} else if (regime === "RISK ON") {
\t\t  confidence = Math.max(confidence, 50);
\t\t}
\t\t// ===== D27.1 CONFIDENCE SMOOTHING =====
\t\tconst prevConfidence = MEMORY.lastSnapshot?.confidence || confidence;
\t\tconfidence = smoothConfidence(prevConfidence, confidence);

\t\t  const marketQuality = getMarketQuality(confidence);
\t\t  const sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
\t\t  // const strategy = buildStrategy(regime, confidence, marketQuality, sectorAllocation);
\t\t\t// const tradeDecision = buildTradeDecision(regime, confidence, marketQuality, intelligence, signals);
\t\t \n\t\t  updateSignalReliability(signals);'''

NEW_A = '''\t\t// ── SESSION 20C P2: brain-auto POST reads RegimeEngine only ──
\t\tconst _rd2 = regimeEngine.read();
\t\tconst compositeScore = _rd2.compositeScore;
\t\tlet regime = _rd2.regime;
\t\tconst _nse2 = DSSCache.get("nse:index") || {};
\t\tconst _fl2  = DSSCache.get("equity:flows") || {};
\t\tconst signals = {
\t\t  rates:    { value: "neutral",                                        score: 0,                      weight: 0.2,  reliability: 1, strength: "neutral" },
\t\t  liquidity:{ value: (_fl2.fiiEquity||0)>0?"supportive":"tightening", score: (_fl2.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
\t\t  crude:    { value: "neutral",                                        score: 0,                      weight: 0.15, reliability: 1, strength: "neutral" },
\t\t  fii:      { value: (_fl2.fiiEquity||0)>0?"buying":"selling",        score: (_fl2.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
\t\t  vix:      { value: (_nse2.vixValue||15)>20?"high":"low",            score: (_nse2.vixValue||15)>20?-1:1,weight:0.15,reliability:1,strength:"neutral" },
\t\t  trend:    { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t  momentum: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t  strength: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t  breadth:  { value: 0.5,       score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t};
\t\tconst intelligence = computeSignalIntelligence(signals);
\t\tconst prevConfidence2 = MEMORY.lastSnapshot?.confidence || 60;
\t\tlet confidence = smoothConfidence(prevConfidence2, Math.round((_rd2.activeWeightSum||0.6)*100));
\t\tconst marketQuality = confidence >= 70 ? "STRONG" : confidence >= 50 ? "MODERATE" : "WEAK";
\t\tconst sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
\t\t// ── END SESSION 20C P2 ──
\t\t// D27.1 regime tracking
\t\tif (regime !== MEMORY.lastSnapshot?.regime) { MEMORY.lastRegimeChangeTs = Date.now(); MEMORY.cyclesSinceChange = 0; } else { MEMORY.cyclesSinceChange += 1; }'''

if OLD_A not in code:
    print("ERROR: brain-auto POST old block A not found.")
    sys.exit(1)

code = code.replace(OLD_A, NEW_A, 1)

with open(SRC, "w") as f:
    f.write(code)

print("Patch 2 applied: /brain-auto POST → RegimeEngine")

