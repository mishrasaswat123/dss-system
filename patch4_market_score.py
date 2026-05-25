#!/usr/bin/env python3
"""
Session 20C Patch 4: computeMarketScore (SECTION-22) reads regimeEngine.read() directly.
Eliminates the brain:compositeScore intermediary — single authority chain.
"""
import sys

SRC = "/home/ubuntu/dss-system/server.js"

with open(SRC, "r") as f:
    code = f.read()

OLD = '''\t\tfunction computeMarketScore(cache) {
\t\t  // DEF-006: brain engine compositeScore is authoritative
\t\t  // Stored in DSSCache by brain route after each buildSignals() computation
\t\t  const brainScore = DSSCache.get('brain:compositeScore');
\t\t  if (typeof brainScore === 'number' && brainScore >= 0 && brainScore <= 100) {
\t\t    return brainScore;
\t\t  }
\t\t  // Fallback: simple technical formula (cold-start only)
\t\t  let score = 50;
\t\t  if (cache?.rsi > 60) score += 10;
\t\t  if (cache?.rsi < 40) score -= 10;
\t\t  if (cache?.macd > 0) score += 10;
\t\t  if (cache?.macd < 0) score -= 10;
\t\t  if (cache?.vixValue > 20) score -= 10;
\t\t  return Math.max(0, Math.min(100, score));
\t\t}'''

NEW = '''\t\tfunction computeMarketScore(cache) {
\t\t  // SESSION 20C: RegimeEngine is single authority — read directly
\t\t  const rd = regimeEngine.read();
\t\t  if (rd && typeof rd.compositeScore === 'number') return rd.compositeScore;
\t\t  // Cold-start fallback only (RegimeEngine not yet computed)
\t\t  let score = 50;
\t\t  if (cache?.rsi > 60) score += 10;
\t\t  if (cache?.rsi < 40) score -= 10;
\t\t  if (cache?.macd > 0) score += 10;
\t\t  if (cache?.macd < 0) score -= 10;
\t\t  if (cache?.vixValue > 20) score -= 10;
\t\t  return Math.max(0, Math.min(100, score));
\t\t}'''

if OLD not in code:
    print("ERROR: computeMarketScore old block not found.")
    sys.exit(1)

code = code.replace(OLD, NEW, 1)

with open(SRC, "w") as f:
    f.write(code)

print("Patch 4 applied: computeMarketScore → regimeEngine.read()")

