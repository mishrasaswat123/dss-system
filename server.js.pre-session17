/*
	VERSION: MVP-9-D26-BASELINE
	FEATURES:
	- Signal Persistence
	- V8 Memory Engine
	- Regime Intelligence
	- Adaptive Position Sizing (V9)
	- Stability Engine
	STATUS: PRODUCTION BASELINE
*/

////////////////////////////////////////////////////////
// SECTION MAP — ADVISIQ DSS server.js
// Phase A — Structural Hardening (Task A1 + A2)
// Use Ctrl+F on "SECTION-XX" to jump to any section
////////////////////////////////////////////////////////
//
// SECTION-01 : ENV + CONFIG
// SECTION-02 : IMPORTS + APP INIT
// SECTION-03 : GLOBAL CONSTANTS + TTLs
// SECTION-04 : ENUMS (SIGNAL / SENTIMENT / DATA_STATUS / ERROR)
// SECTION-05 : CACHE LAYER (DSSCache)
// SECTION-06 : MEMORY LAYER
// SECTION-07 : LOGGING
// SECTION-08 : SAFE EXECUTION
// SECTION-09 : FETCH UTILITIES (fetchWithRetry / safeFetch / safeFetchText)
// SECTION-10 : CIRCUIT BREAKER + FETCH ENGINES (crude / vix)
// SECTION-11 : MACRO PARSERS (TradingEconomics / GST / PMI / AMFI)
// SECTION-12 : MACRO ENGINE (fetchMacroEconomics)
// SECTION-13 : NSE FLOW ENGINE (FII / DII / PCR / Positioning)
// SECTION-14 : FUNDAMENTAL ENGINE
// SECTION-15 : GLOBAL MACRO ENGINE (deriveFedPolicy / buildGlobalMacroPayload)
// SECTION-16 : TECHNICAL ENGINE (EMA / RSI / SMA / buildEquitySignals)
// SECTION-17 : SECTOR ENGINE (fetchSectorData / classifySectorPhase / buildSectorPayload)
// SECTION-18 : DEBT ENGINE (buildYieldCurve / buildRateSignals / buildDebtPayload)
// SECTION-19 : DERIVED MACRO SCORE ENGINE (PATCH E-7)
// SECTION-20 : EQUITY UI BUILDERS (KPI / Technical / Fundamental / Flows)
// SECTION-21 : SUPPORT RESISTANCE ENGINE
// SECTION-22 : MARKET SCORE ENGINE (computeMarketScore / computeFearGreed)
// SECTION-23 : BRAIN SIGNAL ENGINE (buildSignals / getRegime / intelligence)
// SECTION-24 : BRAIN NARRATIVE ENGINE (buildNarrative / buildAdvisory / interpretation)
// SECTION-25 : SCHEDULER + JOBS (runNSEIndexJob / refreshEquityMacroCaches / setIntervals)
// SECTION-26 : API ROUTES (/api/v1/* / /brain-auto / /health)
// SECTION-27 : PM2 + STARTUP (error handler / process guards / app.listen)
//
////////////////////////////////////////////////////////

////////////////////////////////////////////////////////
// SECTION-01 : ENV + CONFIG
// Future: process.env.* variables go here
////////////////////////////////////////////////////////

////////////////////////////////////////////////////////
// SECTION-04 : ENUMS
// FSD v6 Section 8.2 — ALL signal/sentiment/status values
// centralised here. Engines and builders MUST reference
// these constants. Never use raw string literals.
// Phase A — Task A3
////////////////////////////////////////////////////////

const SIGNAL_ENUM = Object.freeze({
  BUY:         "BUY",
  SELL:        "SELL",
  WATCH:       "WATCH",
  OVERWEIGHT:  "OVERWEIGHT",
  UNDERWEIGHT: "UNDERWEIGHT",
  STRONG:      "STRONG",
  WEAK:        "WEAK"
});

const SENTIMENT_ENUM = Object.freeze({
  BULLISH: "bullish",
  BEARISH: "bearish",
  NEUTRAL: "neutral"
});

const DATA_STATUS_ENUM = Object.freeze({
  LIVE:        "live",
  STALE:       "stale",
  UNAVAILABLE: "unavailable"
});

const ERROR_ENUM = Object.freeze({
  FETCH_FAILED:        "FETCH_FAILED",
  PARSE_ERROR:         "PARSE_ERROR",
  CACHE_MISS:          "CACHE_MISS",
  SIGNAL_ERROR:        "SIGNAL_ERROR",
  RATE_LIMITED:        "RATE_LIMITED",
  VALIDATION_FAILED:   "VALIDATION_FAILED",
  LLM_UNAVAILABLE:     "LLM_UNAVAILABLE",
  UNHANDLED_EXCEPTION: "UNHANDLED_EXCEPTION"
});

////////////////////////////////////////////////////////
// SECTION-02 : IMPORTS + APP INIT
////////////////////////////////////////////////////////

		const express = require("express");
		const sqlite3 = require("sqlite3").verbose();
		const { AbortController } = require("node-abort-controller");
////////////////////////////////////////////////////////
// SECTION-07 : LOGGING (pino structured logger)
////////////////////////////////////////////////////////
		const pino = require("pino");
		const logger = pino({
		  level: "info",
		  transport: {
			target: "pino-pretty"
		  }
		});
		const db = new sqlite3.Database("./dss.db", (err) => {
		  if (err) {
			logger.error({ err }, "DB connection error");
		  } else {
			logger.info("Connected to SQLite DB");
		  }
		});
		db.serialize(() => {
		  db.run(`
			CREATE TABLE IF NOT EXISTS signals (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  name TEXT,
			  value TEXT,
			  score INTEGER,
			  weight REAL,
			  timestamp INTEGER
			)
		  `);

		  db.run(`
			CREATE TABLE IF NOT EXISTS decisions (
			  id INTEGER PRIMARY KEY AUTOINCREMENT,
			  regime TEXT,
			  score INTEGER,
			  confidence INTEGER,
			  timestamp INTEGER
			)
		  `);
		db.run('CREATE INDEX IF NOT EXISTS idx_signals_time ON signals(timestamp)');
		db.run('CREATE INDEX IF NOT EXISTS idx_decisions_time ON decisions(timestamp)');
		});
		const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
		// ===============================
		// DSS v6 — CACHE LAYER
		// ===============================
////////////////////////////////////////////////////////

let YAHOO_PAUSED = false; // C3-STABILITY: true=paused, false=live
let yahoo429Count = 0;           // C3-STABILITY: consecutive 429 counter
let yahooResumeTimer = null;     // C3-STABILITY: auto-resume timer handle

////////////////////////////////////////////////////////
// SECTION-05 : CACHE LAYER (DSSCache)
// In-memory key/value store with TTL metadata.
// All engines read/write via DSSCache.get() / DSSCache.set()
////////////////////////////////////////////////////////
		const DSSCache = {
		  store: {},
		  meta: {},

		  set(key, data) {
			this.store[key] = data;
			this.meta[key] = { ts: Date.now() };
		  },

		  get(key) {
			return this.store[key];
		  },

		  isFresh(key, ttl) {
			return this.meta[key] && Date.now() - this.meta[key].ts < ttl;
		  }
		};
		const fs = require("fs");
		const technicalRoutes = require("./routes/technicalRoutes");
		// ==============================
		// STABILITY LAYER — SAFE EXECUTION
		// ==============================

////////////////////////////////////////////////////////
// SECTION-08 : SAFE EXECUTION
// safeExecute (sync) + safeExecuteAsync (async)
// All route handlers and engine calls must use these wrappers.
////////////////////////////////////////////////////////
		function safeExecute(fn, fallback = null) {
		  try {
			return fn();
		  } catch (err) {
			logger.error({ err }, "SafeExecute failure");
			return fallback;
		  }
		}

		async function safeExecuteAsync(fn, fallback = null) {
		  try {
			return await fn();
		  } catch (err) {
			logger.error({ err }, "SafeExecuteAsync failure");
			return fallback;
		  }
		}

		// --------------------------------------------------------
		// SECTION-08 : validateSignalObject (Phase C - C1)
		// Validates signal objects before cache/API emission.
		// Non-blocking: logs warning but returns signal intact
		// to avoid suppressing live data during DEF-009 phase.
		// --------------------------------------------------------
		function validateSignalObject(signal, context = "unknown") {
		  if (!signal || typeof signal !== "object") {
			logger.warn({ context, code: ERROR_ENUM.VALIDATION_FAILED }, "validateSignalObject: null or non-object");
			return signal;
		  }
		  const validSignals = Object.values(SIGNAL_ENUM);
		  const validSentiments = Object.values(SENTIMENT_ENUM);
		  if (signal.signal !== undefined && !validSignals.includes(signal.signal)) {
			logger.warn({ context, invalidSignal: signal.signal, code: ERROR_ENUM.VALIDATION_FAILED }, "validateSignalObject: signal not in SIGNAL_ENUM");
		  }
		  if (signal.sentiment !== undefined && !validSentiments.includes(signal.sentiment)) {
			logger.warn({ context, invalidSentiment: signal.sentiment, code: ERROR_ENUM.VALIDATION_FAILED }, "validateSignalObject: sentiment not in SENTIMENT_ENUM");
		  }
		  if (signal.confidence !== undefined && (typeof signal.confidence !== "number" || signal.confidence < 0 || signal.confidence > 1)) {
			logger.warn({ context, confidence: signal.confidence, code: ERROR_ENUM.VALIDATION_FAILED }, "validateSignalObject: confidence out of range [0,1]");
		  }
		  return signal;
		}

		// --------------------------------------------------------
		// SECTION-08 : computeConfidence (Phase C - C3)
		// Appendix H formula: freshness * 0.35 + strength * 0.40 + agreement * 0.25
		// --------------------------------------------------------
		function computeFreshnessScore(dataTs, ttlMs) {
		  if (!dataTs) return 0.0;
		  const age = Date.now() - dataTs;
		  if (age <= ttlMs) return 1.00;
		  if (age <= ttlMs * 1.5) return 0.75;
		  if (age <= ttlMs * 2.0) return 0.50;
		  if (age <= ttlMs * 3.0) return 0.25;
		  return 0.00;
		}

		function computeStrengthScore(value, signal, thresholds) {
		  if (value === null || value === undefined) return 0.30;
		  const { buyThreshold, sellThreshold, min, max } = thresholds;
		  if (signal === SIGNAL_ENUM.BUY && buyThreshold !== undefined) {
			return Math.min(1.0, Math.abs(value - buyThreshold) / Math.abs(buyThreshold - min || 1));
		  }
		  if (signal === SIGNAL_ENUM.SELL && sellThreshold !== undefined) {
			return Math.min(1.0, Math.abs(value - sellThreshold) / Math.abs(max - sellThreshold || 1));
		  }
		  return 0.40;
		}

		function computeAgreementScore(thisSentiment, otherSentiments) {
		  if (!otherSentiments || otherSentiments.length === 0) return 0.50;
		  const agreeing = otherSentiments.filter(s => s === thisSentiment).length;
		  return agreeing / otherSentiments.length;
		}

		function computeConfidence(freshnessScore, strengthScore, agreementScore) {
		  const raw = (freshnessScore * 0.35) + (strengthScore * 0.40) + (agreementScore * 0.25);
		  return Math.min(1.0, Math.max(0.0, parseFloat(raw.toFixed(3))));
		}

		const app = express();

		const rateLimit = require("express-rate-limit");

		const limiter = rateLimit({
		  windowMs: 60 * 1000,
		  max: 30,
		  standardHeaders: true,
		  legacyHeaders: false
		});

		app.use("/brain-auto", limiter);

		app.use(express.json());
		app.use("/api/technical", technicalRoutes);


		// ===============================
		// DSS v6 — EQUITY API (VERSIONED)
		// ===============================
////////////////////////////////////////////////////////
// SECTION-03 : GLOBAL CONSTANTS + TTLs
// All TTL values, symbol maps, and threshold constants.
// Never hardcode these values inside engine functions.
////////////////////////////////////////////////////////

		const CACHE_TTL_EQUITY = 30000;
		app.get("/api/v1/equity", async (req, res) =>
		  safeExecuteAsync(async () => {

			let cached = DSSCache.get("nse:index");

			if (!cached) {

		  // 🔻 TRY FORCE FETCH (ONE-TIME RECOVERY)
		  await safeExecuteAsync(runNSEIndexJob, null);

		  const retryCache = DSSCache.get("nse:index");

		  if (!retryCache) {
			return res.status(503).json({
			  status: "ERROR",
			  timestamp: Date.now(),
			  dataStatus: "unavailable",
			  error: {
				code: "CACHE_MISS",
				message: "No market data available"
			  }
			});
		  }

		  cached = retryCache;
		}

			const meta = DSSCache.meta["nse:index"];
			const technicalSignals = buildEquitySignals(cached);
			const equityKpis =
		  buildEquityKPIBlock(cached);

		const technicalTable =
		  buildTechnicalSignalTable(cached);

		const supportResistance =
		  buildSupportResistance(cached);

		const globalSignals =
		  buildGlobalSignals(cached);

		const oiSignals =
		  buildOISignals(cached);
		  
		  const fundamentalSignals =
		  buildFundamentalSignals(cached);

		const macroNumbers =
		  buildMacroNumbers(cached);

		const fundFlows =
		  buildFundFlows(cached);	
			

		let dataStatus = "live";

		if (!meta) {
		  dataStatus = "unavailable";
		} else {
		  const age = Date.now() - meta.ts;

		  if (age > CACHE_TTL_EQUITY * 4) {
			dataStatus = "unavailable";
		  } else if (age > CACHE_TTL_EQUITY) {
			dataStatus = "stale";
		  }
		}

			// 🔴 FIRST: handle unavailable BEFORE building response
		if (dataStatus === "unavailable") {
		  return res.status(503).json({
			status: "ERROR",
			timestamp: Date.now(),
			dataStatus: "unavailable",
			error: {
			  code: "STALE_DATA",
			  message: "Market data unavailable"
			}
		  });
		}

		// ✅ THEN build response
		const response = {
		  status: "OK",
		  timestamp: Date.now(),
		  dataStatus,

		  data: {

		  signals: equityKpis,

		  kpis: equityKpis.kpiCards,

		  technicalSignals: technicalTable,

		  fundamentalSignals,

		  supportResistance,

		  globalData: globalSignals,

		  oiSignals,

		  macroNumbers,

		  fundFlows,

		  technical: technicalSignals,
		  
		  cacheTs: meta?.ts || null,
		}
		};

		logger.info({
		  source: "equity-api",
		  dataStatus,
		  ts: Date.now()
		}, "Equity API response served");

		res.json(response);

		  }, null)
		);

		app.use((req, res, next) => {
		  logger.info({
			method: req.method,
			url: req.url,    
		  }, "Incoming request");
		  next();
		});
		// const { getLiveSignals } = require("../data-engine/liveDataEngine");

		const VERSION = "MVP-9-D26-BASELINE";
		const DEFAULT_SIGNALS = {
		  rates: "neutral",
		  crude: "falling",
		  fii: "buying",
		  liquidity: "supportive",
		  vix: "low",
		  trend: "neutral",

		  // ✅ NEW (D25)
		  momentum: "neutral",
		  strength: "neutral",
		  breadth: 0.5
		};
		const RELEASE_TAG = "BASELINE-D26";

////////////////////////////////////////////////////////
// SECTION-06 : MEMORY LAYER
// Persistent JSON-backed memory engine (V7/V8).
// Regime history, signal snapshots, alerts, decisions.
////////////////////////////////////////////////////////

		/* ==============================
		   V7 — MEMORY ENGINE (PERSISTENT)
		============================== */

		const path = require("path");
		const MEMORY_FILE = path.join(__dirname, "memory.json");

		function loadMemory() {
		  try {
			const data = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));

			return {
			  decisions: data.decisions || [],
			  regimeHistory: data.regimeHistory || [],      
			};
		  } catch {
		  return {
			decisions: [],
			regimeHistory: []
		  };
		}
		}

		function saveMemory(mem) {
		  const tempFile = MEMORY_FILE + ".tmp";

		  // Write to temp file first
		  fs.writeFileSync(tempFile, JSON.stringify(mem, null, 2), "utf-8");

		  // Copy temp → actual file (safer across devices/filesystems)
		  fs.copyFileSync(tempFile, MEMORY_FILE);

		  // Remove temp file
		  fs.unlinkSync(tempFile);
		}
		let MEMORY = loadMemory();
		if (!Array.isArray(MEMORY.decisions)) MEMORY.decisions = [];
		if (!Array.isArray(MEMORY.regimeHistory)) MEMORY.regimeHistory = [];

		// ===== V8 MEMORY INIT =====
		if (!Array.isArray(MEMORY.signalsHistory)) MEMORY.signalsHistory = [];
		if (!Array.isArray(MEMORY.alerts)) MEMORY.alerts = [];
		if (!MEMORY.lastSnapshot) MEMORY.lastSnapshot = null;
		if (MEMORY.cyclesSinceChange === undefined) MEMORY.cyclesSinceChange = 0;
		if (!MEMORY.lastRegimeChangeTs) MEMORY.lastRegimeChangeTs = null;

		/* =========================
		   EXISTING STATE (UNCHANGED)
		========================= */

		let lastCrudeSignal = "falling";
		let lastVixSignal = "low";
		// ===============================
		// CIRCUIT BREAKER + CACHE
		// ===============================

		let marketCache = {
		  crudePrice: null,
		  vixValue: null,
		  lastUpdated: null
		};

		let circuitBreaker = {
		  crude: { failures: 0, blockedUntil: 0 },
		  vix: { failures: 0, blockedUntil: 0 }
		};

		const FAILURE_THRESHOLD = 3;
		const COOLDOWN_MS = 60 * 1000; // 1 min
		let regimeHistory = MEMORY.regimeHistory || [];
		let fallbackState = {
		  crude: false,
		  vix: false
		};
		/* =========================
		   NEW STATE (ADDITIVE ONLY)
		========================= */

		let portfolioState = {
		  activePositions: [],
		  totalPnL: 0,
		  lastUpdate: null
		};

		// ==============================
		// D27 RISK ENGINE STATE
		// ==============================
		let riskState = {
		  peakPnL: 0,
		  currentDrawdown: 0,
		  killSwitch: false,
		  lastTrigger: null
		};

		let signalReliability = {
		  rates: 1,
		  liquidity: 1,
		  crude: 1,
		  fii: 1,
		  vix: 1,
		  trend: 1,

		  // ✅ NEW
		  momentum: 1,
		  strength: 1,
		  breadth: 1
		};
		const SIGNAL_REGISTRY = {
		  rates: { weight: 0.2, scorer: v => (v === "falling" ? 1 : v === "rising" ? -1 : 0), intensity: () => 1 },
		  liquidity: { weight: 0.2, scorer: v => (v === "supportive" ? 1 : v === "tightening" ? -1 : 0), intensity: () => 1.2 },
		  crude: { weight: 0.15, scorer: v => (v === "falling" ? 1 : v === "rising" ? -1 : 0), intensity: () => 1.1 },
		  fii: { weight: 0.2, scorer: v => (v === "buying" ? 1 : v === "selling" ? -1 : 0), intensity: () => 1.3 },
		  vix: { weight: 0.15, scorer: v => (v === "low" ? 1 : v === "high" ? -1 : 0), intensity: () => 1.2 },
		  trend: { weight: 0.1, scorer: v => (v === "bullish" ? 1 : v === "bearish" ? -1 : 0), intensity: () => 1.5 },

		  // ✅ NEW SIGNALS (D25)
		  momentum: {
		  weight: 0.1,
		  scorer: v => (v === "bullish" ? 1 : v === "bearish" ? -1 : 0),
		  intensity: () => 1.2
		},
		  strength: {
			weight: 0.1,
			scorer: v => (v === "strong" ? 1 : v === "weak" ? -1 : 0),
			intensity: () => 1.1
		  },
		  breadth: {
			weight: 0.1,
			scorer: v => (v > 0.55 ? 1 : v < 0.45 ? -1 : 0),
			intensity: () => 1.1
		  }
		};

////////////////////////////////////////////////////////
// SECTION-09 : FETCH UTILITIES
// fetchWithRetry — FSD Appendix D.2 (B1) + D.3 (B2) + B3
// safeFetch     — thin wrapper, backward-compatible
// safeFetchText — HTML/text fetch (below, unchanged)
//
// Retry schedule (FETCH_RETRY_COUNT = 3):
//   attempt 1 : immediate
//   attempt 2 : wait FETCH_BACKOFF_BASE_MS * 1 + jitter
//   attempt 3 : wait FETCH_BACKOFF_BASE_MS * 2 + jitter
//   jitter    = random(0, FETCH_BACKOFF_BASE_MS * 0.5)
// 429 : log RATE_LIMITED, wait RATE_LIMIT_COOLDOWN_MS, return null immediately
// UA  : rotated via getNextUA() on every attempt (D.3)
////////////////////////////////////////////////////////

		async function fetchWithRetry(url, timeout = FETCH_TIMEOUT_MS, retries = FETCH_RETRY_COUNT) {
		  for (let attempt = 0; attempt < retries; attempt++) {
			try {
			  const controller = new AbortController();
			  const id = setTimeout(() => controller.abort(), timeout);

			  const isYahoo = url.includes("yahoo.com");
			  if (isYahoo) await yahooThrottle();
			  const cookieHdr = isYahoo ? await getYahooCookie() : "";
			  const reqHeaders = {
				"User-Agent": getNextUA(),
				"Accept": "application/json,text/html,*/*;q=0.9",
				"Accept-Language": "en-US,en;q=0.9",
				"Accept-Encoding": "gzip, deflate, br",
				"Connection": "keep-alive",
				"Referer": "https://finance.yahoo.com"
			  };
			  if (cookieHdr) reqHeaders["Cookie"] = cookieHdr;
			  const res = await fetch(url, {
				signal: controller.signal,
				headers: reqHeaders
			  });
			  clearTimeout(id);

			  // B3 — Systematic 429 detection (FSD Appendix D.2)
			  if (res.status === 429) {
				yahoo429Count++;
				logger.warn(
				  { url, attempt: attempt + 1, code: ERROR_ENUM.RATE_LIMITED, consecutive429s: yahoo429Count },
				  "Rate limited (429) — returning null immediately, cache fallback applies"
				);
				if (yahoo429Count >= 6 && !YAHOO_PAUSED) {
				  YAHOO_PAUSED = true;
				  logger.warn({ pauseMs: 300000 }, "Yahoo circuit breaker OPEN — pausing all Yahoo fetches for 5min");
				  if (yahooResumeTimer) clearTimeout(yahooResumeTimer);
				  yahooResumeTimer = setTimeout(() => {
					YAHOO_PAUSED = false;
					yahoo429Count = 0;
					yahooResumeTimer = null;
					logger.info("Yahoo circuit breaker CLOSED — resuming fetches");
				  }, 300000);
				}
				return null;
			  }

			  if (!res.ok) throw new Error(`HTTP ${res.status}`);

			  // Successful fetch — reset 429 counter
			  yahoo429Count = 0;
			  return await res.json();

			} catch (err) {
			  const isLast = attempt === retries - 1;

			  logger.warn(
				{ url, attempt: attempt + 1, err: err.message },
				"fetchWithRetry attempt failed"
			  );

			  if (isLast) {
				logger.error(
				  { url, code: ERROR_ENUM.FETCH_FAILED },
				  "fetchWithRetry — all attempts exhausted"
				);
				return null;
			  }

			  // Exponential backoff + jitter per FSD Appendix D.2
			  const baseWait = FETCH_BACKOFF_BASE_MS * (attempt + 1);
			  const jitter   = Math.random() * FETCH_BACKOFF_BASE_MS * 0.5;
			  await new Promise(r => setTimeout(r, baseWait + jitter));
			}
		  }
		  return null;
		}

		// Yahoo session cookie jar (module-level, refreshed hourly)
		let yahooCookieJar = "";
		let yahooCookieTs = 0;
		const YAHOO_COOKIE_TTL = 60 * 60 * 1000; // 1 hour

		// Yahoo global request throttle — minimum 3s between requests
		let yahooLastRequestTs = 0;
		const YAHOO_MIN_GAP_MS = 3000;
		async function yahooThrottle() {
		  const now = Date.now();
		  const gap = now - yahooLastRequestTs;
		  if (gap < YAHOO_MIN_GAP_MS) {
			await new Promise(r => setTimeout(r, YAHOO_MIN_GAP_MS - gap));
		  }
		  yahooLastRequestTs = Date.now();
		}

		async function getYahooCookie() {
		  const age = Date.now() - yahooCookieTs;
		  if (yahooCookieJar && age < YAHOO_COOKIE_TTL) return yahooCookieJar;
		  try {
			const res = await fetch("https://finance.yahoo.com", {
			  headers: {
				"User-Agent": getNextUA(),
				"Accept": "text/html,application/xhtml+xml,*/*;q=0.9",
				"Accept-Language": "en-US,en;q=0.9"
			  },
			  signal: AbortSignal.timeout(5000)
			});
			const setCookie = res.headers.get("set-cookie");
			if (setCookie) {
			  // Extract key=value pairs, skip attributes
			  yahooCookieJar = setCookie.split(",")
				.map(c => c.split(";")[0].trim())
				.filter(c => c.includes("="))
				.join("; ");
			  yahooCookieTs = Date.now();
			  logger.info("Yahoo session cookie refreshed");
			}
		  } catch(e) {
			logger.warn({ err: e.message }, "Yahoo cookie fetch failed");
		  }
		  return yahooCookieJar;
		}

		// Backward-compatible wrapper — all existing call sites unaffected
		async function safeFetch(url, timeout = FETCH_TIMEOUT_MS, retries = FETCH_RETRY_COUNT) {
		  return fetchWithRetry(url, timeout, retries);
		}
////////////////////////////////////////////////////////
// SECTION-10 : CIRCUIT BREAKER + FETCH ENGINES
// fetchCrude / fetchVix — with circuit breaker pattern.
// Trips after FAILURE_THRESHOLD failures, cools down 60s.
////////////////////////////////////////////////////////

		async function fetchCrude() {
		  const now = Date.now();

		  if (circuitBreaker.crude.blockedUntil > now) {
			logger.warn("Crude API blocked — using cache");
		fallbackState.crude = true;
		return marketCache.crudePrice || null;   // crude default
		  }

		  if (YAHOO_PAUSED) { fallbackState.crude = true; return marketCache.crudePrice || null; }
		  try {
			const url = "https://query1.finance.yahoo.com/v8/finance/chart/CL=F";
			const data = await safeFetch(url);

			const result = data?.chart?.result?.[0];
			const price = result?.meta?.regularMarketPrice;

			if (!price) throw new Error("Invalid crude price");

			circuitBreaker.crude.failures = 0;
			marketCache.crudePrice = price;
			marketCache.lastUpdated = now;
			fallbackState.crude = false;

			return price;

		  } catch (err) {
			circuitBreaker.crude.failures++;

			logger.warn({
			  failures: circuitBreaker.crude.failures,
			  err: err.message
			}, "Crude fetch failed");

			if (circuitBreaker.crude.failures >= FAILURE_THRESHOLD) {
			  circuitBreaker.crude.blockedUntil = now + COOLDOWN_MS;
			  logger.error("Crude circuit breaker ACTIVATED");
			}
		fallbackState.crude = true;
		return marketCache.crudePrice || null;   // crude default
		  }
		}

		async function fetchVix() {
		  const now = Date.now();

		  if (circuitBreaker.vix.blockedUntil > now) {
			logger.warn("VIX API blocked — using cache");
			fallbackState.vix = true;
			return marketCache.vixValue || null;     // vix default
		  }

		  if (YAHOO_PAUSED) { fallbackState.vix = true; return marketCache.vixValue || null; }
		  try {
			const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX";
			const data = await safeFetch(url);

			const result = data?.chart?.result?.[0];
			const price = result?.meta?.regularMarketPrice;

			if (!price) throw new Error("Invalid VIX value");

			circuitBreaker.vix.failures = 0;
			marketCache.vixValue = price;
			marketCache.lastUpdated = now;
			fallbackState.vix = false;

			return price;

		  } catch (err) {
			circuitBreaker.vix.failures++;

			logger.warn({
			  failures: circuitBreaker.vix.failures,
			  err: err.message
			}, "VIX fetch failed");

			if (circuitBreaker.vix.failures >= FAILURE_THRESHOLD) {
			  circuitBreaker.vix.blockedUntil = now + COOLDOWN_MS;
			  logger.error("VIX circuit breaker ACTIVATED");
			}
			fallbackState.vix = true;
			return marketCache.vixValue || null;     // vix default
		  }
		}
		// ===============================
		// EMA HELPER (D25)
		// ===============================
////////////////////////////////////////////////////////
// SECTION-16 : TECHNICAL ENGINE
// EMA / computeRSI14 / computeSMA
// buildEquitySignals — FSD v6 Appendix B.1 / B.2 compliant
////////////////////////////////////////////////////////

		function EMA(prices, period) {
		  if (!prices || prices.length === 0) return null;

		  const k = 2 / (period + 1);
		  let ema = prices[0];

		  for (let i = 1; i < prices.length; i++) {
			ema = prices[i] * k + ema * (1 - k);
		  }

		  return ema;
		}function computeRSI14(prices) {

	  if (!prices || prices.length < 15) {
		return null;
	  }

	  let gains = 0;
	  let losses = 0;

	  for (
		let i = prices.length - 14;
		i < prices.length;
		i++
	  ) {

		const diff =
		  prices[i] - prices[i - 1];

		if (diff > 0) {
		  gains += diff;
		} else {
		  losses += Math.abs(diff);
		}
	  }

	  const avgGain = gains / 14;
	  const avgLoss = losses / 14;

	  if (avgLoss === 0) {
		return 100;
	  }

	  if (avgGain === 0) {
		return 0;
	  }

	  const rs =
		avgGain / avgLoss;

	  return Number(
		(
		  100 -
		  (100 / (1 + rs))
		).toFixed(2)
	  );
	}

		function computeSMA(prices, period) {
		  if (!prices || prices.length < period) return null;
		  const slice = prices.slice(-period);
		  return slice.reduce((a, b) => a + b, 0) / period;
		}

		// ===============================
		// DSS v6 — SECTOR ROTATION ENGINE
		// ===============================

		const CACHE_TTL_SECTOR = 120000;
		
		// ===============================
	// DSS v6 — DEBT ENGINE CACHE
	// ===============================

	const CACHE_TTL_DEBT = 60000;

	const DEBT_SYMBOLS = {
	  US10Y: "%5ETNX",
	  US2Y: "%5EIRX",
	  DXY: "DX-Y.NYB",
	  GOLD: "GC=F"
	};

////////////////////////////////////////////////////////
// SECTION-03 (continued) : FETCH LAYER CONSTANTS
// Phase B — B1/B2/B3
// FSD Appendix D.2 (retry/backoff) + D.3 (UA rotation)
////////////////////////////////////////////////////////

	const FETCH_TIMEOUT_MS       = 3000;
	const FETCH_RETRY_COUNT      = 3;
	const FETCH_BACKOFF_BASE_MS  = 500;
	const RATE_LIMIT_COOLDOWN_MS = 60000;

	// B2 — User-Agent rotation pool (FSD Appendix D.3)
	const UA_POOL = [
	  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
	  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
	  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
	  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	];
	let uaIndex = 0;
	function getNextUA() {
	  return UA_POOL[uaIndex++ % UA_POOL.length];
	}

		const SECTOR_SYMBOLS = {
		  FMCG: "%5ECNXFMCG",
		  IT: "%5ECNXIT",
		  PHARMA: "%5ECNXPHARMA",
		  AUTO: "%5ECNXAUTO",
		  REALTY: "%5ECNXREALTY",
		  METALS: "%5ECNXMETAL",
		  PSU_BANK: "%5ECNXPSUBANK",
		  PRIVATE_BANK: "%5ENSEBANK"
		};

		const SECTOR_THEMES = {
		  FMCG: "Defensive",
		  IT: "Forex tailwind",
		  PHARMA: "US generics demand",
		  AUTO: "Consumption sensitivity",
		  REALTY: "Rate sensitivity",
		  METALS: "China demand weak",
		  PSU_BANK: "Credit growth",
		  PRIVATE_BANK: "NIM pressure"
		};

////////////////////////////////////////////////////////
// SECTION-17 : SECTOR ENGINE
// fetchSectorData / classifySectorPhase / buildSectorSignal
// buildSectorFlow / buildThemeSignal / buildSectorPayload
// refreshSectorCache / SECTOR_SYMBOLS / SECTOR_THEMES
////////////////////////////////////////////////////////

		const NSE_SECTOR_MAP = {
		  "NIFTY FMCG":         "FMCG",
		  "NIFTY IT":           "IT",
		  "NIFTY PHARMA":       "PHARMA",
		  "NIFTY AUTO":         "AUTO",
		  "NIFTY REALTY":       "REALTY",
		  "NIFTY METAL":        "METALS",
		  "NIFTY PSU BANK":     "PSU_BANK",
		  "NIFTY PRIVATE BANK": "PRIVATE_BANK"
		};

		async function fetchNSESectorData() {
		  try {
			const res = await fetch("https://www.nseindia.com/api/allIndices", {
			  headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				"Accept": "application/json, text/plain, */*",
				"Accept-Language": "en-US,en;q=0.9",
				"Referer": "https://www.nseindia.com/market-data/live-equity-market",
				"X-Requested-With": "XMLHttpRequest"
			  }
			});
			if (!res || !res.ok) throw new Error("NSE allIndices sector fetch: " + (res ? res.status : "null"));
			const json = await res.json();
			const rows = json && json.data ? json.data : [];
			const sectorMap = {};
			for (const row of rows) {
			  const key = NSE_SECTOR_MAP[row.index];
			  if (!key) continue;
			  const returnPct = Number(Number(row.percentChange).toFixed(2));
			  const momentum = returnPct >= 0 ? "improving" : "deteriorating";
			  sectorMap[key] = { current: Number(row.last), returnPct, momentum };
			}
			const found = Object.keys(sectorMap).length;
			logger.info({ found }, "fetchNSESectorData: sectors fetched from allIndices");
			return found >= 4 ? sectorMap : null;
		  } catch (err) {
			logger.error({ err: err.message }, "fetchNSESectorData failed");
			return null;
		  }
		}
		
		// =====================================
	// LIVE DEBT + RATES DATA ENGINE
	// =====================================

	// =====================================
	// EQUITY LIVE MACRO + FLOW ENGINE
	// =====================================

	const CACHE_TTL_MACRO = 60 * 60 * 1000;
	const CACHE_TTL_FUNDAMENTAL =  6 * 60 * 60 * 1000;
	const CACHE_TTL_FLOW = 15 * 60 * 1000;
	const CACHE_TTL_AMFI = 24 * 60 * 60 * 1000;

	async function safeFetchText(url, timeout = 4000) {

	  try {

		const controller = new AbortController();

		const id =
		  setTimeout(() => controller.abort(), timeout);

		const res =
		  await fetch(url, {
			signal: controller.signal,
			headers: {
			  "User-Agent": "Mozilla/5.0"
			}
		  });

		clearTimeout(id);

		if (!res.ok) {
		  throw new Error(`HTTP ${res.status}`);
		}

		return await res.text();

	  } catch (err) {

		logger.error({
		  err: err.message,
		  url
		}, "safeFetchText failed");

		return null;
	  }
	}
	
	////////////////////////////////////////////////////////
// SECTION-11 : MACRO PARSERS
// fetchTradingEconomicsIndicator / fetchGSTCollections
// fetchManufacturingPMI / fetchAMFISIPData
// safeFetchText also lives here (SECTION-09 extension)
////////////////////////////////////////////////////////

// =====================================
// TRADINGECONOMICS PARSER ENGINE
// =====================================

async function fetchTradingEconomicsIndicator(
  url,
  min,
  max,
  label
) {

  try {

    const html =
      await safeFetchText(url, 10000);

    if (!html) {
      return null;
    }

    const patterns = [

  /"actual"\s*:\s*"?([\d.]+)"?/i,

  /"value":\s*"?([\d.]+)"?/,

  new RegExp(
    `${label}.*?([\\d.]+)`,
    "i"
  )
];

    for (const pattern of patterns) {

      const match =
        html.match(pattern);

      if (match) {

        const val =
          parseFloat(match[1]);

        if (
          !isNaN(val) &&
          val >= min &&
          val <= max
        ) {

          return Number(
            val.toFixed(2)
          );
        }
      }
    }

    return null;

  } catch (err) {

    logger.error({
      err: err.message,
      url
    }, "TE macro fetch failed");

    return null;
  }
}

// =====================================
// GST COLLECTION PARSER
// =====================================

async function fetchGSTCollections() {

  try {

    const html =
      await safeFetchText(
        "https://www.gst.gov.in/",
        10000
      );

    if (!html) {
      return null;
    }

    const patterns = [

      /₹\s*([\d.]+)\s*lakh\s*crore/i,

      /gross gst revenue.*?([\d.]+)\s*lakh\s*crore/i,

      /([\d.]+)\s*lakh\s*crore/i
    ];

    for (const pattern of patterns) {

      const match =
        html.match(pattern);

      if (match) {

        const gstLakhCr =
          parseFloat(match[1]);

        // PATCH E-6 HARDENING
        if (
          gstLakhCr < 1 ||
          gstLakhCr > 3
        ) {

          logger.warn(
            "GST parse confidence failed"
          );

          return null;
        }

        return Number(
          gstLakhCr.toFixed(2)
        );
      }
    }

    return null;

  } catch (err) {

    logger.error({
      err: err.message
    }, "GST parser failed");

    return null;
  }
}

// =====================================
// PMI PARSER
// =====================================

async function fetchManufacturingPMI() {

  try {

    const html =
      await safeFetchText(
        "https://tradingeconomics.com/india/manufacturing-pmi",
        10000
      );

    if (!html) {
      return null;
    }

    const patterns = [

      /"actual"\s*:\s*"?([\d.]+)"?/i,

      /"value":\s*"?([\d.]+)"?/,

      /PMI.*?([\d.]+)/i
    ];

    for (const pattern of patterns) {

      const match =
        html.match(pattern);

      if (match) {

        const pmi =
          parseFloat(match[1]);

        // PATCH E-6 HARDENING
        if (
          pmi < 30 ||
          pmi > 80
        ) {

          logger.warn(
            "PMI parse confidence failed"
          );

          return null;
        }

        return Number(
          pmi.toFixed(1)
        );
      }
    }

    return null;

  } catch (err) {

    logger.error({
      err: err.message
    }, "PMI parser failed");

    return null;
  }
}

// =====================================
// AMFI SIP FLOW ENGINE
// =====================================

async function fetchAMFISIPData() {

  try {

    const html =
  await safeFetchText(
    "https://www.amfiindia.com/research-information/other-data/mf-industry-data",
    30000
  );

if (!html) {

  logger.warn(
    "AMFI HTML unavailable — preserving existing SIP cache"
  );

  return (
    DSSCache.get("equity:amfi") || null
  );
}

    const patterns = [

      /SIP.*?₹?\s*([\d,]+)\s*Crore/i,

      /SIP Contribution.*?([\d,]+)/i,

      /Systematic Investment Plan.*?([\d,]+)/i
    ];

    let sipAmountCr = null;

    for (const pattern of patterns) {

      const match =
        html.match(pattern);

      if (match) {

        sipAmountCr =
          Number(
            match[1]
              .replace(/,/g, "")
          );

        break;
      }
    }

    // PATCH E-4R HARDENING
    if (
      sipAmountCr < 5000 ||
      sipAmountCr > 50000
    ) {

      logger.warn(
        { sipAmountCr },
        "AMFI confidence validation failed"
      );

      return (
        DSSCache.get("equity:amfi") || null
      );
    }

    const payload = {

      sipMonthlyFlowCr:
        sipAmountCr,

      timestamp:
        Date.now(),

      source:
        "amfi-engine"
    };
	
	logger.info(
  {
    sipAmountCr
  },
  "AMFI SIP parsed successfully"
);

    DSSCache.set(
  "equity:amfi",
  payload
);

logger.info(
  {
    sipAmountCr
  },
  "AMFI SIP cache updated"
);;

    return payload;

  } catch (err) {

    logger.error({
      err: err.message
    }, "AMFI SIP parser failed");

    return (
      DSSCache.get("equity:amfi") || null
    );
  }
}


////////////////////////////////////////////////////////
// SECTION-12 : MACRO ENGINE
// fetchMacroEconomics — orchestrates CPI/GDP/GST/PMI/AMFI
// Writes to DSSCache("equity:macro")
// TTL: CACHE_TTL_MACRO (1hr)
////////////////////////////////////////////////////////

	// =====================================
	// RBI + MOSPI MACRO ENGINE
	// =====================================

	async function fetchMacroEconomics() {

	  try {

		const crude =
		  await fetchCrude();
		
		const [
  cpiLive,
  gdpLive,
  gstLive,
  pmiLive,
  amfiLive
] = await Promise.all([
  fetchTradingEconomicsIndicator(
    "https://tradingeconomics.com/india/inflation-cpi",
    0,
    20,
    "Inflation Rate"
  ),

  fetchTradingEconomicsIndicator(
    "https://tradingeconomics.com/india/gdp-growth-annual",
    -20,
    20,
    "GDP Growth Rate"
  ),

  fetchGSTCollections(),

  fetchManufacturingPMI(),

  fetchAMFISIPData()
]);

 

		// TEMP:
		// RBI/MOSPI live endpoints are inconsistent.
		// We maintain live-ready architecture now.

        const flows =
  DSSCache.get("equity:flows") || {};

const inflationScore =
  deriveInflationScore(
    cpiLive ??
    DSSCache.get("equity:macro")?.cpi ??
    4.8
  );

const growthScore =
  deriveGrowthScore(
    gdpLive ??
    DSSCache.get("equity:macro")?.gdpGrowth ??
    6.8
  );

const liquidityScore =
  deriveLiquidityScore({

    fiiEquity:
      flows?.fiiEquity ?? null,

    diiEquity:
      flows?.diiEquity ?? null,

    sipMonthlyFlowCr:
      amfiLive?.sipMonthlyFlowCr ??
      DSSCache.get("equity:amfi")
        ?.sipMonthlyFlowCr ??
      null
  });

const macroCompositeScore =
  deriveMacroCompositeScore({
    inflationScore,
    growthScore,
    liquidityScore
  });

		const macro = {

		  repoRate: 6.5,

		  cpi:
  cpiLive ??
  DSSCache.get("equity:macro")?.cpi ??
  4.8,

gdpGrowth:
  gdpLive ??
  DSSCache.get("equity:macro")?.gdpGrowth ??
  6.8,

		  crudeOil:
			crude
			  ? Number(crude.toFixed(2))
			  : null,

		  fiscalDeficit: 5.1,

		  gstCollections:

  gstLive ??

  DSSCache.get("equity:macro")
    ?.gstCollections ??

  1.87,

manufacturingPMI:

  pmiLive ??

  DSSCache.get("equity:macro")
    ?.manufacturingPMI ??

  58.8,

		  timestamp: Date.now(),
		  
		  inflationScore,

growthScore,

liquidityScore,

macroCompositeScore,

		  source: "macro-engine",

dataQuality: {

  cpi:
    cpiLive != null
      ? "live"
      : "fallback",

  gdp:
    gdpLive != null
      ? "live"
      : "fallback",

gst:
  gstLive != null
    ? "live"
    : "fallback",

pmi:
  pmiLive != null
    ? "live"
    : "fallback"
  
},

lastLiveUpdate: {

  cpi:
    cpiLive != null
      ? Date.now()
      : null,

  gdp:
    gdpLive != null
      ? Date.now()
      : null,

gst:
  gstLive != null
    ? Date.now()
    : null,

pmi:
  pmiLive != null
    ? Date.now()
    : null
}

		};
   
   

		DSSCache.set(
		  "equity:macro",
		  macro
		);

		return macro;

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "fetchMacroEconomics failed");

		return DSSCache.get("equity:macro") || null;
	  }
	}

////////////////////////////////////////////////////////
// SECTION-13 : NSE FLOW ENGINE
// fetchNSEFlows — FII/DII cash, PCR, FII futures positioning
// NSE session hardening (2-step cookie warmup)
// Writes to DSSCache("equity:flows")
// TTL: CACHE_TTL_FLOW (15min)
////////////////////////////////////////////////////////

	// =====================================
	// NSE FLOW ENGINE
	// =====================================

	async function fetchNSEFlows() {

	  try {

		const headers = {
		  "User-Agent": "Mozilla/5.0",
		  "Accept": "application/json,text/plain,*/*",
		  "Referer": "https://www.nseindia.com/"
		};

		// =====================================
	// NSE SESSION HARDENING
	// =====================================

	await safeExecuteAsync(

	  async () => {

		// ---------------------------------
		// STEP 1 — Homepage Warmup
		// ---------------------------------

		const warmup1 = await fetch(
		  "https://www.nseindia.com",
		  {
			headers: {

			  "User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
				"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

			  "Accept":
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

			  "Accept-Language":
				"en-US,en;q=0.9"
			}
		  }
		);

		// DEF-001 fix: getSetCookie() captures ALL Set-Cookie headers (not just first)
		const cookies = (warmup1.headers.getSetCookie() || [])
		  .map(c => c.split(";")[0].trim())
		  .filter(Boolean)
		  .join("; ");

		// ---------------------------------
		// STEP 2 — Activate NSE App Cookies
		// ---------------------------------

		// B4 — Mandatory 2500ms delay before second warmup request (FSD O2-A)
		await new Promise(
		  r => setTimeout(r, 2500)
		);

		const warmup2 = await fetch(
		  "https://www.nseindia.com/market-data/live-equity-market",
		  {
			headers: {

			  "User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
				"(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

			  "Accept":
				"text/html,application/xhtml+xml,*/*;q=0.8",

			  "Referer":
				"https://www.nseindia.com/",

			  "Cookie":
				cookies
			}
		  }
		);

		// DEF-001 fix: getSetCookie() captures ALL Set-Cookie headers
		const cookies2arr = (warmup2.headers.getSetCookie() || [])
		  .map(c => c.split(";")[0].trim())
		  .filter(Boolean);
		const allCookies = [
		  ...cookies.split("; "),
		  ...cookies2arr
		]
		  .filter(Boolean)
		  .join("; ");

		// ---------------------------------
		// APPLY FINAL SESSION HEADERS
		// ---------------------------------
headers["User-Agent"] =
		  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
		  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

		headers["Accept"] =
		  "application/json, text/plain, */*";

		headers["Referer"] =
		  "https://www.nseindia.com/";

		headers["Cookie"] =
		  allCookies;

		headers["X-Requested-With"] =
		  "XMLHttpRequest";

		logger.info(
		  {
			cookieLen: allCookies.length
		  },
		  "NSE session established"
		);

	  },

	  null
	);

	// =====================================
	// END NSE SESSION HARDENING
	// =====================================

		// -----------------------------
		// FII/DII CASH FLOWS
		// -----------------------------

		const fiiDiiJson =
	  await safeExecuteAsync(
		async () => {

		  const res =
			await fetch(
			  "https://www.nseindia.com/api/fiidiiTradeReact",
			  { headers }
			);

		  return await res.json();
		},
		null
	  );

		const rows =
	  Array.isArray(fiiDiiJson)
		? fiiDiiJson
		: fiiDiiJson?.data || [];

	const fiiRow =
	  rows.find(
		x =>
		  String(
			x?.category || ""
		  ).toUpperCase().includes("FII")
	  ) || null;

	const diiRow =
	  rows.find(
		x =>
		  String(
			x?.category || ""
		  ).toUpperCase().includes("DII")
	  ) || null;
	  
	  // -----------------------------
	// FII FUTURES POSITIONING
	// -----------------------------

	const participantJson =
  await safeExecuteAsync(
    async () => {

      const res =
        await fetch(
          "https://www.nseindia.com/api/participant-wise-oi-data",
          {
            headers,
            timeout: 15000
          }
        );

      const rawText =
        await res.text();

      logger.info(
        {
          status: res.status,
          sample: rawText.slice(0, 80)
        },
        "Participant OI raw response"
      );

      if (
        !rawText ||
        rawText.startsWith("<!DOCTYPE") ||
        rawText.startsWith("<html")
      ) {

        logger.warn(
          "Participant OI endpoint returned HTML/page instead of JSON"
        );

        return null;
      }

      try {

        return JSON.parse(rawText);

      } catch (err) {

        logger.warn(
          {
            err: err.message
          },
          "Participant OI JSON parse failed"
        );

        return null;
      }
    },
    null
  );

	let fiiFuturesPositioning = null;

	try {
		
	  if (
  !participantJson ||
  typeof participantJson !== "object"
) {
  logger.warn(
  "Participant positioning unavailable"
);

fiiFuturesPositioning = null;
}	

	  const participantRows =
		participantJson?.data || [];

	  const fiiClient =
		participantRows.find(
		  x =>
			String(
			  x?.clientType || ""
			).toUpperCase().includes("FII")
		);

	  if (fiiClient) {

		const longContracts =
		  Number(
			fiiClient?.futureIndexLong || 0
		  ) +
		  Number(
			fiiClient?.futureStockLong || 0
		  );

		const shortContracts =
		  Number(
			fiiClient?.futureIndexShort || 0
		  ) +
		  Number(
			fiiClient?.futureStockShort || 0
		  );

		fiiFuturesPositioning =
		  longContracts - shortContracts;
	  }

	} catch (err) {

	  logger.error({
		err: err.message
	  }, "FII futures positioning parse failed");
	}
	  
		// -----------------------------------------------------------------
	// PCR DATA — B4 FIX (FSD Master Build Plan O2-A)
	// Protocol:
	//   Step 1: GET homepage → cookies         (done in main warmup above)
	//   Step 2: Wait 2500ms                    (done in main warmup above)
	//   Step 3: GET market-data page → cookies  (done in main warmup above)
	//   Step 4: Wait 500ms                     (here)
	//   Step 5: GET option-chain-indices API using accumulated session headers
	//   Step 6: Validate records.data is array
	//   Step 7: Compute PCR from records.data (NOT filtered — filtered is NSE pre-subset)
	//   Step 8: Cache to DSSCache("nse:optionchain") TTL 60000ms
	// -----------------------------------------------------------------

	let optionJson = null;

	await safeExecuteAsync(

	  async () => {

		// Step 4 — mandatory 500ms before option chain API call
		await new Promise(r => setTimeout(r, 500));

		const optionUrl =
		  "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY";

		// Step 5 — use the accumulated main-session headers (cookies set above)
		const optionRes = await fetch(optionUrl, {
		  headers: {
			...headers,
			"Accept":           "application/json,text/plain,*/*",
			"Accept-Language":  "en-US,en;q=0.9",
			"Accept-Encoding":  "gzip, deflate, br",
			"Connection":       "keep-alive",
			"Sec-Fetch-Dest":   "empty",
			"Sec-Fetch-Mode":   "cors",
			"Sec-Fetch-Site":   "same-origin"
		  }
		});

		const rawText = await optionRes.text();

		logger.info(
		  { optionStatus: optionRes.status, textSample: rawText.slice(0, 120) },
		  "Option chain raw response"
		);

		if (!rawText || rawText.startsWith("<!DOCTYPE") || rawText.startsWith("<html")) {
		  logger.warn("Option chain returned HTML — session likely not established");
		  return;
		}

		const parsed = JSON.parse(rawText);

		// Step 6 — Structural analysis (logged every run for diagnostics)
		const hasRecordsData  = Array.isArray(parsed?.records?.data)  && parsed.records.data.length  > 0;
		const hasFilteredData = Array.isArray(parsed?.filtered?.data) && parsed.filtered.data.length > 0;

		logger.info({
		  hasRecordsData,
		  recordsLen:   parsed?.records?.data?.length  ?? "N/A",
		  hasFilteredData,
		  filteredLen:  parsed?.filtered?.data?.length ?? "N/A",
		  topKeys:      Object.keys(parsed || {}),
		  recordsKeys:  Object.keys(parsed?.records || {})
		}, "Option chain structure analysis");

		// Step 7 — Prefer records.data (all strikes, per FSD O2-A).
		// Fall back to filtered.data when records.data is empty/absent
		// (NSE returns records.data:[] after market hours — filtered retains last-session OI).
		if (!hasRecordsData && !hasFilteredData) {
		  logger.warn(
			{ topKeys: Object.keys(parsed || {}) },
			"Option chain: no usable data in records.data or filtered.data"
		  );
		  return;
		}

		optionJson = parsed;

		// Step 8 — cache raw option chain data
		DSSCache.set("nse:optionchain", { data: parsed, ts: Date.now() });

		const dataSource = hasRecordsData ? "records.data" : "filtered.data (fallback)";
		const dataLen    = hasRecordsData ? parsed.records.data.length : parsed.filtered.data.length;
		logger.info(
		  { strikes: dataLen, source: dataSource },
		  "Option chain fetched and cached successfully"
		);

	  },

	  null
	);

	// -----------------------------------------------------------------
	// LIVE PCR COMPUTATION
	// Primary  : records.data  (all strikes, per FSD O2-A Step 7)
	// Fallback : filtered.data (NSE ATM subset — used after market hours
	//            when NSE returns records.data:[] but filtered.data retains
	//            last-session OI). Fallback ensures PCR is never null
	//            simply because the market is closed.
	// -----------------------------------------------------------------

	let pcr = null;

	try {

	  // Prefer records.data; fall back to filtered.data
	  const hasRecords  = Array.isArray(optionJson?.records?.data)  && optionJson.records.data.length  > 0;
	  const hasFiltered = Array.isArray(optionJson?.filtered?.data) && optionJson.filtered.data.length > 0;

	  const optionRows = hasRecords
		? optionJson.records.data
		: hasFiltered
		? optionJson.filtered.data
		: [];

	  const pcrSource = hasRecords ? "records.data" : hasFiltered ? "filtered.data" : "none";
	  logger.info({ rows: optionRows.length, source: pcrSource }, "PCR option rows loaded");

	  let totalPEOI = 0;
	  let totalCEOI = 0;

	  for (const row of optionRows) {
		totalPEOI += Number(row?.PE?.openInterest || 0);
		totalCEOI += Number(row?.CE?.openInterest || 0);
	  }

	  if (totalPEOI > 0 && totalCEOI > 0) {
		pcr = Number((totalPEOI / totalCEOI).toFixed(2));
		logger.info({ pcr, totalPEOI, totalCEOI, source: pcrSource }, "PCR computed successfully");
	  } else {
		logger.warn({ totalPEOI, totalCEOI, source: pcrSource }, "PCR could not be computed — zero OI");
	  }

	} catch (err) {
	  logger.error({ err: err.message }, "PCR computation failed");
	}

		const fiiBuy = Number(
  fiiRow?.fii_buyValue ||
  fiiRow?.fiiBuyValue ||
  fiiRow?.buyValue ||
  0
);

const fiiSell = Number(
  fiiRow?.fii_sellValue ||
  fiiRow?.fiiSellValue ||
  fiiRow?.sellValue ||
  0
);

const diiBuy = Number(
  diiRow?.dii_buyValue ||
  diiRow?.diiBuyValue ||
  diiRow?.buyValue ||
  0
);

const diiSell = Number(
  diiRow?.dii_sellValue ||
  diiRow?.diiSellValue ||
  diiRow?.sellValue ||
  0
);

const fiiDebtBuy = Number(
  fiiRow?.fii_debt_buyValue ||
  fiiRow?.fiiDebtBuyValue ||
  0
);

const fiiDebtSell = Number(
  fiiRow?.fii_debt_sellValue ||
  fiiRow?.fiiDebtSellValue ||
  0
);

	const payload = {

	  fiiEquity:
		fiiBuy || fiiSell
		  ? Math.round(fiiBuy - fiiSell)
		  : null,

	  diiEquity:
		  diiBuy || diiSell
		  ? Math.round(diiBuy - diiSell)
		  : null,
	  
	  fiiDebt:
  fiiDebtBuy || fiiDebtSell
    ? Math.round(fiiDebtBuy - fiiDebtSell)
    : null,
		  
	  fiiFuturesPositioning,	  
		  

	  pcr,

	  timestamp: Date.now(),

	  source: "nse-flow-engine"
	};

		DSSCache.set(
		  "equity:flows",
		  payload
		);

		return payload;

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "fetchNSEFlows failed");

		return DSSCache.get("equity:flows") || null;
	  }
	}

////////////////////////////////////////////////////////
// SECTION-14 : FUNDAMENTAL ENGINE
// fetchFundamentalData — PE ratio, earnings growth,
// revenue/margin scores. Writes to DSSCache("equity:fundamental")
// TTL: CACHE_TTL_FUNDAMENTAL (6hr)
////////////////////////////////////////////////////////

	// =====================================
	// LIVE FUNDAMENTAL ENGINE
	// =====================================

	async function fetchFundamentalData() {

	  try {

		// ---------------------------------
		// NIFTY PE (FREE NSE SOURCE)
		// ---------------------------------

		const headers = {
		  "User-Agent": "Mozilla/5.0",
		  "Accept": "application/json,text/plain,*/*",
		  "Referer": "https://www.nseindia.com/"
		};

		await safeExecuteAsync(

	  async () => {

		const warmup =
		  await fetch(
			"https://www.nseindia.com",
			{
			  headers: {
				"User-Agent":
				  "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				"Accept":
				  "text/html,application/xhtml+xml"
			  }
			}
		  );

		const cookie =
		  warmup.headers.get("set-cookie") || "";

		headers["Cookie"] =
		  cookie
			.split(",")
			.map(c => c.split(";")[0])
			.join("; ");

	  },

	  null
	);

		const valuationJson =
		  await safeExecuteAsync(
			async () => {

			  const res =
				await fetch(
				  "https://www.nseindia.com/api/allIndices",
				  { headers }
				);

			  return await res.json();
			},
			null
		  );

		let niftyPe = null;

		const niftyRow =
		  valuationJson?.data?.find(
			x =>
			  x.index === "NIFTY 50"
		  );

		if (
		  niftyRow &&
		  niftyRow.pe
		) {

		  niftyPe =
			Number(
			  Number(niftyRow.pe)
				.toFixed(2)
			);
		}

		// ---------------------------------
		// EARNINGS GROWTH
		// ---------------------------------
		// Free approximation model:
		// derived from PE regime +
		// market breadth +
		// price momentum
		//
		// FSD-compliant:
		// derived live intelligence
		// NOT hardcoded
		// ---------------------------------

		const equityCache =
		  DSSCache.get("nse:index") || {};

		const rsi =
		  equityCache?.rsi || 50;

		const macd =
	  equityCache?.macd ?? null;

		const trendBoost =
		  macd > 0 ? 2 : -2;

		const rsiBoost =
		  rsi >= 60
			? 2
			: rsi <= 40
			? -2
			: 0;

		let earningsGrowth = 12;

		if (
		  niftyPe !== null
		) {

		  if (niftyPe <= 20) {
			earningsGrowth += 3;
		  }

		  if (niftyPe >= 24) {
			earningsGrowth -= 2;
		  }
		}

		earningsGrowth +=
		  trendBoost +
		  rsiBoost;

		earningsGrowth =
		  Math.max(
			6,
			Math.min(
			  20,
			  Number(
				earningsGrowth.toFixed(1)
			  )
			)
		  );

		// ---------------------------------
		// FUNDAMENTAL SCORES
		// ---------------------------------

		const revenueGrowthScore =
		  earningsGrowth >= 16
			? 78
			: earningsGrowth >= 13
			? 68
			: earningsGrowth >= 10
			? 58
			: 48;

		const marginExpansionScore =
	  macd === null
		? 55
		: macd > 0
		? 62
		: 46;

		const payload = {

		  niftyPe,

		  earningsGrowth,

		  revenueGrowthScore,

		  marginExpansionScore,

		  timestamp: Date.now(),

		  source:
			"fundamental-engine"
		};

		DSSCache.set(
		  "equity:fundamental",
		  payload
		);

		logger.info({
		  niftyPe,
		  earningsGrowth
		}, "Fundamental engine updated");

		return payload;

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "fetchFundamentalData failed");

		return (
		  DSSCache.get(
			"equity:fundamental"
		  ) || null
		);
	  }
	}


////////////////////////////////////////////////////////
// SECTION-15 : GLOBAL MACRO ENGINE
// deriveFedPolicy / buildGlobalMacroPayload / fetchYahooQuote
// fetchIndiaMacro (hardcoded stub — D2-A live yields pending)
// Writes to DSSCache("equity:global")
////////////////////////////////////////////////////////

	// =====================================
	// GLOBAL INTELLIGENCE ENGINE
	// =====================================

	function deriveFedPolicy({
	  us10Y,
	  dxy
	}) {

	  if (
		us10Y >= 4.5 &&
		dxy >= 105
	  ) {

		return {
		  stance: "Hawkish",
		  signal: SIGNAL_ENUM.SELL,
		  bull: false
		};
	  }

	  if (
		us10Y <= 4.0 &&
		dxy <= 103
	  ) {

		return {
		  stance: "Dovish",
		  signal: SIGNAL_ENUM.BUY,
		  bull: true
		};
	  }

	  return {
		stance: "Neutral",
		signal: SIGNAL_ENUM.WATCH,
		bull: null
	  };
	}

	async function buildGlobalMacroPayload() {

	  try {

		const [
		  us10Y,
		  dxy,
		  crude
		] = await Promise.all([

		  fetchYahooQuote(DEBT_SYMBOLS.US10Y),

		  fetchYahooQuote(DEBT_SYMBOLS.DXY),

		  fetchCrude()
		]);

		const fed =
		  deriveFedPolicy({
			us10Y:
			  us10Y?.current || null,

			dxy:
			  dxy?.current || null
		  });

		const payload = {

		  us10Y:
			us10Y?.current || null,

		  dxy:
			dxy?.current || null,

		  crudeOil:
			crude || null,

		  fedPolicy: fed,

		  timestamp: Date.now()
		};

		DSSCache.set(
		  "equity:global",
		  payload
		);

		return payload;

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "buildGlobalMacroPayload failed");

		return DSSCache.get("equity:global") || null;
	  }
	}


	async function fetchYahooQuote(symbol) {

	  if (YAHOO_PAUSED) { return null; }

	  const cacheKey = `yahoo:quote:${symbol}`;

	  try {

		const url =
		  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`;

		const data = await safeFetch(url);

		const result =
		  data?.chart?.result?.[0];

		if (!result) {
		  const cached = DSSCache.get(cacheKey);
		  if (cached) { logger.warn({ symbol }, "fetchYahooQuote: no result — serving cache"); return cached; }
		  return null;
		}

		const closes =
		  result?.indicators?.quote?.[0]?.close
			?.filter(v => v !== null && !isNaN(v))
			|| [];

		if (!closes.length) {
		  const cached = DSSCache.get(cacheKey);
		  if (cached) { logger.warn({ symbol }, "fetchYahooQuote: no closes — serving cache"); return cached; }
		  return null;
		}

		const current =
		  Number(result?.meta?.regularMarketPrice)
		  || closes[closes.length - 1];

		const prev =
		  closes[closes.length - 2] || current;

		const changePct =
		  prev
			? Number((((current - prev) / prev) * 100).toFixed(2))
			: 0;

		const quote = {
		  current,
		  prev,
		  changePct,
		  closes
		};

		DSSCache.set(cacheKey, quote);
		return quote;

	  } catch (err) {

		logger.error({
		  err: err.message,
		  symbol
		}, "Debt quote fetch failed");

		const cached = DSSCache.get(cacheKey);
		if (cached) { logger.warn({ symbol }, "fetchYahooQuote: exception — serving cache"); return cached; }
		return null;
	  }
	}

	async function fetchIndiaMacro() {

	  // Helper: fetch a Trading Economics page and extract the first yield value
	  async function fetchTEYield(url, label) {
		try {
		  const res = await fetchWithRetry(url, {
			headers: {
			  "User-Agent": getNextUA(),
			  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
			  "Accept-Language": "en-US,en;q=0.9"
			}
		  }, "TE");
		  if (!res) return null;
		  const html = await res.text();
		  // Match pattern: "X.XX%" appearing after "Bond Yield" context
		  const match = html.match(/Bond Yield[^0-9]*([0-9]+\.[0-9]+)%/);
		  if (match) {
			const val = parseFloat(match[1]);
			if (val > 1 && val < 20) {
			  logger.info({ label, yield: val }, "TE yield fetched");
			  return val;
			}
		  }
		  logger.warn({ label, url }, "TE yield parse failed — no match");
		  return null;
		} catch (err) {
		  logger.warn({ label, err: err.message }, "TE yield fetch failed");
		  return null;
		}
	  }

	  try {

		// Fetch live G-Sec yields from Trading Economics
		const [gsec10Y, gsec5Y, gsec2Y] = await Promise.all([
		  fetchTEYield("https://tradingeconomics.com/india/government-bond-yield", "10Y"),
		  fetchTEYield("https://tradingeconomics.com/india/5-year-note-yield", "5Y"),
		  fetchTEYield("https://tradingeconomics.com/india/2-year-note-yield", "2Y")
		]);

		// Fall back to last-known values if fetch fails
		return {
		  repoRate: 6.5,
		  cpi: 4.75,
		  gsec10Y: gsec10Y || 7.08,
		  gsec5Y: gsec5Y || 6.96,
		  gsec1Y: gsec2Y || 6.82,
		  gsecLive: !!(gsec10Y && gsec5Y && gsec2Y)
		};

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "Macro fetch failed");

		return null;
	  }
	}

		function classifySectorPhase(returnPct, momentum) {

		  if (returnPct >= 1.5 && momentum === "improving") {
			return "LEADING";
		  }

		  if (returnPct < 1.5 && momentum === "improving") {
			return "IMPROVING";
		  }

		  if (returnPct >= -1 && momentum === "deteriorating") {
			return "WEAKENING";
		  }

		  return "LAGGING";
		}

		function buildSectorSignal(returnPct) {

		  if (returnPct >= 2) {
			return {
			  signal: "BUY",
			  sentiment: "bullish",
			  strength: "STRONG"
			};
		  }

		  if (returnPct <= -2) {
			return {
			  signal: "SELL",
			  sentiment: "bearish",
			  strength: "WEAK"
			};
		  }

		  return {
			signal: SIGNAL_ENUM.WATCH,
			sentiment: SENTIMENT_ENUM.NEUTRAL,
			strength: "WEAK"
		  };
		}

		function buildSectorFlow(returnPct, momentum) {

		  let score = returnPct * 400;

		  if (momentum === "improving") {
			score += 600;
		  } else {
			score -= 600;
		  }

		  return {
			valueCr: Math.round(score),
			direction:
			  score >= 0
				? "inflow"
				: "outflow"
		  };
		}

		function buildThemeSignal(sector, signalObj) {

		  const bullishThemes = {
			FMCG: "FMCG Rural Recovery",
			IT: "Export IT Tailwind",
			PHARMA: "Pharma US Generics",
			PSU_BANK: "PSU Credit Expansion"
		  };

		  const bearishThemes = {
			REALTY: "Real Estate Affordability",
			METALS: "China Metal Demand Weakness",
			PRIVATE_BANK: "Banking NIM Compression"
		  };

		  if (signalObj.sentiment === "bullish") {
			return {
			  name:
				bullishThemes[sector]
				|| `${sector} Strength`,
			  sentiment: "bullish"
			};
		  }

		  if (signalObj.sentiment === "bearish") {
			return {
			  name:
				bearishThemes[sector]
				|| `${sector} Weakness`,
			  sentiment: "bearish"
			};
		  }

		  return {
			name: `${sector} Consolidation`,
			sentiment: "neutral"
		  };
		}
		
	////////////////////////////////////////////////////////
// SECTION-18 : DEBT ENGINE
// buildYieldCurve / computeRealRate / buildRateSignals
// buildDebtRecommendation / buildDebtPayload / refreshDebtCache
// Writes to DSSCache("nse:debt")
// NOTE: G-Sec yields currently stubbed in fetchIndiaMacro — D2-A pending
////////////////////////////////////////////////////////

	// =====================================
	// DEBT SIGNAL BUILDERS
	// =====================================

	function buildYieldCurve(macro) {

	  return [

		{
		  tenor: "1Y",
		  yield: macro.gsec1Y
		},

		{
		  tenor: "5Y",
		  yield: macro.gsec5Y
		},

		{
		  tenor: "10Y",
		  yield: macro.gsec10Y
		}
	  ];
	}

	function computeRealRate(repoRate, cpi) {

	  if (
		repoRate === null ||
		cpi === null
	  ) {
		return null;
	  }

	  return Number(
		(repoRate - cpi).toFixed(2)
	  );
	}

	function buildRateSignals({
	  realRate,
	  us10Y,
	  dxy
	}) {

	  const signals = [];

	  if (realRate >= 1.5) {

		signals.push({
		  factor: "Real Rates",
		  signal: "POSITIVE",
		  bull: true
		});

	  } else {

		signals.push({
		  factor: "Real Rates",
		  signal: "NEGATIVE",
		  bull: false
		});
	  }

	  if (us10Y <= 4.5) {

		signals.push({
		  factor: "US 10Y",
		  signal: "STABLE",
		  bull: true
		});

	  } else {

		signals.push({
		  factor: "US 10Y",
		  signal: "RISK",
		  bull: false
		});
	  }

	  if (dxy <= 106) {

		signals.push({
		  factor: "Dollar Index",
		  signal: "SUPPORTIVE",
		  bull: true
		});

	  } else {

		signals.push({
		  factor: "Dollar Index",
		  signal: "PRESSURE",
		  bull: false
		});
	  }

	  return signals;
	}
	
	////////////////////////////////////////////////////////
// SECTION-19 : DERIVED MACRO SCORE ENGINE (PATCH E-7)
// deriveInflationScore / deriveGrowthScore
// deriveLiquidityScore / deriveMacroCompositeScore
// All scores 0-100. Inputs from live macro cache.
////////////////////////////////////////////////////////

// =====================================
// DERIVED MACRO SCORE ENGINE
// PATCH E-7
// =====================================

function deriveInflationScore(cpi) {

  if (cpi === null || cpi === undefined) {
    return 50;
  }

  if (cpi <= 4) {
    return 82;
  }

  if (cpi <= 5) {
    return 72;
  }

  if (cpi <= 6) {
    return 60;
  }

  if (cpi <= 7) {
    return 45;
  }

  return 30;
}

function deriveGrowthScore(gdpGrowth) {

  if (gdpGrowth === null || gdpGrowth === undefined) {
    return 50;
  }

  if (gdpGrowth >= 8) {
    return 85;
  }

  if (gdpGrowth >= 7) {
    return 75;
  }

  if (gdpGrowth >= 6) {
    return 65;
  }

  if (gdpGrowth >= 5) {
    return 52;
  }

  return 38;
}

function deriveLiquidityScore({
  fiiEquity,
  diiEquity,
  sipMonthlyFlowCr
}) {

  let score = 50;

  if (
  fiiEquity !== null &&
  fiiEquity !== undefined &&
  !isNaN(fiiEquity)
) {

    if (fiiEquity > 5000) {
      score += 15;
    } else if (fiiEquity > 0) {
      score += 8;
    } else if (fiiEquity < -5000) {
      score -= 15;
    } else {
      score -= 8;
    }
  }

  if (
  diiEquity !== null &&
  diiEquity !== undefined &&
  !isNaN(diiEquity)
) {

    if (diiEquity > 3000) {
      score += 10;
    } else if (diiEquity < -3000) {
      score -= 10;
    }
  }

  if (
  sipMonthlyFlowCr !== null &&
  sipMonthlyFlowCr !== undefined &&
  !isNaN(sipMonthlyFlowCr)
) {

  if (sipMonthlyFlowCr >= 20000) {
    score += 12;

  } else if (sipMonthlyFlowCr >= 15000) {
    score += 8;

  } else if (sipMonthlyFlowCr < 10000) {
    score -= 8;
  }
}

  return Math.max(
    20,
    Math.min(90, score)
  );
}

function deriveMacroCompositeScore({
  inflationScore,
  growthScore,
  liquidityScore
}) {

  return Number(
    (
      (
        inflationScore * 0.3 +
        growthScore * 0.4 +
        liquidityScore * 0.3
      )
    ).toFixed(1)
  );
}

	function buildDebtRecommendation({
	  repoRate,
	  cpi,
	  us10Y
	}) {

	  if (
		repoRate > cpi &&
		us10Y < 4.5
	  ) {

		return {
		  stance: "FAVORABLE",
		  duration: "MEDIUM_TO_LONG",
		  signal: "BUY"
		};
	  }

	  return {
		stance: "CAUTIOUS",
		duration: "SHORT_DURATION",
		signal: "WATCH"
	  };
	}

////////////////////////////////////////////////////////
// SECTION-20 : EQUITY UI BUILDERS
// buildEquitySignals / buildEquityKPIBlock
// buildTechnicalSignalTable / buildFundamentalSignals
// buildMacroNumbers / buildFundFlows
// buildGlobalSignals / buildOISignals
// All functions return display-ready API payload fragments.
// ZERO computation in frontend — all values shaped here.
////////////////////////////////////////////////////////

		// ===============================
		// DSS v6 — EQUITY SIGNAL BUILDER
		// ===============================
		function buildEquitySignals(cache) {

		  const rsi = cache?.rsi ?? null;
		  const sma50 = cache?.sma50 ?? null;
		  const sma200 = cache?.sma200 ?? null;
		  const macd = cache?.macd ?? null;
		  const crossSignal = cache?.crossSignal ?? null;
		  const nifty = cache?.niftyLtp ?? null;
		  const vix = cache?.vixValue ?? null;

		  const dma50Signal =
			nifty && sma50
			  ? nifty > sma50 ? "BUY" : "SELL"
			  : "WATCH";

		  const dma200Signal =
			nifty && sma200
			  ? nifty > sma200 ? "BUY" : "SELL"
			  : "WATCH";

		  return {
			rsi: {
			  value: rsi,
			  signal:
				rsi >= 70
				  ? "SELL"
				  : rsi <= 30
				  ? "BUY"
				  : "WATCH",

			  sentiment:
				rsi >= 70
				  ? "bearish"
				  : rsi <= 30
				  ? "bullish"
				  : "neutral"
			},

			dma50: {
			  value: sma50,
			  signal: dma50Signal,
			  sentiment:
				dma50Signal === "BUY"
				  ? "bullish"
				  : dma50Signal === "SELL"
				  ? "bearish"
				  : "neutral"
			},

			dma200: {
			  value: sma200,
			  signal: dma200Signal,
			  sentiment:
				dma200Signal === "BUY"
				  ? "bullish"
				  : dma200Signal === "SELL"
				  ? "bearish"
				  : "neutral"
			},

			macd: {
			  value: macd,
			  signal:
				macd > 0
				  ? "BUY"
				  : macd < 0
				  ? "SELL"
				  : "WATCH",

			  sentiment:
				macd > 0
				  ? "bullish"
				  : macd < 0
				  ? "bearish"
				  : "neutral"
			},

			cross: {
			  value: crossSignal,
			  signal:
				crossSignal === "GOLDEN_CROSS"
				  ? "BUY"
				  : crossSignal === "DEATH_CROSS"
				  ? "SELL"
				  : "WATCH",

			  sentiment:
				crossSignal === "GOLDEN_CROSS"
				  ? "bullish"
				  : crossSignal === "DEATH_CROSS"
				  ? "bearish"
				  : "neutral"
			},

			volatility: {
			  value: vix,

			  signal:
				vix >= 20
				  ? "SELL"
				  : vix <= 14
				  ? "BUY"
				  : "WATCH",

			  sentiment:
				vix >= 20
				  ? "bearish"
				  : vix <= 14
				  ? "bullish"
				  : "neutral"
			}
		  };
		}
		 
		 // ===============================
		// DSS v6 — EQUITY UI DATA BUILDERS
		// ===============================
function formatNumber(value, digits = 2) {

		  if (value === null || value === undefined || isNaN(value)) {
			return null;
		  }

		  return Number(Number(value).toFixed(digits));
		}


		function formatCurrencyCr(value) {

	  if (
		value === null ||
		value === undefined ||
		isNaN(value)
	  ) {
		return "Unavailable";
	  }

	  const sign =
		value >= 0 ? "+" : "-";

	  return `${sign}₹${Math.abs(value).toLocaleString("en-IN")} Cr`;
	}

	function deriveFlowSignal(value) {

	  if (
		value === null ||
		value === undefined
	  ) {
		return "WATCH";
	  }

	  if (value > 0) {
		return "BUY";
	  }

	  if (value < 0) {
		return "SELL";
	  }

	  return "WATCH";
	}

	function deriveBullish(value) {

	  if (
		value === null ||
		value === undefined
	  ) {
		return null;
	  }

	  return value > 0;
	}

		function buildEquityKPIBlock(cache) {
		  
			const macro =
		DSSCache.get("equity:macro") || {};

	  const flows =
		DSSCache.get("equity:flows") || {};
		  

		  const nifty = cache?.niftyLtp ?? null;
		  const changePct = cache?.niftyChangePct ?? null;

		  const sma50 = cache?.sma50 ?? null;
		  const sma200 = cache?.sma200 ?? null;

		  const fundamentals =
	  DSSCache.get(
		"equity:fundamental"
	  ) || {};

	const pe =
	  fundamentals?.niftyPe ?? null;

	const earningsGrowth =
	  fundamentals?.earningsGrowth ?? null;

		  const dma200Delta =
			nifty && sma200
			  ? Number((((nifty - sma200) / sma200) * 100).toFixed(2))
			  : null;

		  return {

			marketScore: computeMarketScore(cache),

			fearGreed: computeFearGreed(cache),

			nifty: formatNumber(nifty),

			vix: formatNumber(cache?.vixValue),

			pcr:
	  formatNumber(flows?.pcr),

	rsi:
	  formatNumber(cache?.rsi),

	dma50:
	  formatNumber(sma50),

	dma200:
	  formatNumber(sma200),

	pe,

	gdp:
	  formatNumber(macro?.gdpGrowth),

	cpi:
	  formatNumber(macro?.cpi),

	repoRate:
	  formatNumber(macro?.repoRate),

			kpiCards: [

			  {
				label: "Nifty 50 LTP",
				value:
				  nifty !== null
					? formatNumber(nifty)
					: null,

				sub:
				  changePct !== null
					? `${changePct > 0 ? "+" : ""}${changePct}% today`
					: "Unavailable",

				signal:
				  changePct > 0
					? "BUY"
					: changePct < 0
					? "SELL"
					: "WATCH"
			  },

			  {
				label: "VS 200 DMA",

				value:
				  dma200Delta !== null
					? `${dma200Delta}%`
					: null,

				sub:
				  sma200
					? `200 DMA at ${formatNumber(sma200)}`
					: "Unavailable",

				signal:
				  dma200Delta > 0
					? "BUY"
					: "SELL"
			  },

			  {
				label: "P/E Ratio (TTM)",

				value:
	  pe !== null
		? pe
		: "Unavailable",

				sub: "5Y avg 22.1×",

				signal:
				  pe <= 20
					? "BUY"
					: pe >= 24
					? "SELL"
					: "WATCH"
			  },

			  {
				label: "Earnings Growth (FY25E)",

				value:
	  earningsGrowth !== null
		? `${earningsGrowth}%`
		: "Unavailable",

				sub: "Nifty EPS forward estimate",

				signal:
				  earningsGrowth >= 12
					? "BUY"
					: "WATCH"
			  }
			]
		  };
		}

		function buildTechnicalSignalTable(cache) {

		  const nifty = cache?.niftyLtp ?? null;

		  const sma50 = cache?.sma50 ?? null;
		  const sma200 = cache?.sma200 ?? null;

		  const rsi = cache?.rsi ?? null;
		  const macd = cache?.macd ?? null;

		  const dataTs = cache?.ts || 0;
		  const ttlMs = 30000;
		  const freshnessScore = computeFreshnessScore(dataTs, ttlMs);

		  const rsiSentiment = rsi === null ? SENTIMENT_ENUM.NEUTRAL : rsi >= 70 ? SENTIMENT_ENUM.BEARISH : rsi <= 30 ? SENTIMENT_ENUM.BULLISH : SENTIMENT_ENUM.NEUTRAL;
		  const macdSentiment = macd === null ? SENTIMENT_ENUM.NEUTRAL : macd > 0 ? SENTIMENT_ENUM.BULLISH : SENTIMENT_ENUM.BEARISH;
		  const sma50Sentiment = (nifty === null || sma50 === null) ? SENTIMENT_ENUM.NEUTRAL : nifty > sma50 ? SENTIMENT_ENUM.BULLISH : SENTIMENT_ENUM.BEARISH;
		  const sma200Sentiment = (nifty === null || sma200 === null) ? SENTIMENT_ENUM.NEUTRAL : nifty > sma200 ? SENTIMENT_ENUM.BULLISH : SENTIMENT_ENUM.BEARISH;

		  return [

			{
			  name: "RSI (14D)",
			  value: formatNumber(rsi),

			  reading:
				rsi >= 70
				  ? "Overbought"
				  : rsi <= 30
				  ? "Oversold"
				  : "Neutral",

			  signal:
				rsi >= 70
				  ? "SELL"
				  : rsi <= 30
				  ? "BUY"
				  : "WATCH",

			  bull:
				rsi <= 30
				  ? true
				  : rsi >= 70
				  ? false
				  : null,

			  confidence: rsi === null ? 0.30 : computeConfidence(
				freshnessScore,
				computeStrengthScore(rsi, rsi >= 70 ? SIGNAL_ENUM.SELL : rsi <= 30 ? SIGNAL_ENUM.BUY : SIGNAL_ENUM.WATCH, { buyThreshold: 30, sellThreshold: 70, min: 0, max: 100 }),
				computeAgreementScore(rsiSentiment, [macdSentiment, sma50Sentiment, sma200Sentiment])
			  )
			},

			{
	  name: "MACD",

	  value: formatNumber(macd),

	  reading:
		macd === null
		  ? "Unavailable"
		  : macd > 0
		  ? "Bullish crossover"
		  : "Bearish crossover",

	  signal:
		macd === null
		  ? "WATCH"
		  : macd > 0
		  ? "BUY"
		  : "SELL",

	  bull:
	  macd === null
		? null
		: macd > 0,

	  confidence: macd === null ? 0.30 : computeConfidence(
		freshnessScore,
		computeStrengthScore(macd, macd > 0 ? SIGNAL_ENUM.BUY : SIGNAL_ENUM.SELL, { buyThreshold: 0, sellThreshold: 0, min: -50, max: 50 }),
		computeAgreementScore(macdSentiment, [rsiSentiment, sma50Sentiment, sma200Sentiment])
	  )
	},

			{
			  name: "50 DMA",

			  value: formatNumber(sma50),

			  reading:
	  nifty === null || sma50 === null
		? "Unavailable"
		: nifty > sma50
		? "Price above short-term trend"
		: "Price below short-term trend",

			  signal:
	  nifty === null || sma50 === null
		? "WATCH"
		: nifty > sma50
		? "BUY"
		: "SELL",

			  bull:
	  nifty === null || sma50 === null
		? null
		: nifty > sma50,

			  confidence: (nifty === null || sma50 === null) ? 0.30 : computeConfidence(
				freshnessScore,
				computeStrengthScore(nifty, nifty > sma50 ? SIGNAL_ENUM.BUY : SIGNAL_ENUM.SELL, { buyThreshold: sma50, sellThreshold: sma50, min: sma50 * 0.8, max: sma50 * 1.2 }),
				computeAgreementScore(sma50Sentiment, [rsiSentiment, macdSentiment, sma200Sentiment])
			  )
			},

			{
			  name: "200 DMA",

			  value: formatNumber(sma200),

			  reading:
	  nifty === null || sma200 === null
		? "Unavailable"
		: nifty > sma200
		? "Price above long-term trend"
		: "Price below long-term trend",

			  signal:
	  nifty === null || sma200 === null
		? "WATCH"
		: nifty > sma200
		? "BUY"
		: "SELL",

			  bull:
	  nifty === null || sma200 === null
		? null
		: nifty > sma200,

			  confidence: (nifty === null || sma200 === null) ? 0.30 : computeConfidence(
				freshnessScore,
				computeStrengthScore(nifty, nifty > sma200 ? SIGNAL_ENUM.BUY : SIGNAL_ENUM.SELL, { buyThreshold: sma200, sellThreshold: sma200, min: sma200 * 0.8, max: sma200 * 1.2 }),
				computeAgreementScore(sma200Sentiment, [rsiSentiment, macdSentiment, sma50Sentiment])
			  )
			}

		  ];
		}

////////////////////////////////////////////////////////
// SECTION-21 : SUPPORT RESISTANCE ENGINE
// buildSupportResistance — DMA-zone model (current)
// Future: swing high/low from daily closes (E4-A pending)
////////////////////////////////////////////////////////

		function buildSupportResistance(cache) {

  const ltp =
    Number(cache?.niftyLtp) || null;

  const sma50 =
    Number(cache?.sma50) || null;

  const sma200 =
    Number(cache?.sma200) || null;

  if (!ltp) {

    return {
      support: [],
      resistance: [],
      regime: "UNKNOWN"
    };
  }

  // =====================================
  // REGIME DETECTION
  // =====================================

  let regime = "RANGE";

  if (
    sma50 &&
    sma200
  ) {

    if (sma50 > sma200) {
      regime = "BULLISH";
    }

    if (sma50 < sma200) {
      regime = "BEARISH";
    }
  }

  // =====================================
  // DYNAMIC BUFFER MODEL
  // =====================================

  const nearBuffer =
    Number((ltp * 0.005).toFixed(0));

  const wideBuffer =
    Number((ltp * 0.012).toFixed(0));

  // =====================================
  // SUPPORT ZONES
  // =====================================

  const support = [];

  if (sma50) {

    support.push({

      label: "DMA50 Support",

      value:
        Math.round(sma50),

      zoneLow:
        Math.round(
          sma50 - nearBuffer
        ),

      zoneHigh:
        Math.round(
          sma50 + nearBuffer
        ),

      strength:
        regime === "BULLISH"
          ? "STRONG"
          : "MEDIUM"
    });
  }

  if (sma200) {

    support.push({

      label: "DMA200 Major Support",

      value:
        Math.round(sma200),

      zoneLow:
        Math.round(
          sma200 - wideBuffer
        ),

      zoneHigh:
        Math.round(
          sma200 + wideBuffer
        ),

      strength: "MAJOR"
    });
  }

  // =====================================
  // RESISTANCE ZONES
  // =====================================

  const resistance = [];

  if (sma50) {

    resistance.push({

      label: "Near Resistance",

      value:
        Math.round(
          ltp + nearBuffer
        ),

      zoneLow:
        Math.round(
          ltp + nearBuffer * 0.5
        ),

      zoneHigh:
        Math.round(
          ltp + nearBuffer * 1.5
        ),

      strength:
        regime === "BEARISH"
          ? "STRONG"
          : "MEDIUM"
    });
  }

  if (sma200) {

    resistance.push({

      label: "Major Resistance",

      value:
        Math.round(
          ltp + wideBuffer
        ),

      zoneLow:
        Math.round(
          ltp + wideBuffer * 0.7
        ),

      zoneHigh:
        Math.round(
          ltp + wideBuffer * 1.3
        ),

      strength: "MAJOR"
    });
  }

  return {

    regime,

    support,

    resistance,

    meta: {

      ltp,

      sma50,

      sma200,

      nearBuffer,

      wideBuffer,

      source:
        "dma-zone-engine"
    }
  };
}

		function buildGlobalSignals(cache) {
		  
			const global =
		DSSCache.get("equity:global") || {};

			return [

		{
		  factor: "US Fed Policy",

		  status:
			global?.fedPolicy?.stance ||
			"Unavailable",

		  impact:
			global?.fedPolicy?.signal ||
			"Unavailable",

		  sig:
			global?.fedPolicy?.signal ||
			"WATCH",

		  bull:
			global?.fedPolicy?.bull ?? null
		},

		{
		  factor: "VIX",

		  status:
			formatNumber(cache?.vixValue),

		  impact:
			"Volatility sentiment",

		  sig:
			cache?.vixValue >= 20
			  ? "HIGH VOL"
			  : "NORMAL",

		  bull:
			cache?.vixValue < 20
		},

		{
		  factor: "Crude Oil",

		  status:
			global?.crudeOil
			  ? `$${formatNumber(global.crudeOil)}`
			  : "Unavailable",

		  impact:
			"Imported inflation watch",

		  sig:
			global?.crudeOil >= 85
			  ? "RISK"
			  : "WATCH",

		  bull:
			global?.crudeOil < 75
		}

	  ];
		}

		function buildOISignals(cache) {
			
			const flows =
		DSSCache.get("equity:flows") || {};

		  return [

			{
			  name: "VIX Level",
			  val: formatNumber(cache?.vixValue),
			  meaning: "Market volatility regime",

			  sig:
				cache?.vixValue >= 20
				  ? "FEAR"
				  : "CALM",

			  bull:
				cache?.vixValue < 20
			},

			{
			  name: "PCR (OI)",
			  val:
	  formatNumber(flows?.pcr),
			  meaning: "Options positioning",

			  sig:
	  flows?.pcr >= 1.2
		? "BULLISH"
		: flows?.pcr <= 0.8
		? "BEARISH"
		: "NEUTRAL",

			  bull:
	  flows?.pcr >= 1.2
		? true
		: flows?.pcr <= 0.8
		? false
		: null
			}

		  ];
		}

////////////////////////////////////////////////////////
// SECTION-22 : MARKET SCORE ENGINE
// computeMarketScore — heuristic 0-100 (FSD B.3 alignment pending OV1-B)
// computeFearGreed — multi-factor 0-100
////////////////////////////////////////////////////////

		function computeMarketScore(cache) {

		  let score = 50;

		  if (cache?.rsi > 60) score += 10;
		  if (cache?.rsi < 40) score -= 10;

		  if (cache?.macd > 0) score += 10;
		  if (cache?.macd < 0) score -= 10;

		  if (cache?.vixValue > 20) score -= 10;

		  return Math.max(0, Math.min(100, score));
		}

		function buildFundamentalSignals(cache) {
			
		  const fundamentals =
	  DSSCache.get(
		"equity:fundamental"
	  ) || {};	
			

		  const peValue =
	  fundamentals?.niftyPe;

	const earningsValue =
	  fundamentals?.earningsGrowth;

	const peScore =
	  peValue
		? peValue <= 20
		  ? 75
		  : peValue >= 24
		  ? 40
		  : 60
		: 60;

	const earningsScore =
	  earningsValue >= 15
		? 75
		: earningsValue >= 10
		? 60
		: 45;

		  return [

			{
			  name: "Earnings Momentum",
			  score: earningsScore,
			  color:
				earningsScore >= 70
				  ? "#00c97a"
				  : earningsScore <= 45
				  ? "#ff4d6d"
				  : "#f5a623"
			},

			{
			  name: "Valuation (P/E)",
			  score: peScore,
			  color:
				peScore >= 70
				  ? "#00c97a"
				  : peScore <= 45
				  ? "#ff4d6d"
				  : "#f5a623"
			},

			{
	  name: "Revenue Growth",

	  score:
		fundamentals?.revenueGrowthScore || 55,

	  color:
		(fundamentals?.revenueGrowthScore || 55) >= 70
		  ? "#00c97a"
		  : (fundamentals?.revenueGrowthScore || 55) <= 45
		  ? "#ff4d6d"
		  : "#f5a623"
	},

			{
	  name: "Margin Expansion",

	  score:
		fundamentals?.marginExpansionScore || 48,

	  color:
		(fundamentals?.marginExpansionScore || 48) >= 70
		  ? "#00c97a"
		  : (fundamentals?.marginExpansionScore || 48) <= 45
		  ? "#ff4d6d"
		  : "#f5a623"
	},

			...(() => {
			  const macro = DSSCache.get("equity:macro") || {};
			  const pmi = macro.manufacturingPMI || null;
			  const gst = macro.gstCollections || null;
			  // PMI score: >55 bullish, 50-55 neutral, <50 bearish
			  const pmiScore = pmi ? (pmi >= 55 ? 72 : pmi >= 50 ? 58 : 42) : 58;
			  // GST score: >2.0L cr bullish, 1.7-2.0 neutral, <1.7 bearish
			  const gstScore = gst ? (gst >= 2.0 ? 75 : gst >= 1.7 ? 62 : 45) : 60;
			  const pmiColor = pmiScore >= 70 ? "#00c97a" : pmiScore <= 45 ? "#ff4d6d" : "#f5a623";
			  const gstColor = gstScore >= 70 ? "#00c97a" : gstScore <= 45 ? "#ff4d6d" : "#f5a623";
			  return [
				{ name: "Credit Growth", score: 60, color: "#00c97a" },
				{ name: "GST Collections", score: gstScore, color: gstColor },
				{ name: "IIP / PMI", score: pmiScore, color: pmiColor }
			  ];
			})()

		  ];
		}

		function buildMacroNumbers(cache) {
			
			  const macro =
		DSSCache.get("equity:macro") || {};

			return [

		{
		  label: "CPI Inflation",

		  value:
			macro?.cpi !== null &&
			macro?.cpi !== undefined
			  ? `${formatNumber(macro.cpi)}%`
			  : "Unavailable",

		  signal:
			macro?.cpi >= 6
			  ? "HOT"
			  : macro?.cpi >= 4
			  ? "STICKY"
			  : "COOLING",

		  bull:
			macro?.cpi < 4
		},

		{
		  label: "GDP Growth (FY25E)",

		  value:
			macro?.gdpGrowth !== null &&
			macro?.gdpGrowth !== undefined
			  ? `${formatNumber(macro.gdpGrowth)}%`
			  : "Unavailable",

		  signal:
			macro?.gdpGrowth >= 6.5
			  ? "STRONG"
			  : "SLOWING",

		  bull:
			macro?.gdpGrowth >= 6.5
		},

		{
		  label: "GST Collections",

		  value:
			macro?.gstCollections
			  ? `₹${formatNumber(macro.gstCollections)}L Cr`
			  : "Unavailable",

		  signal: "TRACK",

		  bull: true
		},

		{
		  label: "India PMI Mfg",

		  value:
			macro?.manufacturingPMI
			  ? `${formatNumber(macro.manufacturingPMI)}`
			  : "Unavailable",

		  signal:
			macro?.manufacturingPMI >= 50
			  ? "EXPANSION"
			  : "CONTRACTION",

		  bull:
			macro?.manufacturingPMI >= 50
		},

		{
		  label: "Fiscal Deficit",

		  value:
			macro?.fiscalDeficit
			  ? `${formatNumber(macro.fiscalDeficit)}% GDP`
			  : "Unavailable",

		  signal: "INLINE",

		  bull: null
		}
		
		,
{
  label: "Inflation Score",

  value:
    macro?.inflationScore !== undefined
      ? `${macro.inflationScore}/100`
      : "Unavailable",

  signal:
    macro?.inflationScore >= 70
      ? "STRONG"
      : macro?.inflationScore >= 50
      ? "NEUTRAL"
      : "WEAK",

  bull:
    macro?.inflationScore >= 60
},

{
  label: "Growth Score",

  value:
    macro?.growthScore !== undefined
      ? `${macro.growthScore}/100`
      : "Unavailable",

  signal:
    macro?.growthScore >= 70
      ? "STRONG"
      : macro?.growthScore >= 50
      ? "NEUTRAL"
      : "WEAK",

  bull:
    macro?.growthScore >= 60
},

{
  label: "Liquidity Score",
value:
    macro?.liquidityScore !== undefined
      ? `${macro.liquidityScore}/100`
      : "Unavailable",

  signal:
    macro?.liquidityScore >= 70
      ? "STRONG"
      : macro?.liquidityScore >= 50
      ? "NEUTRAL"
      : "WEAK",

  bull:
    macro?.liquidityScore >= 60
},

{
  label: "Macro Composite",

  value:
    macro?.macroCompositeScore !== undefined
      ? `${macro.macroCompositeScore}/100`
      : "Unavailable",

  signal:
    macro?.macroCompositeScore >= 70
      ? "BULLISH"
      : macro?.macroCompositeScore >= 50
      ? "NEUTRAL"
      : "CAUTION",

  bull:
    macro?.macroCompositeScore >= 60
}	

	  ];
		}

		function buildFundFlows(cache) {
			
			  const flows =
		DSSCache.get("equity:flows") || {};
		
		const amfi =
  DSSCache.get("equity:amfi") || {};

			return [

		{
		  name: "FII Equity",

		  value:
			formatCurrencyCr(
			  flows?.fiiEquity
			),

		  signal:
			deriveFlowSignal(
			  flows?.fiiEquity
			),

		  bull:
			deriveBullish(
			  flows?.fiiEquity
			)
		},

		{
		  name: "DII Equity",

		  value:
			formatCurrencyCr(
			  flows?.diiEquity
			),

		  signal:
			deriveFlowSignal(
			  flows?.diiEquity
			),

		  bull:
			deriveBullish(
			  flows?.diiEquity
			)
		},

				
	  {
	  name: "Net FII Futures Positioning",

	  value:
		formatCurrencyCr(
		  flows?.fiiFuturesPositioning
		),

	  signal:
		deriveFlowSignal(
		  flows?.fiiFuturesPositioning
		),

	  bull:
		deriveBullish(
		  flows?.fiiFuturesPositioning
		)
	},

{
  name: "FII Debt",

  value:
    formatCurrencyCr(
      flows?.fiiDebt
    ),

  signal:
    deriveFlowSignal(
      flows?.fiiDebt
    ),

  bull:
    deriveBullish(
      flows?.fiiDebt
    )
},

{
  name: "MF SIP Monthly",

  value:
    amfi?.sipMonthlyFlowCr
      ? `₹${amfi.sipMonthlyFlowCr.toLocaleString("en-IN")} Cr`
      : "Unavailable",

  signal:
    amfi?.sipMonthlyFlowCr >= 15000
      ? "STRONG"
      : "NORMAL",

  bull:
    amfi?.sipMonthlyFlowCr >= 15000
}

	  ];
		}

		function computeFearGreed(cache) {

		  let score = 50;

		  if (cache?.vixValue > 20) score -= 20;
		  if (cache?.vixValue < 14) score += 10;

		  if (cache?.niftyChangePct > 0) score += 10;
		  if (cache?.niftyChangePct < 0) score -= 10;

		  return Math.max(0, Math.min(100, score));
		}
		 
		// ===============================
		// DSS v6 — BRAIN RESPONSE BUILDER
		// ===============================
		function buildBrainResponse({
		  regime,
		  compositeScore,
		  confidence,
		  marketQuality,
		  signals,
		  intelligence,
		  risk,
		  interpretation,
		  advisory
		}) {

		  const marketView = safeExecute(() =>
			buildMarketView({
			  regime,
			  compositeScore,
			  confidence,
			  marketQuality,
			  signals,
			  intelligence
			}),
			{}
		  );

		  const portfolioGuidance = safeExecute(() =>
			buildPortfolioGuidance({
			  regime,
			  confidence
			}),
			{}
		  );

		  const riskDashboard = safeExecute(() =>
			buildRiskDashboard({
			  risk,
			  signals,
			  intelligence
			}),
			{}
		  );

		  const regimeIntel = {
			...intelligence
		  };

		  const narrative = safeExecute(() =>
			buildNarrative({
			  regime,
			  interpretation,
			  advisory
			}),
			{}
		  );

		  return {
			marketView,
			portfolioGuidance,
			riskDashboard,
			regimeIntel,
			narrative
		  };
		}

		// ===============================
		// DSS v6 — SIGNAL RESPONSE BUILDER
		// ===============================
		function buildSignalsResponse({
		  regime,
		  compositeScore,
		  confidence,
		  marketQuality,
		  signals,
		  intelligence
		}) {

		  const simplifiedSignals = {};

		  Object.keys(signals || {}).forEach(key => {
			simplifiedSignals[key] = signals[key].value;
		  });

		  return {
			regime,
			compositeScore,
			confidence,
			marketQuality,

			signals: simplifiedSignals,

			intelligence: {
			  conviction: intelligence.conviction,
			  signalBalance: intelligence.signalBalance,
			  conflict: intelligence.conflict,
			  positiveSignals: intelligence.positiveSignals,
			  negativeSignals: intelligence.negativeSignals
			}
		  };
		}

////////////////////////////////////////////////////////
// SECTION-25 : SCHEDULER + JOBS
// runNSEIndexJob (15s) — daily candles + intraday LTP
// refreshEquityMacroCaches (5min) — macro/flows/fundamental
// refreshSectorCache (60s) — 8 sectors
// refreshDebtCache (60s) — yield curve + global rates
// cleanupExpiredCache (10min) — TTL enforcement
////////////////////////////////////////////////////////

		// ===============================
		// DSS v6 — SCHEDULER
		// ===============================
		const NSE_POLL_INTERVAL = 15000;

		// B5 — Guard against concurrent runs caused by Yahoo 429 60s cooldowns
		// setInterval fires every 15s regardless of async completion. Without this
		// guard, 4+ instances stack up simultaneously waiting on 60s cooldowns.
		let nseIndexJobRunning = false;

		async function runNSEIndexJob() {
		  if (nseIndexJobRunning) {
			logger.warn("runNSEIndexJob skipped — previous run still in progress");
			return;
		  }
		  nseIndexJobRunning = true;

	  try {

		// =====================================
		// LIVE INTRADAY FETCH — NSE allIndices (no Yahoo dependency)
		// =====================================

		let current = null;
		let changePct = null;

		try {
		  // NSE session warmup — inline pattern (same as fetchNSEFlows)
		  // Step 1: GET homepage — establish session cookie
		  const warmup1 = await fetch("https://www.nseindia.com", {
			headers: {
			  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			  "Accept-Language": "en-US,en;q=0.9"
			}
		  });
		  const cookieHeader1 = warmup1.headers.get("set-cookie") || "";
		  const cookies1 = cookieHeader1.split(",").map(c => c.split(";")[0]).join("; ");
		  // Step 2: mandatory 2500ms wait
		  await new Promise(r => setTimeout(r, 2500));
		  // Step 3: GET market-data page — accumulate cookies
		  const warmup2 = await fetch("https://www.nseindia.com/market-data/live-equity-market", {
			headers: {
			  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			  "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
			  "Referer": "https://www.nseindia.com/",
			  "Cookie": cookies1
			}
		  });
		  const cookieHeader2 = warmup2.headers.get("set-cookie") || "";
		  const allCookies = [
			...cookies1.split("; "),
			...cookieHeader2.split(",").map(c => c.split(";")[0].trim())
		  ].filter(Boolean).join("; ");
		  // Step 4: 500ms wait before API call
		  await new Promise(r => setTimeout(r, 500));
		  // Step 5: GET allIndices with accumulated session cookies
		  const nseIndexRes = await fetch("https://www.nseindia.com/api/allIndices", {
			headers: {
			  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			  "Accept": "application/json, text/plain, */*",
			  "Accept-Language": "en-US,en;q=0.9",
			  "Referer": "https://www.nseindia.com/market-data/live-equity-market",
			  "X-Requested-With": "XMLHttpRequest",
			  "Cookie": allCookies
			}
		  });
		  if (!nseIndexRes) throw new Error("NSE allIndices returned null after session protocol");
		  const nseIndexJson = await nseIndexRes.json();
		  const niftyRow = nseIndexJson?.data?.find(x => x.index === "NIFTY 50");
		  if (niftyRow) {
			current = Number(niftyRow.last) || null;
			changePct = Number(niftyRow.percentChange) || null;
			logger.info({ current, changePct }, "NSE LTP updated");
		  } else {
			throw new Error("NIFTY 50 row not found in allIndices response");
		  }
		} catch (err) {
		  logger.warn({ err: err.message }, "NSE allIndices fetch failed — using cached LTP");
		  const cachedIndex = DSSCache.get("nse:index");
		  current = cachedIndex?.niftyLtp || null;
		  changePct = cachedIndex?.niftyChangePct || null;
		}

		// =====================================
		// DAILY CANDLES FOR REAL TECHNICALS
		// =====================================

		// Fetch only if cache is stale (>6h) — daily candles change once per day
		const cachedCandles = DSSCache.get("nse:dailyCandles");
		let dailyCloses = cachedCandles?.closes || [];
		const candleAge = cachedCandles ? Date.now() - cachedCandles.ts : Infinity;
		const candleFailedAt = DSSCache.get("nse:dailyCandlesFailedAt") || 0;
		const candleCooldownOk = (Date.now() - candleFailedAt) > 30 * 60 * 1000;
		if (!YAHOO_PAUSED && candleAge > 6 * 60 * 60 * 1000 && candleCooldownOk) {
		  const niftyDaily = await safeFetch(
			"https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=1y&interval=1d"
		  );
		  if (niftyDaily?.chart?.result?.[0]) {
			const fetched = niftyDaily.chart.result[0]
			  ?.indicators?.quote?.[0]?.close
			  ?.filter(v => v !== null && !isNaN(v) && isFinite(v)) || [];
			if (fetched.length > 0) {
			  dailyCloses = fetched;
			  const candlePayload = { closes: dailyCloses, ts: Date.now() };
			  DSSCache.set("nse:dailyCandles", candlePayload);
			  DSSCache.set("nse:dailyCandlesFailedAt", 0);
			  logger.info({ candles: dailyCloses.length }, "Daily candles cache refreshed");
			  try { require("fs").writeFileSync("/home/ubuntu/dss-system/data/candles-cache.json", JSON.stringify(candlePayload)); } catch(e) { logger.warn({ err: e.message }, "candles-cache.json write failed"); }
			} else {
			  DSSCache.set("nse:dailyCandlesFailedAt", Date.now());
			  logger.warn("Daily candles fetch returned empty — cooldown 30min");
			}
		  } else {
			// null response = 429 or network fail — set short 5min cooldown to avoid hammering Yahoo
			DSSCache.set("nse:dailyCandlesFailedAt", Date.now() - (25 * 60 * 1000)); // 5min effective cooldown
			logger.warn("Daily candles fetch returned null (429 or network) — cooldown 5min");
		  }
		}

		// =====================================
		// DAILY TECHNICALS
		// =====================================

		const rsi =
		  dailyCloses.length >= 15
			? computeRSI14(
				dailyCloses.slice(-50)
			  )
			: null;

		const sma50 =
		  dailyCloses.length >= 50
			? computeSMA(
				dailyCloses,
				50
			  )
			: null;

		const sma200 =
		  dailyCloses.length >= 200
			? computeSMA(
				dailyCloses,
				200
			  )
			: null;

		const ema12Daily =
		  dailyCloses.length >= 26
			? EMA(
				dailyCloses.slice(-60),
				12
			  )
			: null;

		const ema26Daily =
		  dailyCloses.length >= 26
			? EMA(
				dailyCloses.slice(-60),
				26
			  )
			: null;

		const macd =
		  ema12Daily !== null &&
		  ema26Daily !== null
			? Number(
				(
				  ema12Daily -
				  ema26Daily
				).toFixed(2)
			  )
			: null;

		const crossSignal =
		  sma50 && sma200
			? sma50 > sma200
			  ? "GOLDEN_CROSS"
			  : "DEATH_CROSS"
			: null;

		// =====================================
		// VIX — use cached value (fetched by refreshEquityMacroCaches every 15min)
		// =====================================

		const vixValue = marketCache.vixValue || null;

		// =====================================
		// CACHE UPDATE
		// =====================================

		DSSCache.set(
			"nse:index",
			{

			  niftyLtp: current,

			  niftyChangePct: changePct,

			  rsi,

			  sma50:
				sma50 !== null
				  ? Number(sma50.toFixed(2))
				  : null,

			  sma200:
				sma200 !== null
				  ? Number(sma200.toFixed(2))
				  : null,

			  macd,

			  crossSignal,

			  vixValue,

			  dailyCandleCount:
				dailyCloses.length,

			  timestamp: Date.now(),

			  source: "NSE"
			}
		  );

		logger.info({

		  source: "NSE",

		  hasData: !!current,

		  dailyCandles:
			dailyCloses.length,

		  sma50Live: !!sma50,

		  sma200Live: !!sma200,

		  rsiLive: !!rsi,

		  macdLive: !!macd

		}, "Market data updated");

	  } catch (err) {

		logger.error({
		  error: err.message,
		  stack: err.stack
		}, "NSE Scheduler failed");
	  } finally {
		// B5 — always release lock so next tick can run
		nseIndexJobRunning = false;
	  }
	}


		// ✅ START SCHEDULER (ONLY ONCE)
		setInterval(runNSEIndexJob, NSE_POLL_INTERVAL);
		setTimeout(async () => { await runNSEIndexJob(); }, 60000);
		setTimeout(() => {
		  refreshSectorCache();
		  setInterval(() => refreshSectorCache(), 600000);
		}, 180000);
		// refreshDebtCache setTimeout moved to 1-tab scope (scope fix)
		setTimeout(async () => { await fetchAMFISIPData(); }, 600000);
		setTimeout(async () => { await refreshEquityMacroCaches(); }, 660000);
		
		let macroRefreshRunning = false;
		
		
	async function refreshEquityMacroCaches() {

	  if (macroRefreshRunning) {
		return;
	  }

	  macroRefreshRunning = true;

	  try {

		if (
		  !DSSCache.isFresh(
			"equity:macro",
			CACHE_TTL_MACRO
		  )
		) {

		  await safeExecuteAsync(
			fetchMacroEconomics,
			null
		  );
		}

		if (
		  !DSSCache.isFresh(
			"equity:flows",
			CACHE_TTL_FLOW
		  )
		) {

		  await safeExecuteAsync(
			fetchNSEFlows,
			null
		  );
		}

		if (
		  !DSSCache.isFresh(
			"equity:global",
			CACHE_TTL_MACRO
		  )
		) {

		  await safeExecuteAsync(
			buildGlobalMacroPayload,
			null
		  );
		}

		if (
		  !DSSCache.isFresh(
			"equity:fundamental",
			CACHE_TTL_FUNDAMENTAL
		  )
		)

    if (
      !DSSCache.isFresh(
        "equity:amfi",
        CACHE_TTL_AMFI
      )
    ) {

      await safeExecuteAsync(
        fetchAMFISIPData,
        null
      );
    }

		{

		  await safeExecuteAsync(
			fetchFundamentalData,
			null
		  );
		}

	  } finally {

		macroRefreshRunning = false;
	  }
	}

	setInterval(
	  refreshEquityMacroCaches,
	  15 * 60 * 1000
	);

	// =====================================
	// CACHE EXPIRY CLEANUP ENGINE
	// =====================================

	function cleanupExpiredCache() {

	  const now = Date.now();

	  const ttlMap = {

		"nse:index":
		  CACHE_TTL_EQUITY * 4,

		"equity:macro":
		  CACHE_TTL_MACRO * 4,

		"equity:flows":
		  CACHE_TTL_FLOW * 4,

		"equity:fundamental":
		  CACHE_TTL_FUNDAMENTAL * 4,

		"equity:global":
		  CACHE_TTL_MACRO * 4,

		"nse:sector":
		  CACHE_TTL_SECTOR * 4,

		"nse:debt":
		  CACHE_TTL_DEBT * 4
	  };

	  Object.keys(DSSCache.meta).forEach(key => {

		const ttl = ttlMap[key];

		if (!ttl) {
		  return;
		}

		const meta = DSSCache.meta[key];

		if (!meta?.ts) {
		  return;
		}

		const age =
		  now - meta.ts;

		if (age > ttl) {

		  delete DSSCache.store[key];
		  delete DSSCache.meta[key];

		  logger.warn(
			{ key },
			"Cache expired and removed"
		  );
		}
	  });
	}

	setInterval(
	  cleanupExpiredCache,
	  10 * 60 * 1000
	);


		// =====================================
		// LIVE SECTOR ROTATION DATA GENERATOR
		// =====================================

		async function buildSectorPayload() {

		  try {

			const heatmap = [];
			const rotation = [];
			const flows = [];
			const themes = [];

			const nseSectorMap = await fetchNSESectorData();
			if (!nseSectorMap) {
			  logger.warn("buildSectorPayload: fetchNSESectorData returned null");
			  return null;
			}
			for (const [sector, sectorData] of Object.entries(nseSectorMap)) {
			  const { returnPct, momentum } = sectorData;
			  const phase = classifySectorPhase(returnPct, momentum);
			  const signalObj = buildSectorSignal(returnPct);
			  const flowObj = buildSectorFlow(returnPct, momentum);
			  const themeObj = buildThemeSignal(sector, signalObj);
			  const bull = signalObj.sentiment === "bullish" ? true : signalObj.sentiment === "bearish" ? false : null;
			  heatmap.push({
				name: sector.replaceAll("_", " "),
				change: `${returnPct >= 0 ? "+" : ""}${returnPct}%`,
				narrative: `${signalObj.signal} · ${SECTOR_THEMES[sector] || "Sector rotation"}`,
				color: bull === true ? "#00e0a4" : bull === false ? "#ff5f87" : "#9fb3c8",
				border: bull === true ? "rgba(0,224,164,0.25)" : bull === false ? "rgba(255,95,135,0.25)" : "rgba(159,179,200,0.18)",
				glow: bull === true ? "rgba(0,224,164,0.06)" : bull === false ? "rgba(255,95,135,0.06)" : "rgba(159,179,200,0.04)"
			  });
			  rotation.push({ sector: sector.replaceAll("_", " "), phase, bull });
			  flows.push([sector.replaceAll("_", " "), `${flowObj.valueCr >= 0 ? "+" : "-"}₹${Math.abs(flowObj.valueCr)} Cr`, flowObj.direction === "inflow"]);
			  themes.push(themeObj);
			}

			if (heatmap.length < 4) {
			  logger.warn({ got: heatmap.length }, "buildSectorPayload: fewer than 4 sectors succeeded — payload suppressed");
			  return null;
			}
			if (heatmap.length < 8) {
			  logger.warn({ got: heatmap.length }, "buildSectorPayload: partial sector payload — persisting degraded cache");
			}

			return {
			  heatmap,
			  rotation,
			  flows,
			  themes
			};

		  } catch (err) {

			logger.error({
			  err: err.message
			}, "Sector payload build failed");

			return null;
		  }
		}

		// =====================================
		// LIVE SECTOR CACHE REFRESH
		// =====================================

		// =====================================
	// LIVE DEBT PAYLOAD GENERATOR
	// =====================================
async function buildDebtPayload() {

	  try {

		const [
		  us10YData,
		  us2YData,
		  dxyData,
		  goldData,
		  macro
		] = [

		  await fetchYahooQuote(DEBT_SYMBOLS.US10Y),

		  await (async () => { await new Promise(r => setTimeout(r, 2000)); return fetchYahooQuote(DEBT_SYMBOLS.US2Y); })(),

		  await (async () => { await new Promise(r => setTimeout(r, 4000)); return fetchYahooQuote(DEBT_SYMBOLS.DXY); })(),

		  await (async () => { await new Promise(r => setTimeout(r, 6000)); return fetchYahooQuote(DEBT_SYMBOLS.GOLD); })(),

		  await fetchIndiaMacro()
		];

		logger.info({ us10Y: !!us10YData, us2Y: !!us2YData, dxy: !!dxyData, gold: !!goldData, macro: !!macro }, "buildDebtPayload: data availability check");
		// Only us10Y and macro are required — dxy/gold degrade gracefully
		if (
		  !us10YData ||
		  !macro
		) {
		  logger.warn({ us10Y: !!us10YData, dxy: !!dxyData, macro: !!macro }, "buildDebtPayload: null guard hit — returning null");
		  return null;
		}

		const yieldCurve =
		  buildYieldCurve(macro);

		const realRate =
		  computeRealRate(
			macro.repoRate,
			macro.cpi
		  );

		const rateSignals =
		  buildRateSignals({
			realRate,
			us10Y: us10YData.current,
			dxy: dxyData?.current || null
		  });

		const recommendation =
		  buildDebtRecommendation({
			repoRate: macro.repoRate,
			cpi: macro.cpi,
			us10Y: us10YData.current
		  });

		return {

		  overview: {

			repoRate: macro.repoRate,

			cpi: macro.cpi,

			realRate,

			us10Y:
			  us10YData.current,

			us2Y:
			  us2YData?.current || null,

			dxy:
			  dxyData.current,

			gold:
			  goldData?.current || null
		  },

		  yieldCurve,

		  rateSignals,

		  recommendation,

		  gsecLive: !!(macro.gsecLive),

		  global: [

			{
			  factor: "US 10Y",
			  value: us10YData.current,
			  change: us10YData.changePct
			},

			{
			  factor: "DXY",
			  value: dxyData.current,
			  change: dxyData.changePct
			},

			{
			  factor: "Gold",
			  value: goldData?.current || null,
			  change: goldData?.changePct || 0
			}
		  ]
		};

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "Debt payload build failed");

		return null;
	  }
	}

		let sectorCacheRunning = false;
		async function refreshSectorCache() {
		  if (sectorCacheRunning) {
			logger.warn("refreshSectorCache skipped — previous run still in progress");
			return;
		  }
		  sectorCacheRunning = true;

		  try {

			const payload =
			  await buildSectorPayload();

			if (!payload) {
			  sectorCacheRunning = false;
			  return;
			}

			DSSCache.set(
	  "nse:sector",
	  payload
	);

			// Persist to disk so cache survives PM2 reloads
			try {
			  require("fs").writeFileSync(
				"/home/ubuntu/dss-system/data/sector-cache.json",
				JSON.stringify({ payload, ts: Date.now() })
			  );
			} catch(e) { logger.warn({ err: e.message }, "sector-cache.json write failed"); }
			// Persist to disk so cache survives PM2 reloads
			try {
			  require("fs").writeFileSync(
				"/home/ubuntu/dss-system/data/sector-cache.json",
				JSON.stringify({ payload, ts: Date.now() })
			  );
			} catch(e) { logger.warn({ err: e.message }, "sector-cache.json write failed"); }
			logger.info({
			  sectors: payload.heatmap.length
			}, "Sector cache updated");

		  } catch (err) {

			logger.error({
			  err: err.message
			}, "Sector refresh failed");
		  } finally {
			sectorCacheRunning = false;
		  }
		}

		
		// =====================================
	// LIVE DEBT CACHE REFRESH
	// =====================================

	async function refreshDebtCache() {
	  logger.info("refreshDebtCache: triggered");

	  // Retry up to 3 times with 2min gap — Yahoo 429s clear within ~2min
	  let payload = null;
	  for (let attempt = 1; attempt <= 3; attempt++) {
		if (attempt > 1) {
		  logger.info({ attempt }, "refreshDebtCache: retrying after 2min Yahoo cooldown");
		  await new Promise(r => setTimeout(r, 120000));
		}
		try {
		  payload = await Promise.race([
			buildDebtPayload(),
			new Promise((_, reject) => setTimeout(() => reject(new Error("buildDebtPayload timeout 45s")), 45000))
		  ]);
		} catch(e) {
		  logger.warn({ attempt, err: e.message }, "refreshDebtCache: attempt failed");
		}
		if (payload) break;
		logger.warn({ attempt }, "refreshDebtCache: payload null, will retry if attempts remain");
	  }

	  try {
		if (!payload) {
		  logger.error("refreshDebtCache: all attempts exhausted — debt cache not updated");
		  return;
		}

		DSSCache.set(
	  "nse:debt",
	  payload
	);

		// Persist to disk so cache survives PM2 reloads
		try {
		  require("fs").writeFileSync(
			"/home/ubuntu/dss-system/data/debt-cache.json",
			JSON.stringify({ payload, ts: Date.now() })
		  );
		} catch(e) { logger.warn({ err: e.message }, "debt-cache.json write failed"); }

		logger.info({
		  source: "debt-engine"
		}, "Debt cache updated");

	  } catch (err) {

		logger.error({
		  err: err.message
		}, "Debt refresh failed");
	  }
	}

	setInterval(
	  refreshDebtCache,
	  20 * 60 * 1000
	);


	// Trigger first debt refresh after 5min (staggered after sector job to avoid Yahoo 429 collision)
	setTimeout(() => refreshDebtCache(), 300000);


		
	  app.get("/api/v1/debt",
	  async (req, res) => {

		try {

		  const cached =
	  DSSCache.get("nse:debt");

	if (!cached) {
				// Disk fallback before giving up
				try {
				  const _disk = JSON.parse(require('fs').readFileSync('/home/ubuntu/dss-system/data/debt-cache.json', 'utf8'));
				  if (_disk && _disk.payload && (Date.now() - _disk.ts) < 3600000) {
				    DSSCache.set('nse:debt', _disk.payload);
				    logger.info({ ageMin: Math.round((Date.now() - _disk.ts) / 60000) }, 'Debt cache restored from disk at request time');
				    return res.json({ status: 'OK', dataStatus: 'stale', timestamp: Date.now(), data: _disk.payload });
				  }
				} catch(e) { /* no disk cache available */ }
				return res.status(503).json({
				  status: "ERROR",
				  dataStatus: "unavailable"
				});
		  }

		  const meta =
	  DSSCache.meta["nse:debt"];

	const age =
	  meta
		? Date.now() - meta.ts
		: Infinity;

		  let dataStatus = "live";

		  if (age > CACHE_TTL_DEBT * 30) { // 30min before marking unavailable
			dataStatus = "unavailable";
		  } else if (age > CACHE_TTL_DEBT) {
			dataStatus = "stale";
		  }

		  // DEF-004: hardcoded G-Sec yields must not claim live
		  if (cached.gsecLive === false && dataStatus === "live") {
			dataStatus = "stale";
		  }

		  if (dataStatus === "unavailable") {

			return res.status(503).json({
			  status: "ERROR",
			  dataStatus: "unavailable"
			});
		  }

		  return res.json({

			status: "OK",

			timestamp: Date.now(),

			dataStatus,

			data: cached
		  });

		} catch (err) {

		  logger.error({
			err: err.message
		  }, "Debt API failed");

		  return res.status(500).json({
			status: "ERROR",
			dataStatus: "unavailable"
		  });
		}
	  }
	);
		  
		  app.get("/api/v1/sectors",
	  async (req, res) => {

			try {

			  const cached =
	  DSSCache.get("nse:sector");

	if (!cached) {
				// Disk fallback before giving up
				try {
				  const _disk = JSON.parse(require("fs").readFileSync("/home/ubuntu/dss-system/data/sector-cache.json", "utf8"));
				  if (_disk && _disk.payload && (Date.now() - _disk.ts) < 21600000) {
					DSSCache.set("nse:sector", _disk.payload);
					logger.info({ ageMin: Math.round((Date.now() - _disk.ts) / 60000) }, "Sector cache restored from disk at request time");
					return res.json({ status: "OK", dataStatus: "stale", timestamp: Date.now(), data: _disk.payload });
				  }
				} catch(e) { /* no disk cache available */ }
				return res.status(503).json({
				  status: "ERROR",
				  dataStatus: "unavailable"
				});
			  }

			  const meta =
	  DSSCache.meta["nse:sector"];

	const age =
	  meta
		? Date.now() - meta.ts
		: Infinity;

			  let dataStatus = "live";

	if (age > CACHE_TTL_SECTOR * 4) {
	  dataStatus = "unavailable";
	} else if (age > CACHE_TTL_SECTOR) {
	  dataStatus = "stale";
	}

	if (dataStatus === "unavailable") {

	  return res.status(503).json({
		status: "ERROR",
		dataStatus: "unavailable"
	  });
	}

			  return res.json({
				status: "OK",
				timestamp: Date.now(),
				dataStatus,
				data: cached
			  });

			} catch (err) {

			  logger.error({
				err: err.message
			  }, "Sector API failed");

			  return res.status(500).json({
				status: "ERROR",
				dataStatus: "unavailable"
			  });
			}
		  }
		);

		async function fetchNiftyData() {
		  try {
			if (YAHOO_PAUSED) { return null; }
			const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEI?range=5d&interval=5m";
			const data = await safeFetch(url);

			const result = data?.chart?.result?.[0];

			return {
			  prices: result?.indicators?.quote?.[0]?.close?.filter(Boolean),
			  open: result?.indicators?.quote?.[0]?.open?.[0],
			  current: result?.meta?.regularMarketPrice
			};

		  } catch (err) {
			logger.error({
			  error: err.message,
			  stack: err.stack
			}, "fetchNiftyData failed");

			return null;
		  }
		}

		function interpretCrude(price, last) {
		  if (!price) return last;
		  return price > 80 ? "rising" : "falling";
		}

		function interpretVix(vix, last) {
		  if (!vix) return last;
		  return vix > 18 ? "high" : "low";
		}

		async function autoFillInputs(body) {
		  body = body || {};

		  const crudePrice = await fetchCrude();
		  const vixValue = await fetchVix();

		  const crudeSignal = interpretCrude(crudePrice, lastCrudeSignal);
		  const vixSignal = interpretVix(vixValue, lastVixSignal);

		  if (crudeSignal) lastCrudeSignal = crudeSignal;
		  if (vixSignal) lastVixSignal = vixSignal;

		 return {
		  rates: body.rates ?? DEFAULT_SIGNALS.rates,
		crude: crudeSignal ?? DEFAULT_SIGNALS.crude,
		fii: body.fii ?? DEFAULT_SIGNALS.fii,
		liquidity: body.liquidity ?? DEFAULT_SIGNALS.liquidity,
		  vix: body.vix ?? vixSignal ?? DEFAULT_SIGNALS.vix,  
		trend: body.autoTrend
		  ? "bullish"
		  : body.trend ?? DEFAULT_SIGNALS.trend,

		  // ✅ ADD THESE 3 LINES (D25 SAFETY)
		  momentum: body.momentum ?? DEFAULT_SIGNALS.momentum,
		strength: body.strength ?? DEFAULT_SIGNALS.strength,
		breadth: body.breadth ?? DEFAULT_SIGNALS.breadth,

		  liveData: {
			crudePrice,
			vixValue
		  }
		};
		}

		function getAdaptiveMultiplier(signal, regime) {
		  let m = 1;

		  if (regime.includes("RISK ON")) {
			if (signal === "trend" || signal === "fii") m = 1.1;
			if (signal === "vix") m = 0.95;
		  }

		  if (regime.includes("RISK OFF")) {
			if (signal === "vix" || signal === "liquidity") m = 1.1;
			if (signal === "trend") m = 0.9;
		  }

		  return m;
		}

		function getAdaptiveWeight(signal, baseWeight) {

	  const reliability =
		signalReliability?.[signal] ?? 1;

	  return baseWeight * reliability;
	}

////////////////////////////////////////////////////////
// SECTION-23 : BRAIN SIGNAL ENGINE
// buildSignals / getRegime / getConfidence / getMarketQuality
// computeSignalIntelligence / getDynamicSectorAllocation
// SIGNAL_REGISTRY weights / adaptive multipliers
// Risk pipeline: updateDrawdown / evaluateKillSwitch / applyRiskCaps
////////////////////////////////////////////////////////

		function buildSignals(inputs, regime = "NEUTRAL") {

	  const signals = {};

	  let composite = 0;

		  for (const key in SIGNAL_REGISTRY) {
			const config = SIGNAL_REGISTRY[key];
			const baseWeight = config.weight;
			const adaptiveWeight = getAdaptiveWeight(key, baseWeight);
			const weight = adaptiveWeight * getAdaptiveMultiplier(key, regime);
			const rawScore = config.scorer(inputs[key]);
		const reliability = signalReliability[key] || 1;
		const score = rawScore * reliability;

			signals[key] = {
			  value: inputs[key],
			  score,
			  weight,
			  baseWeight,
			  reliability: signalReliability[key],
			  strength: Math.abs(score) === 1 ? "strong" : "neutral"
			};

			composite += score * weight;
		  }

		  const normalizedScore = Math.round((composite + 1) * 50); 
		return { signals, compositeScore: normalizedScore };
		}
		function getRegime(score) {
		  if (score >= 70) return "STRONG RISK ON";
		  if (score >= 55) return "RISK ON";
		  if (score >= 45) return "NEUTRAL";
		  if (score >= 30) return "RISK OFF";
		  return "STRONG RISK OFF";
		}

		function getConfidence(signals) {
		  const positives = Object.values(signals).filter(s => s.score === 1).length;
		  return Math.round((positives / Object.keys(signals).length) * 100);
		}

		function getMarketQuality(confidence) {
		  if (confidence >= 70) return "STRONG";
		  if (confidence >= 50) return "MODERATE";
		  return "WEAK";
		}

		function getSectorAllocation(regime) {
		  if (regime === "STRONG RISK ON") return { NBFC: 35, PSU_BANK: 35, IT: 20, FMCG: 10 };
		  if (regime === "RISK ON") return { NBFC: 30, PSU_BANK: 30, IT: 25, FMCG: 15 };
		  if (regime === "RISK OFF") return { NBFC: 15, PSU_BANK: 15, IT: 30, FMCG: 40 };
		  return { NBFC: 20, PSU_BANK: 20, IT: 30, FMCG: 30 };
		}
		/* ==============================
		   SECTOR INTELLIGENCE ENGINE (PHASE 2)
		   ADDITIVE — NO REGRESSION
		============================== */

		function getDynamicSectorAllocation(regime, signals, intelligence) {
		  // Start with base allocation (existing logic)
		  let base = getSectorAllocation(regime);

		  let adjusted = { ...base };

		  // --------------------------
		  // SIGNAL-DRIVEN ADJUSTMENTS
		  // --------------------------

		  // Liquidity + FII → Boost NBFC / PSU_BANK
		  if (signals.liquidity.score === 1 && signals.fii.score === 1) {
			adjusted.NBFC += 5;
			adjusted.PSU_BANK += 5;
		  }

		  // High VIX → Defensive tilt
		  if (signals.vix.score === -1) {
			adjusted.FMCG += 10;
			adjusted.NBFC -= 5;
			adjusted.PSU_BANK -= 5;
		  }

		  // Crude rising → hurt consumption / banks slightly
		  if (signals.crude.score === -1) {
			adjusted.IT += 5;
			adjusted.NBFC -= 3;
			adjusted.PSU_BANK -= 2;
		  }

		  // Weak trend → move defensive
		  if (signals.trend.score === -1) {
			adjusted.FMCG += 5;
			adjusted.IT += 5;
		  }

		  // --------------------------
		  // CONFLICT ADJUSTMENT
		  // --------------------------

		  if (intelligence.conflict) {
			adjusted.FMCG += 5;
			adjusted.NBFC -= 3;
			adjusted.PSU_BANK -= 2;
		  }

		  // --------------------------
		  // NORMALIZATION (CRITICAL)
		  // --------------------------

		  const total = Object.values(adjusted).reduce((a, b) => a + b, 0);

		Object.keys(adjusted).forEach(k => {
		  adjusted[k] = Math.max(0, Math.round((adjusted[k] / total) * 100));
		});

		// ✅ FIX: Ensure total = 100 exactly
		let totalAdjusted = Object.values(adjusted).reduce((a, b) => a + b, 0);

		if (totalAdjusted !== 100) {
		  const maxKey = Object.keys(adjusted).reduce((a, b) =>
			adjusted[a] > adjusted[b] ? a : b
		  );

		  adjusted[maxKey] += (100 - totalAdjusted);
		}

		return adjusted;
		}
		function computeSignalIntelligence(signals) {
		  let weightedScore = 0, positive = 0, negative = 0;

		  for (const key in signals) {
			const s = signals[key];
			const intensity = SIGNAL_REGISTRY[key].intensity(s.value);
			weightedScore += s.score * s.weight * intensity * 100;

			if (s.score > 0) positive++;
			else if (s.score < 0) negative++;
		  }

		  const total = positive + negative;
		  const signalBalance = total ? (positive / total) * 100 : 50;

		  return {
			conviction: Math.round(Math.abs(weightedScore)),
			signalBalance: Math.round(signalBalance),
			conflict: (negative >= 1 && signalBalance < 70),
			positiveSignals: positive,
			negativeSignals: negative
		  };
		}

		function buildStrategy(regime, confidence, marketQuality, sectorAllocation) {
		  let stance = "NEUTRAL", positionSizing = "MEDIUM", riskManagement = [];
		  let preferredSectors = Object.keys(sectorAllocation), avoid = [];

		  if (regime === "STRONG RISK ON") {
			stance = "AGGRESSIVE LONG";
			positionSizing = confidence > 75 ? "HIGH" : "MEDIUM";
			avoid = ["FMCG"];
		  }

		  if (regime === "RISK ON") stance = "LONG BIAS";

		  if (regime === "RISK OFF") {
			stance = "DEFENSIVE";
			positionSizing = "LOW";
			avoid = ["NBFC", "PSU_BANK"];
		  }

		  if (regime === "STRONG RISK OFF") {
			stance = "RISK OFF / CAPITAL PROTECTION";
			positionSizing = "VERY LOW";
			avoid = ["NBFC", "PSU_BANK"];
		  }

		  if (marketQuality === "WEAK") {
			positionSizing = "LOW";
			riskManagement.push("Reduce exposure due to weak alignment");
		  }

		  if (confidence < 50) {
			riskManagement.push("Avoid aggressive trades");
		  }

		  return { stance, positionSizing, preferredSectors, avoid, riskManagement };
		}


		// ==============================
		// DSS vNext — MARKET VIEW
		// ==============================
		function buildMarketView({ regime, compositeScore, confidence, marketQuality, signals, intelligence }) {
		  const positive = [];
		  const negative = [];

		  for (const key in signals) {
			if (signals[key].score === 1) positive.push(key);
			else if (signals[key].score === -1) negative.push(key);
		  }

		  return {
			regime,
			marketTone: interpretMarketTone(compositeScore),
			compositeScore,
			confidence,
			marketQuality,
			drivers: {
			  positive,
			  negative
			},
			signalAlignment: intelligence.conflict ? "LOW" : "HIGH",
			stability: "STABLE"
		  };
		  }

		// ==============================
		// PORTFOLIO GUIDANCE (NO TRADING)
		// ==============================
		function buildPortfolioGuidance({ regime, confidence }) {
		  let stance = "NEUTRAL";
		  let equityExposure = "NEUTRAL";
		  let allocation = "40–60%";
		  let actionBias = "Hold";

		  if (regime === "STRONG RISK ON") {
			stance = "PRO-RISK";
			equityExposure = "OVERWEIGHT";
			allocation = "60–75%";
			actionBias = "Increase exposure gradually";
		  }

		  if (regime === "RISK OFF") {
			stance = "DEFENSIVE";
			equityExposure = "UNDERWEIGHT";
			allocation = "20–40%";
			actionBias = "Reduce exposure";
		  }

		  return {
			stance,
			equityExposure,
			suggestedAllocationRange: allocation,
			actionBias,
			convictionLevel: confidence >= 60 ? "MODERATE" : "LOW"
		  };
		}

		// ==============================
		// RISK DASHBOARD
		// ==============================
		function buildRiskDashboard({ risk, signals, intelligence }) {
		  return {
			riskLevel: risk.riskLevel,
			killSwitch: risk.killSwitch,
			macroRisks: Object.keys(signals).filter(k => signals[k].score === -1),
			signalConflict: intelligence.conflict,
			drawdownRisk: risk.drawdown > 10 ? "ELEVATED" : "LOW",
			volatilityRegime: signals.vix?.value || "unknown",
			liquidityCondition: signals.liquidity?.value || "unknown"
		  };
		}
		  
		function updateSignalReliability(signals) {
		  return; // Disabled — no trading feedback loop
		}
		// Confidence smoothing
		const CONFIDENCE_SMOOTHING = 0.7;

		function smoothAllocation(prev, next) {
		  const MAX_CHANGE = 15; // % per cycle
		  const diff = next - prev;

		  if (Math.abs(diff) > MAX_CHANGE) {
			return prev + Math.sign(diff) * MAX_CHANGE;
		  }

		  return next;
		}

		function smoothConfidence(prev, current) {
		  return Math.round(prev * CONFIDENCE_SMOOTHING + current * (1 - CONFIDENCE_SMOOTHING));
		}

		// Market quality cap (soft guardrail, not replacing risk engine)
		function applyMarketQualityCap(allocation, quality) {
		  if (quality === "WEAK") return Math.min(allocation, 40);
		  if (quality === "MODERATE") return Math.min(allocation, 75);
		  return allocation;
		}

		// Regime floor
		function applyAllocationFloor(allocation, regime) {
		  if (regime.includes("RISK ON")) return Math.max(allocation, 40);
		  if (regime.includes("RISK OFF")) return Math.min(allocation, 30);
		  return allocation;
		}

		// Cooldown logic
		const COOLDOWN_PERIOD = 2;

		function isCooldownActive(memory) {
		  if (!memory.lastRegimeChangeTs) return false;
		  return (memory.cyclesSinceChange || 0) < COOLDOWN_PERIOD;
		}

		function getAdaptiveWeight(signalKey, baseWeight) {
		  const reliability = signalReliability[signalKey] || 1;

		  // Bound between 0.8x and 1.2x
		  const adaptiveFactor = Math.max(0.8, Math.min(1.2, reliability));

		  return baseWeight * adaptiveFactor;
		}


		// ==============================
		// D27 RISK ENGINE
		// ==============================

		function updateDrawdown(portfolioState) {
		  const pnl = portfolioState.totalPnL;

		  if (pnl > riskState.peakPnL) {
			riskState.peakPnL = pnl;
		  }

		  const drawdown = riskState.peakPnL !== 0
		  ? ((riskState.peakPnL - pnl) / Math.abs(riskState.peakPnL)) * 100
		  : 0;
		  riskState.currentDrawdown = drawdown;

		  return drawdown;
		}

		// Reset logic (IMPORTANT)


		function evaluateKillSwitch(drawdown, signals, regime, compositeScore) {
		  riskState.killSwitch = false;

		  const negativeSignals = Object.values(signals).filter(s => s.score === -1).length;

		  // 🚨 TRUE CRASH CONDITION ONLY
		  if (
			compositeScore < 25 &&
			negativeSignals >= 6 &&
			signals.vix?.score === -1
		  ) {
			riskState.killSwitch = true;
		  }

		  // Extreme drawdown protection (secondary)
		  if (drawdown >= 20) {
			riskState.killSwitch = true;
		  }

		  if (riskState.killSwitch) {
			riskState.lastTrigger = Date.now();
		  }

		  return riskState.killSwitch;
		}


		function applyRiskCaps(allocation, confidence, marketQuality, drawdown) {
		  let cap = 90;

		  if (confidence < 65) cap = Math.min(cap, 70);
		  if (confidence < 55) cap = Math.min(cap, 60);

		  if (marketQuality === "WEAK") cap = Math.min(cap, 30);

		  if (drawdown >= 10) cap = Math.min(cap, 50);
		  if (drawdown >= 15) cap = Math.min(cap, 30);
		  if (drawdown >= 20) cap = Math.min(cap, 10);

		  return Math.min(allocation, cap);
		}

		function applyVolatilityAdjustment(allocation, signals) {
		  if (signals.vix?.score === -1) {
			return Math.round(allocation * 0.7);
		  }
		  return allocation;
		}

		function computeRisk(portfolio) {
		  let exposure = portfolio.activePositions.reduce((sum, p) => sum + p.allocation, 0);

		  let riskLevel = "LOW";
		  if (exposure > 70) riskLevel = "HIGH";
		  else if (exposure > 40) riskLevel = "MEDIUM";

		  return { exposure: exposure + "%", riskLevel };
		}
		/* ==============================
		   INTERPRETATION ENGINE (PHASE 1)
		   ADDITIVE — NO REGRESSION
		============================== */

		/* ==============================
		   ADVISORY ENGINE (PHASE 3)
		   ADDITIVE — NO REGRESSION
		============================== */

		/* ==============================
		   NARRATIVE ENGINE (PHASE 4)
		   ADDITIVE — NO REGRESSION
		============================== */

////////////////////////////////////////////////////////
// SECTION-24 : BRAIN NARRATIVE ENGINE
// buildNarrative / buildAdvisory / interpretationEngine
// buildMarketView / buildPortfolioGuidance / buildRiskDashboard
// buildBrainResponse / buildSignalsResponse
// buildSectorView / buildSignalNarrative / generateSummary
////////////////////////////////////////////////////////

		function buildNarrative({ regime, interpretation, advisory }) {
		  let headline = "";
		  let marketSummary = "";
		  let sectorNarrative = "";
		  let advisoryNarrative = "";
		  let closingNote = "";

		  // --------------------------
		  // HEADLINE
		  // --------------------------

		  if (regime.includes("RISK ON")) {
			headline = "Markets remain supportive with a positive bias";
		  } else if (regime.includes("RISK OFF")) {
			headline = "Markets are turning cautious with defensive undertones";
		  } else {
			headline = "Markets are in a transitional phase";
		  }

		  // --------------------------
		  // MARKET SUMMARY
		  // --------------------------

		  marketSummary = `${interpretation.summary.trim()} ${interpretation.signalNarrative.trim()}`;

		  // --------------------------
		  // SECTOR NARRATIVE
		  // --------------------------

		  sectorNarrative = interpretation.sectorView;

		  // --------------------------
		  // ADVISORY NARRATIVE
		  // --------------------------

		advisoryNarrative =
		  "Current stance suggests " + advisory.stance.toLowerCase() +
		  " positioning. Investors may consider " + advisory.action.toLowerCase() +
		  ". " + advisory.allocationGuidance +
		  ". " + advisory.riskNote + ".";

		  // --------------------------
		  // CLOSING NOTE
		  // --------------------------

		closingNote = advisory.clientSuitability + ".";

		  return {
			headline,
			marketSummary,
			sectorNarrative,
			advisoryNarrative,
			closingNote
		  };
		}

		function buildAdvisory({
		  regime,
		  confidence,
		  marketQuality,
		  intelligence,
		  sectorAllocation,
		  risk
		}) {
		  let stance = "Neutral";
		  let action = "Hold / Wait";
		  let allocationGuidance = "";
		  let sectorFocus = "";
		  let riskNote = "";
		  let clientSuitability = "";

		  // --------------------------
		  // CORE STANCE
		  // --------------------------

		  if (regime === "STRONG RISK ON") {
			stance = "Aggressive Growth";
			action = "Increase equity exposure";
		  } else if (regime === "RISK ON") {
			stance = "Growth Bias";
			action = "Accumulate on dips";
		  } else if (regime === "RISK OFF") {
			stance = "Defensive";
			action = "Reduce equity exposure";
		  } else if (regime === "STRONG RISK OFF") {
			stance = "Capital Preservation";
			action = "Minimize risk exposure";
		  }

		  // --------------------------
		  // ALLOCATION GUIDANCE
		  // --------------------------

		  if (confidence >= 75) {
			allocationGuidance = "High conviction environment — higher allocation justified";
		  } else if (confidence >= 50) {
			allocationGuidance = "Moderate conviction — staggered allocation recommended";
		  } else {
			allocationGuidance = "Low conviction — maintain low exposure";
		  }

		  // --------------------------
		  // SECTOR FOCUS
		  // --------------------------

		  const sortedSectors = Object.entries(sectorAllocation)
			.sort((a, b) => b[1] - a[1])
			.map(s => s[0]);

		  sectorFocus = "Focus on: " + sortedSectors.slice(0, 2).join(", ");

		  // --------------------------
		  // RISK NOTE (VERY IMPORTANT)
		  // --------------------------

		  if (intelligence.conflict) {
			riskNote = "Conflicting signals — avoid aggressive positioning";
		  } else if (marketQuality === "WEAK") {
			riskNote = "Weak participation — rallies may not sustain";
		  } else if (risk.riskLevel === "HIGH") {
			riskNote = "High portfolio exposure — manage downside risk";
		  } else {
			riskNote = "Risk environment stable";
		  }

		// --------------------------
		// CLIENT SUITABILITY
		// --------------------------

		if (regime.includes("RISK ON")) {
		  clientSuitability = "Suitable for moderate to aggressive investors";
		} else if (regime.includes("RISK OFF")) {
		  clientSuitability = "Suitable for conservative investors";
		} else {
		  clientSuitability = "Suitable for balanced portfolios";
		}

		  return {
			stance,
			action,
			allocationGuidance,
			sectorFocus,
			riskNote,
			clientSuitability
		  };
		}

		function interpretRegime(regime) {
		  const map = {
			"STRONG RISK ON": "Broad-based bullish environment",
			"RISK ON": "Positive market conditions with selective strength",
			"NEUTRAL": "Indecisive or transitioning market phase",
			"RISK OFF": "Defensive environment with downside risks",
			"STRONG RISK OFF": "High-risk environment prioritizing capital preservation"
		  };
		  return map[regime] || "Unknown regime";
		}

		function interpretMarketTone(score) {
		  if (score >= 70) return "Strong bullish momentum";
		  if (score >= 55) return "Moderately positive market tone";
		  if (score >= 45) return "Neutral and range-bound conditions";
		  if (score >= 30) return "Weak market with downside bias";
		  return "Strong bearish conditions";
		}

		function interpretRisk(vixSignal, conflict, marketQuality) {
		  if (conflict) return "Elevated uncertainty due to conflicting signals";
		  if (vixSignal > 0 && marketQuality === "STRONG") return "Low risk environment";
		  if (marketQuality === "WEAK") return "Fragile market conditions";
		  return "Moderate risk environment";
		}

		function interpretParticipation(confidence) {
		  if (confidence >= 70) return "Broad market participation";
		  if (confidence >= 50) return "moderate participation";
		  return "Weak participation";
		}

		function interpretConviction(conviction) {
		  if (conviction >= 70) return "Strong conviction in trend";
		  if (conviction >= 50) return "Moderate conviction";
		  return "Low conviction / uncertain trend";
		}

		function interpretConflict(conflict) {
		  return conflict
			? "Market signals show internal conflict"
			: "Signals are well aligned";
		}

		function buildSignalNarrative(signals) {
		  const positives = [];
		  const negatives = [];

		  for (const key in signals) {
			if (signals[key].score === 1) positives.push(key);
			else if (signals[key].score === -1) negatives.push(key);
		  }

		  return `Positive drivers: ${positives.join(", ") || "None"}. Risks: ${negatives.join(", ") || "None"}.`;
		}
		function buildSectorView(signals, regime) {
		  const views = [];

		  if (regime.includes("RISK OFF")) {
			views.push("Defensive sectors likely to outperform");
		  }

		  if (signals.liquidity.score === 1 && !regime.includes("RISK OFF")) {
			views.push("Liquidity supports financial sectors");
		  }

		  if (signals.fii.score === 1 && !regime.includes("RISK OFF")) {
			views.push("FII flows favor equities");
		  }

		  if (signals.vix.score === -1) {
			views.push("High volatility favors defensive sectors");
		  }

		  if (signals.crude.score === -1) {
			views.push("Rising crude may pressure consumption");
		  }

		  return views.join(". ") || "Sector signals are neutral";
		}
		function generateSummary({ tone, participation, risk }) {
		  return `${tone} with ${participation}. ${risk}.`;
		}
		function interpretationEngine(data) {
		  const {
			regime,
			compositeScore,
			signals,
			confidence,
			marketQuality,
			conviction,
			conflict
		  } = data;

		  const regimeMeaning = interpretRegime(regime);
		  const tone = interpretMarketTone(compositeScore);
		  const risk = interpretRisk(signals?.vix?.score || 0, conflict, marketQuality);
		  const participation = interpretParticipation(confidence);
		  const convictionInsight = interpretConviction(conviction || 0);
		  const conflictInsight = interpretConflict(conflict);
		  const signalNarrative = buildSignalNarrative(signals);

		  const summary = generateSummary({
			tone,
			participation,
			risk
		  });

		return {
		  regimeMeaning,
		  marketTone: tone,
		  signalNarrative,
		  riskInterpretation: risk,
		  participationQuality: participation,
		  convictionInsight,
		  conflictInsight,
		  sectorView: buildSectorView(signals, regime),   // ✅ ADD THIS LINE
		  summary
		};
		}
		/* ==============================
		   V7 — ANALYTICS ENGINE
		============================== */

		function logDecision(snapshot) {
		  MEMORY.decisions.push(snapshot);
		  if (MEMORY.decisions.length > 100) MEMORY.decisions.shift();
		}

		function detectRegimeTransition(currentRegime, compositeScore) {
		  // 🔒 HARD GUARD (non-negotiable)
		  if (!MEMORY || typeof MEMORY !== "object") {
			MEMORY = {};
		  }

		  if (!Array.isArray(MEMORY.regimeHistory)) {
			MEMORY.regimeHistory = [];
		  }

		  const history = MEMORY.regimeHistory;

		  const prev = history.length > 0 ? history[history.length - 1] : null;

		  let transition = null;

		  if (prev && prev.regime !== currentRegime) {
			transition = {
			  from: prev.regime,
			  to: currentRegime,
			  ts: Date.now()
			};
		  }

		  history.push({
			regime: currentRegime,
			score: compositeScore,
			ts: Date.now()
		  });

		  if (history.length > 200) history.shift();

		  return transition;
		}

		function computeDiff(currentSignals) {
		  const prev = (MEMORY.decisions || []).slice(-1)[0];
		  if (!prev) return null;

		  const diff = [];

		  for (let key in currentSignals) {
			const prevVal = prev.signals?.[key]?.value;
			const currVal = currentSignals[key].value;

			if (prevVal !== currVal) {
			  diff.push({
				signal: key,
				from: prevVal,
				to: currVal
			  });
			}
		  }

		  return diff;
		}

		/* =========================
		   CALLBACK (BREEZE SESSION — FIXED ABSOLUTE PATH)
		========================= */

		/* =========================
		   API
		========================= */
////////////////////////////////////////////////////////
// SECTION-26 : API ROUTES
// GET  /health              — basic uptime check
// GET  /api/v1/equity       — Equity Signals tab
// GET  /api/v1/sectors      — Sector Rotation tab
// GET  /api/v1/debt         — Debt tab
// GET  /api/v1/signals      — legacy signals API
// GET  /api/v1/brain        — legacy brain API
// POST /brain-auto          — Overview tab intelligence core
// GET  /api/technical/*     — technicalRoutes (external module)
////////////////////////////////////////////////////////

		app.get("/health", (req, res) => {
		  res.json({
			status: "OK",
			version: VERSION,
			release: RELEASE_TAG,
			uptime: process.uptime(),
			environment: process.env.NODE_ENV || "local",
			timestamp: Date.now()
		  });
		});

		// ===============================
		// DEF-007: /api/v1/health — Full observability endpoint (FSD Section 25.1)
		// ===============================
		app.get("/api/v1/health", (req, res) => {
		  try {
			const now = Date.now();

			// Source freshness — map cache keys to source names and TTLs
			const sourceMap = {
			  NSE: { keys: ["nse:index", "nse:optionchain", "equity:flows", "nse:sector"], ttl: 30000 },
			  RBI: { keys: ["equity:macro"], ttl: 3600000 },
			  Yahoo: { keys: ["equity:global", "nse:debt"], ttl: 120000 },
			  MOSPI: { keys: ["equity:fundamental"], ttl: 21600000 }
			};

			const sources = {};
			for (const [sourceName, { keys, ttl }] of Object.entries(sourceMap)) {
			  // Find most recent fetch across all keys for this source
			  let lastFetch = null;
			  for (const key of keys) {
				const meta = DSSCache.meta[key];
				if (meta && meta.ts && (!lastFetch || meta.ts > lastFetch)) {
				  lastFetch = meta.ts;
				}
			  }
			  const staleFor = lastFetch ? now - lastFetch : null;
			  let status = "UNKNOWN";
			  if (lastFetch === null) {
				status = "UNKNOWN";
			  } else if (staleFor <= ttl) {
				status = "OK";
			  } else if (staleFor <= ttl * 3) {
				status = "STALE";
			  } else {
				status = "DOWN";
			  }
			  sources[sourceName] = {
				status,
				lastFetch,
				staleFor
			  };
			}

			// Overall status derived from sources
			const sourceStatuses = Object.values(sources).map(s => s.status);
			let overallStatus = "OK";
			if (sourceStatuses.every(s => s === "DOWN" || s === "UNKNOWN")) {
			  overallStatus = "DOWN";
			} else if (sourceStatuses.some(s => s === "DOWN" || s === "STALE")) {
			  overallStatus = "DEGRADED";
			}

			// Alerts — simple rule-based
			const alerts = [];
			for (const [sourceName, info] of Object.entries(sources)) {
			  if (info.status === "DOWN") {
				alerts.push({ code: "FETCH_FAILURE_REPEATED", severity: "CRITICAL", source: sourceName });
			  } else if (info.status === "STALE") {
				alerts.push({ code: "STALE_THRESHOLD_BREACH", severity: "HIGH", source: sourceName });
			  }
			}

			return res.json({
			  status: overallStatus,
			  version: VERSION,
			  release: RELEASE_TAG,
			  uptime: Math.round(process.uptime()),
			  timestamp: now,
			  sources,
			  metrics: {
				note: "Rolling 1h metrics pending Phase F full implementation"
			  },
			  deprecated_endpoints: [],
			  alerts
			});
		  } catch (err) {
			return res.json({ status: "DOWN", timestamp: Date.now(), error: err.message });
		  }
		});

		// ===============================
		// DSS v6 — SIGNALS API
		// ===============================

		// =====================================
		// LIVE SECTOR ROTATION API
		// =====================================

		app.get("/api/v1/signals", async (req, res) => {
		  try {

			const body = {};

			const inputs = await safeExecuteAsync(
			  () => autoFillInputs(body),
			  DEFAULT_SIGNALS
			);

			const niftyData = await safeExecuteAsync(
			  fetchNiftyData,
			  null
			);

			let trendSignal = "neutral";
			let momentumSignal = "neutral";
			let strengthSignal = "neutral";
			let breadthSignal = 0.5;

			if (
			  niftyData &&
			  Array.isArray(niftyData.prices) &&
			  niftyData.prices.length >= 50
			) {

			  const ema20 = EMA(niftyData.prices.slice(-20), 20);
			  const ema50 = EMA(niftyData.prices.slice(-50), 50);

			  if (ema20 && ema50) {
				trendSignal = ema20 > ema50 ? "bullish" : "bearish";
			  }

			  if (ema20 && niftyData.current) {

				const momentumDiff =
				  (niftyData.current - ema20) / ema20;

				if (momentumDiff > 0.002) {
				  momentumSignal = "bullish";
				} else if (momentumDiff < -0.002) {
				  momentumSignal = "bearish";
				}
			  }

			  const openPrice =
				niftyData.open ||
				niftyData.prices?.[0] ||
				niftyData.current;

			  const strength =
				openPrice
				  ? (niftyData.current - openPrice) / openPrice
				  : 0;

			  if (strength > 0.002) {
				strengthSignal = "strong";
			  } else if (strength < -0.002) {
				strengthSignal = "weak";
			  }

			  breadthSignal =
				openPrice &&
				(niftyData.current - openPrice) > 0
				  ? 0.6
				  : 0.4;
			}

			inputs.trend = trendSignal;
			inputs.momentum = momentumSignal;
			inputs.strength = strengthSignal;
			inputs.breadth = breadthSignal;

			let { signals, compositeScore } =
			  buildSignals(inputs, "NEUTRAL");

			let regime = getRegime(compositeScore);

			({ signals, compositeScore } =
			  buildSignals(inputs, regime));

			const intelligence =
			  computeSignalIntelligence(signals);

			const confidence =
			  getConfidence(signals);

			const marketQuality =
			  getMarketQuality(confidence);

			const response =
			  buildSignalsResponse({
				regime,
				compositeScore,
				confidence,
				marketQuality,
				signals,
				intelligence
			  });

			return res.json({
			  status: "OK",
			  timestamp: Date.now(),
			  dataStatus: "live",
			  data: response
			});

		  } catch (err) {

			logger.error({
			  error: err.message,
			  stack: err.stack
			}, "SIGNALS_API_ERROR");

			return res.status(500).json({
			  status: "ERROR",
			  timestamp: Date.now(),
			  error: {
				code: "SIGNALS_API_FAILED",
				message: "Failed to generate signals response"
			  }
			});
		  }
		});

		// ===============================
		// DSS v6 — BRAIN API
		// ===============================
		app.get("/api/v1/brain", async (req, res) => {
		  try {

			const body = {};

			const inputs = await safeExecuteAsync(
			  () => autoFillInputs(body),
			  DEFAULT_SIGNALS
			);

			const niftyData = await safeExecuteAsync(
			  fetchNiftyData,
			  null
			);

			let trendSignal = "neutral";
			let momentumSignal = "neutral";
			let strengthSignal = "neutral";
			let breadthSignal = 0.5;

			if (
			  niftyData &&
			  Array.isArray(niftyData.prices) &&
			  niftyData.prices.length >= 50
			) {

			  const ema20 = EMA(niftyData.prices.slice(-20), 20);
			  const ema50 = EMA(niftyData.prices.slice(-50), 50);

			  if (ema20 && ema50) {
				trendSignal = ema20 > ema50 ? "bullish" : "bearish";
			  }

			  if (ema20 && niftyData.current) {
				const momentumDiff =
				  (niftyData.current - ema20) / ema20;

				if (momentumDiff > 0.002) {
				  momentumSignal = "bullish";
				} else if (momentumDiff < -0.002) {
				  momentumSignal = "bearish";
				}
			  }

			  const openPrice =
				niftyData.open ||
				niftyData.prices?.[0] ||
				niftyData.current;

			  const strength = openPrice
				? (niftyData.current - openPrice) / openPrice
				: 0;

			  if (strength > 0.002) {
				strengthSignal = "strong";
			  } else if (strength < -0.002) {
				strengthSignal = "weak";
			  }

			  breadthSignal =
				openPrice &&
				(niftyData.current - openPrice) > 0
				  ? 0.6
				  : 0.4;
			}

			inputs.trend = trendSignal;
			inputs.momentum = momentumSignal;
			inputs.strength = strengthSignal;
			inputs.breadth = breadthSignal;

			let { signals, compositeScore } =
			  buildSignals(inputs, "NEUTRAL");

			let regime = getRegime(compositeScore);

			({ signals, compositeScore } =
			  buildSignals(inputs, regime));

			const intelligence =
			  computeSignalIntelligence(signals);

			let confidence = getConfidence(signals);

			const marketQuality =
			  getMarketQuality(confidence);

			const risk = {
			  exposure: "50%",
			  riskLevel: "MEDIUM",
			  drawdown: riskState.currentDrawdown || 0,
			  killSwitch: riskState.killSwitch || false
			};

			const interpretation = interpretationEngine({
			  regime,
			  compositeScore,
			  signals,
			  confidence,
			  marketQuality,
			  conviction: intelligence.conviction,
			  conflict: intelligence.conflict
			});

			const advisory = buildAdvisory({
			  regime,
			  confidence,
			  marketQuality,
			  intelligence,
			  sectorAllocation:
				getSectorAllocation(regime),
			  risk
			});

			const brain = buildBrainResponse({
			  regime,
			  compositeScore,
			  confidence,
			  marketQuality,
			  signals,
			  intelligence,
			  risk,
			  interpretation,
			  advisory
			});

			return res.json({
			  status: "OK",
			  timestamp: Date.now(),
			  dataStatus: "live",
			  data: brain
			});

		  } catch (err) {

			logger.error({
			  error: err.message,
			  stack: err.stack
			}, "BRAIN_API_ERROR");

			return res.status(500).json({
			  status: "ERROR",
			  timestamp: Date.now(),
			  error: {
				code: "BRAIN_API_FAILED",
				message: "Failed to generate brain response"
			  }
			});
		  }
		});
		  
		app.post("/brain-auto", async (req, res) => {
		  try {
		// RESET FALLBACK STATE (per request)
		fallbackState = { crude: false, vix: false };
		const body = req.body || {};

		  const inputs = await safeExecuteAsync(
		  () => autoFillInputs(body),
		  DEFAULT_SIGNALS
		);
		// REMOVE THESE 2 LINES
		// if (!inputs.crude) inputs.crude = lastCrudeSignal;
		// if (!inputs.vix) inputs.vix = lastVixSignal;
		  // const liveData = await getLiveSignals();
		// 📊 Compute Trend from NIFTY
		const niftyData = await safeExecuteAsync(
		  fetchNiftyData,
		  null
		);

		let trendSignal = "neutral";
		let momentumSignal = "neutral";
		let strengthSignal = "neutral";
		let breadthSignal = 0.5;

		if (niftyData && Array.isArray(niftyData.prices) && niftyData.prices.length >= 50) {
		  if (!niftyData.current) {
			trendSignal = "neutral";
			momentumSignal = "neutral";
			strengthSignal = "neutral";
			breadthSignal = 0.5;
		  } else {
		  const ema20 = EMA(niftyData.prices.slice(-20), 20);
		  const ema50 = EMA(niftyData.prices.slice(-50), 50);

		  // ✅ TREND
		  if (ema20 && ema50) {
		  trendSignal = ema20 > ema50 ? "bullish" : "bearish";
		} else {
		  trendSignal = "neutral";
		}

		  // ✅ MOMENTUM
		  if (ema20 && ema20 !== 0) {
		  const momentumDiff = (niftyData.current - ema20) / ema20;

		  if (momentumDiff > 0.002) momentumSignal = "bullish";
		  else if (momentumDiff < -0.002) momentumSignal = "bearish";
		  else momentumSignal = "neutral";
		} else {
		  momentumSignal = "neutral";
		}

		  // ✅ STRENGTH
		  const openPrice = niftyData.open || niftyData.prices?.[0] || niftyData.current;

		const strength = openPrice
		  ? (niftyData.current - openPrice) / openPrice
		  : 0;

		 if (strength > 0.002) {
		  strengthSignal = "strong";
		} else if (strength < -0.002) {
		  strengthSignal = "weak";
		} else {
		  strengthSignal = "neutral";
		}

		  // ✅ BREADTH
			breadthSignal = openPrice
			? (niftyData.current - openPrice) > 0 ? 0.6 : 0.4
			: 0.5;
		  }
		}  // ✅ THIS LINE WAS MISSING



		// OVERRIDE INPUT
		// ✅ Respect manual input priority (CRITICAL FIX)
		inputs.trend = body.trend ?? trendSignal;
		inputs.momentum = body.momentum ?? momentumSignal;
		inputs.strength = body.strength ?? strengthSignal;
		inputs.breadth = body.breadth ?? breadthSignal;

		// EXISTING

		// inputs.crude = liveData.signals.crude;
		// inputs.vix = liveData.signals.vix;

		  let { signals, compositeScore } = safeExecute(
		  () => buildSignals(inputs, "NEUTRAL"),
		  { signals: {}, compositeScore: 50 }
		);

		let regime = getRegime(compositeScore);

		// ===== D27.1 REGIME TRACKING =====
		if (regime !== MEMORY.lastSnapshot?.regime) {
		  MEMORY.lastRegimeChangeTs = Date.now();
		  MEMORY.cyclesSinceChange = 0;
		} else {
		  MEMORY.cyclesSinceChange += 1;
		}

		// ==============================
		// REGIME STABILITY ENGINE
		// ==============================

		const prevRegime = MEMORY.regimeHistory?.slice(-1)[0]?.regime;

		if (prevRegime && prevRegime !== regime) {
		  const scoreDiff = Math.abs(compositeScore - 50);

		  // Prevent weak flips
		  if (scoreDiff < 10) {
			regime = prevRegime;
			logger.warn("Regime flip prevented (stability filter)");
		  }
		}

		({ signals, compositeScore } = safeExecute(
		  () => buildSignals(inputs, regime),
		  { signals, compositeScore }
		));


		// 🔻 FALLBACK INTELLIGENCE LAYER (ADD EXACTLY HERE)

		if (fallbackState.crude) {
		  if (signals.crude) {
			signalReliability.crude = Math.max(0.8, signalReliability.crude * 0.9);
		signals.crude.reliability = signalReliability.crude;
		  }
		  logger.warn("Crude using fallback — reliability reduced");
		}

		if (fallbackState.vix) {
		  if (signals.vix) {
			signalReliability.vix = Math.max(0.8, signalReliability.vix * 0.9);
		signals.vix.reliability = signalReliability.vix;
		  }
		  logger.warn("VIX using fallback — reliability reduced");
		}

		  const intelligence = computeSignalIntelligence(signals);
		  let confidence = getConfidence(signals);
		// ==============================
		// ADAPTIVE CONFIDENCE CALIBRATION
		// ==============================



		// 🔻 degrade confidence if fallback used
		if (fallbackState.crude || fallbackState.vix) {
		  confidence = Math.max(20, Math.round(confidence * 0.8));
		}
		// ✅ FIX 2 — Prevent under-confidence in strong regimes
		if (regime === "STRONG RISK ON") {
		  confidence = Math.max(confidence, 60);
		} else if (regime === "RISK ON") {
		  confidence = Math.max(confidence, 50);
		}
		// ===== D27.1 CONFIDENCE SMOOTHING =====
		const prevConfidence = MEMORY.lastSnapshot?.confidence || confidence;
		confidence = smoothConfidence(prevConfidence, confidence);

		  const marketQuality = getMarketQuality(confidence);
		  const sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
		  // const strategy = buildStrategy(regime, confidence, marketQuality, sectorAllocation);
			// const tradeDecision = buildTradeDecision(regime, confidence, marketQuality, intelligence, signals);
		 
		  updateSignalReliability(signals);

		  const portfolioStateData = portfolioState;
		  
		// ==============================
		// D27 RISK PIPELINE
		// ==============================

		const drawdown = updateDrawdown(portfolioStateData);

		const killSwitch = evaluateKillSwitch(drawdown, signals, regime, compositeScore);

		// Start with computed allocation
		let suggestedExposure = 50; // neutral placeholder (no execution layer)

		// ===== D27.1 GUARDRAILS START =====

		// Previous allocation reference
		const prevAllocation =
		  MEMORY.portfolioState?.activePositions?.slice(-1)[0]?.allocation ||
		  suggestedExposure;

		// 1. Market quality soft cap
		suggestedExposure = applyMarketQualityCap(suggestedExposure, marketQuality);

		// 2. Regime floor
		suggestedExposure = applyAllocationFloor(suggestedExposure, regime);

		// 3. Smooth allocation movement
		suggestedExposure = smoothAllocation(prevAllocation, suggestedExposure);

		// 4. Cooldown freeze
		if (isCooldownActive(MEMORY)) {
		  suggestedExposure = prevAllocation;
		}

		// ===== EXISTING RISK ENGINE (UNCHANGED ORDER AFTER THIS) =====

		// Apply volatility adjustment
		suggestedExposure = applyVolatilityAdjustment(suggestedExposure, signals);

		// Apply caps
		suggestedExposure = applyRiskCaps(suggestedExposure, confidence, marketQuality, drawdown);

		// Kill switch override
		if (killSwitch) {
		  suggestedExposure = 0;
		}
		// Update trade decision

		// Final risk output
		const risk = {
		  exposure: suggestedExposure + "%",
		  riskLevel:
			suggestedExposure > 70 ? "HIGH" :
			suggestedExposure > 40 ? "MEDIUM" : "LOW",
		  drawdown,
		  killSwitch
		};

		// ✅ MOVE PORTFOLIO BUILD HERE
		// const portfolio = buildPortfolio(
		//   regime,
		//   strategy,
		//   sectorAllocation,
		//   tradeDecision
		// );

		  const now = Date.now();
		const timestamp = now;

		// ===== V8 SNAPSHOT =====
		const currentSnapshot = {
		  ts: now,
		  signals: Object.fromEntries(
			Object.entries(signals).map(([k, v]) => [k, v.score])
		  ),
		  compositeScore,
		  regime,
		  confidence
		};
		// ===== V8 SIGNAL CHANGES =====
		let signalChanges = [];

		if (MEMORY.lastSnapshot && MEMORY.lastSnapshot.signals) {
		  for (const key of Object.keys(currentSnapshot.signals)) {
			const prev = MEMORY.lastSnapshot.signals[key];
			const curr = currentSnapshot.signals[key];

			if (prev !== curr) {
			  signalChanges.push({
				signal: key,
				from: prev,
				to: curr
			  });
			}
		  }
		}
		// ===== V8 REGIME TRANSITION =====
		let regimeTransition = null;


		if (MEMORY.lastSnapshot && MEMORY.lastSnapshot.regime !== regime) {
		  regimeTransition = {
			from: MEMORY.lastSnapshot.regime,
			to: regime,
			ts: now
		  };
		MEMORY.alerts.push({
		  type: "REGIME_CHANGE",
		  message: `Market shifted from ${MEMORY.lastSnapshot.regime} → ${regime}`,
		  severity: "HIGH",
		  ts: now
		});

		if (MEMORY.alerts.length > 200) {
		  MEMORY.alerts.shift();
		}
		}


		// ===== V8 HISTORY =====
		MEMORY.signalsHistory.push(currentSnapshot);
		if (MEMORY.signalsHistory.length > 100) {
		  MEMORY.signalsHistory.shift();
		}
		MEMORY.v8_regimeHistory = MEMORY.v8_regimeHistory || [];

		MEMORY.v8_regimeHistory.push({
		  regime,
		  score: compositeScore,
		  ts: now
		});

		if (MEMORY.v8_regimeHistory.length > 100)
		  MEMORY.v8_regimeHistory.shift();

		// limit size

		// update snapshot
		MEMORY.lastSnapshot = {
		  ...currentSnapshot,
		  allocation: suggestedExposure
		};
		// ===== V8 TREND =====
		const last10 = Array.isArray(MEMORY.signalsHistory)
		  ? MEMORY.signalsHistory.slice(-10)
		  : [];

		const trend = {
		  score: last10.map(x => x.compositeScore),
		  confidence: last10.map(x => x.confidence),
		  timestamps: last10.map(x => x.ts)
		};

		const alerts = [];
		// Signal change alerts
		signalChanges.forEach(change => {
		let severity = "LOW";

		if (["trend", "vix", "liquidity"].includes(change.signal)) {
		  severity = "HIGH";
		} else if (["fii", "crude"].includes(change.signal)) {
		  severity = "MEDIUM";
		}

		alerts.push({
		  type: "SIGNAL_CHANGE",
		  signal: change.signal,
		  message: `${change.signal} changed from ${change.from} → ${change.to}`,
		  severity,
		  ts: now
		});
		});

		// Regime change alert


		// ===== SAVE ALERTS =====
		MEMORY.alerts = MEMORY.alerts || [];
		MEMORY.alerts = MEMORY.alerts.concat(alerts).slice(-200);

		if (MEMORY.alerts.length > 200) {
		  MEMORY.alerts.shift();
		}

		  regimeHistory.push({ ts: now, regime, score: compositeScore });
		  if (regimeHistory.length > 20) regimeHistory.shift();

		  let duration = 1;
		  for (let i = regimeHistory.length - 2; i >= 0; i--) {
			if (regimeHistory[i].regime === regime) duration++;
			else break;
		  }

		  let change = false;
		  if (regimeHistory.length > 1) {
			const prev = regimeHistory[regimeHistory.length - 2].regime;
			if (prev !== regime) change = true;
		  }

		  let momentum = "flat";
		  if (regimeHistory.length >= 5) {
			const avg = regimeHistory.slice(-5).reduce((a, b) => a + b.score, 0) / 5;
			if (compositeScore > avg + 5) momentum = "strengthening";
			else if (compositeScore < avg - 5) momentum = "weakening";
		  }

		  const regimeIntel = {
			duration,
			change,
			momentum,
			...intelligence
		  };
		// ==============================
		// INTERPRETATION LAYER EXECUTION
		// ==============================

		const interpretation = interpretationEngine({
		  regime,
		  compositeScore,
		  signals,
		  confidence,
		  marketQuality,
		  conviction: intelligence.conviction,
		  conflict: intelligence.conflict
		});
		// ==============================
		// ADVISORY ENGINE EXECUTION
		// ==============================

		const advisory = buildAdvisory({
		  regime,
		  confidence,
		  marketQuality,
		  intelligence,
		  sectorAllocation,
		  risk
		});
		// ==============================
		// NARRATIVE ENGINE EXECUTION
		// ==============================

		const marketView = safeExecute(() =>
		  buildMarketView({
			regime,
			compositeScore,
			confidence,
			marketQuality,
			signals,
			intelligence
		  }),
		  {}
		);

		const portfolioGuidance = safeExecute(() =>
		  buildPortfolioGuidance({
			regime,
			confidence
		  }),
		  {}
		);

		const riskDashboard = safeExecute(() =>
		  buildRiskDashboard({
			risk,
			signals,
			intelligence
		  }),
		  {}
		);/* ==============================
		   V7 EXECUTION (CORRECT PLACE)
		============================== */

		const v7_transition = detectRegimeTransition(regime, compositeScore);
		const v7_diff = computeDiff(signals);

		// Disabled accuracy tracking — not a trading system

		logDecision({
		  ts: Date.now(),
		  regime,
		  score: compositeScore,
		  action: "HOLD",
		  allocation: suggestedExposure + "%",
		  signals
		});

		if (MEMORY.alerts.length > 200) {
		  MEMORY.alerts = MEMORY.alerts.slice(-200);
		}

		try {
		  saveMemory(MEMORY);
		} catch (err) {
		  logger.error({ err }, "Memory save failed");
		}
		// Save signals
		safeExecute(() => {
		  Object.entries(signals).forEach(([name, s]) => {
			db.run(
			  `INSERT INTO signals (name, value, score, weight, timestamp)
			   VALUES (?, ?, ?, ?, ?)`,
			  [name, s.value, s.score, s.weight, timestamp],
			  (err) => {
				if (err) {
				  logger.error({ err, signal: name }, "DB insert error (signals)");
				}
			  }
			);
		  });
		});

		// Save decision
		safeExecute(() => {
		  db.run(
			`INSERT INTO decisions (regime, score, confidence, timestamp)
			 VALUES (?, ?, ?, ?)`,
			[regime, compositeScore, confidence, timestamp],
			(err) => {
			  if (err) {
				logger.error({ err }, "DB insert error (decision)");
			  }
			}
		  );
		});
		// THEN response
		  const narrative = safeExecute(() =>
		  buildNarrative({
			regime,
			interpretation,
			advisory
		  }),
		  {}
		);
		  
		  res.json({
		  version: VERSION,
		  timestamp,

		  marketView,
		  portfolioGuidance,

		  sectorView: {
			allocations: sectorAllocation
		  },

		  riskDashboard,
		  regimeIntel,
		  narrative,

		  meta: {
			fallbackUsed: fallbackState
		  }
		});

		  } catch (err) {
			logger.error({
		  error: err.message,
		  stack: err.stack
		}, "CRITICAL ROUTE FAILURE");

			return res.status(500).json({
			  error: "SYSTEM_FAILURE",
			  message: "Fallback response triggered",
			  timestamp: Date.now()
			});
		  }
		});

	////////////////////////////////////////////////////////
// SECTION-27 : PM2 + STARTUP
// Single Express error handler (4-arg middleware)
// process.on uncaughtException + unhandledRejection guards
// app.listen — server start
////////////////////////////////////////////////////////

	const PORT = process.env.PORT || 3000;

	// =====================================
	// GLOBAL EXPRESS ERROR HANDLER (single)
	// =====================================

	app.use((err, req, res, next) => {
	  logger.error({
		err: err.message,
		stack: err.stack,
		path: req.originalUrl,
		method: req.method
	  }, "Unhandled Express error");

	  return res.status(500).json({
		status: "ERROR",
		timestamp: Date.now(),
		error: {
		  code: "UNHANDLED_EXCEPTION",
		  message: "Unexpected server error"
		}
	  });
	});

	// =====================================
	// PROCESS-LEVEL CRASH GUARDS (H2)
	// Prevents PM2 restart loops from
	// unhandled errors anywhere in the process
	// =====================================

	process.on("uncaughtException", (err) => {
	  logger.error({
		code: "UNCAUGHT_EXCEPTION",
		error: err.message,
		stack: err.stack,
		ts: Date.now()
	  }, "CRITICAL: uncaughtException — process will continue under PM2");
	  // Do NOT call process.exit() — let PM2 manage restarts only on true fatal errors
	});

	process.on("unhandledRejection", (reason, promise) => {
	  logger.error({
		code: "UNHANDLED_REJECTION",
		reason: reason instanceof Error ? reason.message : String(reason),
		stack: reason instanceof Error ? reason.stack : null,
		ts: Date.now()
	  }, "CRITICAL: unhandledRejection — promise rejected without catch");
	});

		app.listen(PORT, async () => {
		  logger.info(`DSS running on port ${PORT} (${VERSION})`);
		  // Pre-establish Yahoo session cookie before scheduler jobs fire
		  try {
			await getYahooCookie();
			logger.info("Yahoo session cookie pre-established at startup");
			// Small warm-up delay — let Yahoo session settle before data requests
			await new Promise(r => setTimeout(r, 10000));
			// Candle cache now restored from disk (candles-cache.json) — startup Yahoo fetch removed
			// to prevent triggering 429s on reload which cascade into circuit breaker opening
		  } catch(e) {
			logger.warn({ err: e.message }, "Yahoo cookie pre-fetch failed at startup");
		  }
		  // Restore debt cache from disk if available and fresh (<1hr)
		  try {
			const _debtDisk = JSON.parse(require("fs").readFileSync("/home/ubuntu/dss-system/data/debt-cache.json", "utf8"));
			if (_debtDisk && _debtDisk.payload && (Date.now() - _debtDisk.ts) < 3600000) {
			  DSSCache.set("nse:debt", _debtDisk.payload);
			  logger.info({ ageMin: Math.round((Date.now() - _debtDisk.ts) / 60000) }, "Debt cache restored from disk");
			} else {
			  logger.info("Debt disk cache too old — will build fresh");
			}
		  } catch(e) {
			logger.info({ err: e.message }, "No debt cache file found — will build fresh");
		  }
		  // Restore candle cache from disk if available and fresh (<24hr)
		  try {
			const _candleDisk = JSON.parse(require("fs").readFileSync("/home/ubuntu/dss-system/data/candles-cache.json", "utf8"));
			if (_candleDisk && _candleDisk.closes && _candleDisk.closes.length > 0 && (Date.now() - _candleDisk.ts) < 86400000) {
			  DSSCache.set("nse:dailyCandles", _candleDisk);
			  logger.info({ candles: _candleDisk.closes.length, ageMin: Math.round((Date.now() - _candleDisk.ts) / 60000) }, "Candle cache restored from disk");
			} else {
			  logger.info("Candle disk cache too old — will build fresh");
			}
		  } catch(e) {
			logger.info({ err: e.message }, "No candle cache file found — will build fresh");
		  }
		  // Restore sector cache from disk if available and fresh (<6hr)
		  try {
			const _sectorDisk = JSON.parse(require("fs").readFileSync("/home/ubuntu/dss-system/data/sector-cache.json", "utf8"));
			if (_sectorDisk && _sectorDisk.payload && (Date.now() - _sectorDisk.ts) < 21600000) {
			  DSSCache.set("nse:sector", _sectorDisk.payload);
			  logger.info({ ageMin: Math.round((Date.now() - _sectorDisk.ts) / 60000) }, "Sector cache restored from disk");
			} else {
			  logger.info("Sector disk cache too old — will build fresh");
			}
		  } catch(e) {
			logger.info({ err: e.message }, "No sector cache file found — will build fresh");
		  }
		});
