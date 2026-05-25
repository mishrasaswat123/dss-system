#!/usr/bin/env python3
"""
Session 20C Patch 3: /api/v1/signals GET → reads RegimeEngine, no independent buildSignals/getRegime.
App.js does not call this route. Zero frontend regression risk.
"""
import sys

SRC = "/home/ubuntu/dss-system/server.js"

with open(SRC, "r") as f:
    code = f.read()

OLD = '''\t\t\tconst body = {};

\t\t\tconst inputs = await safeExecuteAsync(
\t\t\t  () => autoFillInputs(body),
\t\t\t  DEFAULT_SIGNALS
\t\t\t);

\t\t\tconst niftyData = await safeExecuteAsync(
\t\t\t  fetchNiftyData,
\t\t\t  null
\t\t\t);

\t\t\tlet trendSignal = "neutral";
\t\t\tlet momentumSignal = "neutral";
\t\t\tlet strengthSignal = "neutral";
\t\t\tlet breadthSignal = 0.5;

\t\t\tif (
\t\t\t  niftyData &&
\t\t\t  Array.isArray(niftyData.prices) &&
\t\t\t  niftyData.prices.length >= 50
\t\t\t) {

\t\t\t  const ema20 = EMA(niftyData.prices.slice(-20), 20);
\t\t\t  const ema50 = EMA(niftyData.prices.slice(-50), 50);

\t\t\t  if (ema20 && ema50) {
\t\t\t\ttrendSignal = ema20 > ema50 ? "bullish" : "bearish";
\t\t\t  }

\t\t\t  if (ema20 && niftyData.current) {

\t\t\t\tconst momentumDiff =
\t\t\t\t  (niftyData.current - ema20) / ema20;

\t\t\t\tif (momentumDiff > 0.002) {
\t\t\t\t  momentumSignal = "bullish";
\t\t\t\t} else if (momentumDiff < -0.002) {
\t\t\t\t  momentumSignal = "bearish";
\t\t\t\t}
\t\t\t  }

\t\t\t  const openPrice =
\t\t\t\tniftyData.open ||
\t\t\t\tniftyData.prices?.[0] ||
\t\t\t\tniftyData.current;

\t\t\t  const strength =
\t\t\t\topenPrice
\t\t\t\t  ? (niftyData.current - openPrice) / openPrice
\t\t\t\t  : 0;

\t\t\t  if (strength > 0.002) {
\t\t\t\tstrengthSignal = "strong";
\t\t\t  } else if (strength < -0.002) {
\t\t\t\tstrengthSignal = "weak";
\t\t\t  }

\t\t\t  breadthSignal =
\t\t\t\topenPrice &&
\t\t\t\t(niftyData.current - openPrice) > 0
\t\t\t\t  ? 0.6
\t\t\t\t  : 0.4;
\t\t\t}

\t\t\tinputs.trend = trendSignal;
\t\t\tinputs.momentum = momentumSignal;
\t\t\tinputs.strength = strengthSignal;
\t\t\tinputs.breadth = breadthSignal;

\t\t\tlet { signals, compositeScore } =
\t\t\t  buildSignals(inputs, "NEUTRAL");

\t\t\tlet regime = getRegime(compositeScore);

\t\t\t({ signals, compositeScore } =
\t\t\t  buildSignals(inputs, regime));

\t\t\tconst intelligence =
\t\t\t  computeSignalIntelligence(signals);

\t\t\tconst confidence =
\t\t\t  getConfidence(signals);

\t\t\tconst marketQuality =
\t\t\t  getMarketQuality(confidence);

\t\t\tconst response =
\t\t\t  buildSignalsResponse({
\t\t\t\tregime,
\t\t\t\tcompositeScore,
\t\t\t\tconfidence,
\t\t\t\tmarketQuality,
\t\t\t\tsignals,
\t\t\t\tintelligence
\t\t\t  });

\t\t\treturn res.json({
\t\t\t  status: "OK",
\t\t\t  timestamp: Date.now(),
\t\t\t  dataStatus: "live",
\t\t\t  data: response
\t\t\t});'''

NEW = '''\t\t\t// ── SESSION 20C P3: /api/v1/signals reads RegimeEngine only ──
\t\t\tconst _rd3 = regimeEngine.read();
\t\t\tconst compositeScore = _rd3.compositeScore;
\t\t\tconst regime = _rd3.regime;
\t\t\tconst confidence = Math.round((_rd3.activeWeightSum || 0.6) * 100);
\t\t\tconst marketQuality = confidence >= 70 ? "STRONG" : confidence >= 50 ? "MODERATE" : "WEAK";
\t\t\tconst _nse3 = DSSCache.get("nse:index") || {};
\t\t\tconst _fl3  = DSSCache.get("equity:flows") || {};
\t\t\tconst signals = {
\t\t\t  rates:    { value: "neutral",                                        score: 0,                      weight: 0.2,  reliability: 1, strength: "neutral" },
\t\t\t  liquidity:{ value: (_fl3.fiiEquity||0)>0?"supportive":"tightening", score: (_fl3.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
\t\t\t  crude:    { value: "neutral",                                        score: 0,                      weight: 0.15, reliability: 1, strength: "neutral" },
\t\t\t  fii:      { value: (_fl3.fiiEquity||0)>0?"buying":"selling",        score: (_fl3.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
\t\t\t  vix:      { value: (_nse3.vixValue||15)>20?"high":"low",            score: (_nse3.vixValue||15)>20?-1:1,weight:0.15,reliability:1,strength:"neutral" },
\t\t\t  trend:    { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t\t  momentum: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t\t  strength: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t\t  breadth:  { value: 0.5,       score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
\t\t\t};
\t\t\tconst intelligence = computeSignalIntelligence(signals);
\t\t\tconst response = buildSignalsResponse({ regime, compositeScore, confidence, marketQuality, signals, intelligence });
\t\t\t// ── END SESSION 20C P3 ──
\t\t\treturn res.json({
\t\t\t  status: "OK",
\t\t\t  timestamp: Date.now(),
\t\t\t  dataStatus: "live",
\t\t\t  data: response
\t\t\t});'''

if OLD not in code:
    print("ERROR: signals route old block not found.")
    sys.exit(1)

code = code.replace(OLD, NEW, 1)

with open(SRC, "w") as f:
    f.write(code)

print("Patch 3 applied: /api/v1/signals GET → RegimeEngine")

