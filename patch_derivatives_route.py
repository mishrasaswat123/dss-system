import sys

path = "/home/ubuntu/dss-system/server.js"
with open(path, "r") as f:
    content = f.read()

anchor = ");\n\napp.get(\"/health\", (req, res) => {"

NEW_ROUTE = r"""
);

// ============================================================
// GET /api/v1/derivatives — Derivatives Surface (Session 20K)
// CACHE-READ-ONLY: reads nse:optionchain, nse:index, equity:flows, score:derivatives
// No fetch(), no recomputation. Scheduler writes all inputs.
// ============================================================
app.get("/api/v1/derivatives", (req, res) =>
  safeExecuteAsync(async () => {
    const optchain   = DSSCache.get("nse:optionchain")   || {};
    const nseIndex   = DSSCache.get("nse:index")         || {};
    const flows      = DSSCache.get("equity:flows")      || {};
    const scoreDeriv = DSSCache.get("score:derivatives") || { score: null, confidence: 0 };

    // KPIs
    const indiaVix     = nseIndex.vixValue           != null ? nseIndex.vixValue           : null;
    const pcr          = flows.pcr                   != null ? flows.pcr                   : null;
    const fiiFuturesOI = flows.fiiFuturesPositioning != null ? flows.fiiFuturesPositioning : null;

    // Max Pain + OI Levels from cached option chain
    var maxPain  = null;
    var oiLevels = [];
    try {
      var chainData = optchain.data || null;
      var rows = [];
      if (chainData && Array.isArray(chainData.records && chainData.records.data) && chainData.records.data.length > 0) {
        rows = chainData.records.data;
      } else if (chainData && Array.isArray(chainData.filtered && chainData.filtered.data) && chainData.filtered.data.length > 0) {
        rows = chainData.filtered.data;
      }
      if (rows.length > 0) {
        var strikeMap = {};
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var strike = (row && row.strikePrice) || (row && row.PE && row.PE.strikePrice) || (row && row.CE && row.CE.strikePrice);
          if (!strike) continue;
          if (!strikeMap[strike]) strikeMap[strike] = { strike: strike, peOI: 0, ceOI: 0 };
          strikeMap[strike].peOI += Number((row.PE && row.PE.openInterest) || 0);
          strikeMap[strike].ceOI += Number((row.CE && row.CE.openInterest) || 0);
        }
        var strikes = Object.values(strikeMap)
          .map(function(s) { return { strike: s.strike, peOI: s.peOI, ceOI: s.ceOI, totalOI: s.peOI + s.ceOI }; })
          .sort(function(a, b) { return b.totalOI - a.totalOI; });
        oiLevels = strikes.slice(0, 10);
        if (strikes.length > 0) maxPain = strikes[0].strike;
      }
    } catch (e) { /* non-fatal */ }

    // VIX Regime
    var vixRegimeLabel = "UNAVAILABLE";
    if (indiaVix !== null) {
      vixRegimeLabel = indiaVix < 12 ? "LOW" : indiaVix < 16 ? "MODERATE" : indiaVix < 22 ? "ELEVATED" : "EXTREME";
    }

    // Signals
    var signals = [];
    if (pcr !== null) {
      signals.push({
        name:       "PCR",
        value:      pcr,
        signal:     pcr > 1.2 ? "BUY" : pcr < 0.8 ? "SELL" : "WATCH",
        sentiment:  pcr > 1.2 ? "bullish" : pcr < 0.8 ? "bearish" : "neutral",
        confidence: scoreDeriv.confidence || 0.42,
        source:     "nse-option-chain",
        timestamp:  flows.timestamp || Date.now(),
      });
    }
    if (indiaVix !== null) {
      signals.push({
        name:       "India VIX",
        value:      indiaVix,
        signal:     indiaVix < 16 ? "BUY" : indiaVix > 22 ? "SELL" : "WATCH",
        sentiment:  indiaVix < 16 ? "bullish" : indiaVix > 22 ? "bearish" : "neutral",
        confidence: 0.78,
        source:     "nse-index",
        timestamp:  nseIndex.timestamp || Date.now(),
      });
    }

    // dataStatus
    var hasPcr = pcr !== null;
    var hasVix = indiaVix !== null;
    var dataStatus = (hasPcr && hasVix) ? "live" : hasVix ? "stale" : "unavailable";

    return res.json({
      status:     "OK",
      timestamp:  Date.now(),
      dataStatus: dataStatus,
      data: {
        kpis: {
          indiaVix:    indiaVix,
          pcr:         pcr,
          maxPain:     maxPain,
          fiiFuturesOI: fiiFuturesOI,
        },
        vixRegime: {
          regime: vixRegimeLabel,
          vix:    indiaVix,
        },
        oiLevels:        oiLevels,
        signals:         signals,
        derivativesScore: scoreDeriv.score != null ? scoreDeriv.score : null,
      },
    });
  }, res)
);

app.get("/health", (req, res) => {"""

if anchor not in content:
    print("ERROR: anchor not found")
    idx = content.find('app.get("/health"')
    if idx >= 0:
        print("health route found, context around it:")
        print(repr(content[idx-50:idx+50]))
    sys.exit(1)

new_content = content.replace(anchor, NEW_ROUTE, 1)
with open(path, "w") as f:
    f.write(new_content)
print("PATCH 1 applied successfully — line count: " + str(new_content.count("\n")))
