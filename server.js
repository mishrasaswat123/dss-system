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

// GOVERNANCE Phase E: Narrative Context Builder
function buildNarrativeContext(cache){
  try{
    const regime=cache.get("regime:composite")||{};
    const sysConf=computeSystemConfidence(cache);
    const ms=regime.moduleScores||{};
    const nseIdx=cache.get("nse:index")||{};
    const globalRaw=cache.get("equity:global")||{};
    const fredMacro=cache.get("macro:fred")||{};
    const blsMacro=cache.get("macro:bls")||{};
    const fedRSS=cache.get("macro:fedrss")||{};
    const debtCache=cache.get("nse:debt")||{};
    const moduleList=Object.entries(ms).filter(([,v])=>v!==null&&v!==undefined).map(([k,v])=>({key:k,score:v,weight:MOD_CONF_WEIGHTS[k]||0})).sort((a,b)=>(b.score*b.weight)-(a.score*a.weight));
    const topDrivers=moduleList.filter(m=>m.score>=55).map(m=>m.key);
    const weakestDrivers=moduleList.filter(m=>m.score<=40).map(m=>m.key);
    const vix=nseIdx.vixValue??null;
    // P3-1: buildReasoningChain — FSD v8 Section 10.1
    // Reads already-populated caches. Read-only. Zero compute risk.
    // Produces factual signal chain for LLM context and narrative keyDrivers.
    const _techSignals = cache.get("signals:technical") || {};
    const _sigList = _techSignals.signals || [];
    const _rsiSig  = _sigList.find(s => s.name && s.name.includes("RSI"));
    const _macdSig = _sigList.find(s => s.name && s.name.includes("MACD"));
    const _sma50Sig = _sigList.find(s => s.name && s.name.includes("50"));
    const _sma200Sig = _sigList.find(s => s.name && s.name.includes("200"));
    const _reasoningParts = [];
    if (_rsiSig?.value !== undefined)  _reasoningParts.push(`RSI ${_rsiSig.value} (${_rsiSig.sentiment})`);
    if (_macdSig)                      _reasoningParts.push(`MACD ${_macdSig.signal}`);
    if (_sma50Sig)                     _reasoningParts.push(`50DMA ${_sma50Sig.signal}`);
    if (_sma200Sig)                    _reasoningParts.push(`200DMA ${_sma200Sig.signal}`);
    if (vix !== null)                  _reasoningParts.push(`India VIX ${vix}`);
    if (fredMacro.us10YYield)          _reasoningParts.push(`US 10Y ${fredMacro.us10YYield}%`);
    if (fredMacro.fedFundsRate)        _reasoningParts.push(`Fed Funds ${fredMacro.fedFundsRate}%`);
    if (fredMacro.yieldCurveSignal)    _reasoningParts.push(`Yield curve ${fredMacro.yieldCurveSignal}`);
    if (fredMacro.fedStance)           _reasoningParts.push(`Fed ${fredMacro.fedStance}`);
    if (blsMacro.usUnemployment)       _reasoningParts.push(`US unemployment ${blsMacro.usUnemployment}%`);
    if (fedRSS.overallTone)            _reasoningParts.push(`Fed tone ${fedRSS.overallTone}`);
    const reasoningChain = _reasoningParts.length > 0
      ? _reasoningParts.join(" | ")
      : "Signal basis: live data insufficient for explicit chain";
    const topSignalDrivers = [
      _rsiSig  ? `RSI ${_rsiSig.value} — ${_rsiSig.sentiment}` : null,
      _macdSig ? `MACD ${_macdSig.signal}` : null,
      vix      ? `India VIX ${vix} — ${vix < 15 ? "calm" : vix < 22 ? "elevated" : "fear"}` : null,
      fredMacro.us10YYield ? `US 10Y at ${fredMacro.us10YYield}% (${fredMacro.fedStance || "n/a"})` : null,
      blsMacro.usUnemployment ? `US unemployment ${blsMacro.usUnemployment}%` : null,
    ].filter(Boolean).slice(0, 4);

    return {
      compositeScore:regime.compositeScore??null,
      regime:regime.regime??null,
      regimeLabel:regime.regimeLabel??null,
      regimeStrength:!regime.compositeScore?null:regime.compositeScore>=70?"STRONG":regime.compositeScore>=55?"MODERATE":regime.compositeScore>=45?"NEUTRAL":"WEAK",
      actionBias:regime.actionBias??null,
      tacticalBias:regime.actionBias??null,
      confidence:sysConf.overall,
      confidenceClass:sysConf.classification,
      degradedModules:sysConf.degradedModules,
      fallbackModules:sysConf.fallbackModules,
      staleModules:sysConf.staleModules,
      topDrivers,weakestDrivers,
      reasoningChain, topSignalDrivers,
      includedModules:regime.includedModules||[],
      moduleCoverage:sysConf.moduleCoverage,
      volatilityState:vix===null?null:vix<15?"LOW":vix<22?"MODERATE":"HIGH",
      liquidityState:null,
      macroState:{dxy:globalRaw.dxy??null,crudeBrent:globalRaw.crudeOil??null,repoRate:debtCache.overview?.repoRate??null,realRate:debtCache.overview?.realRate??null,us10Y:fredMacro.us10YYield??null,us2Y:fredMacro.us2YYield??null,yieldSpread:fredMacro.yieldSpread10_2??null,yieldCurve:fredMacro.yieldCurveSignal??null,fedFundsRate:fredMacro.fedFundsRate??null,fedStance:fredMacro.fedStance??null,usUnemployment:fredMacro.usUnemployment??null,fredSource:fredMacro.fetchedAt?"FRED":"fallback",usUnemploymentBLS:blsMacro.usUnemployment??null,laborSignal:blsMacro.laborSignal??null,usPayrolls:blsMacro.usPayrolls??null,payrollSignal:blsMacro.payrollSignal??null,usCpiIndex:blsMacro.usCpiIndex??null,blsSource:blsMacro.fetchedAt?"BLS":"fallback"},
      riskFlags:[
        ...(sysConf.fallbackModules.length>2?["HIGH_FALLBACK_COUNT"]:[]),
        ...(sysConf.overall<0.40?["LOW_SYSTEM_CONFIDENCE"]:[]),
        ...(vix>22?["ELEVATED_VOLATILITY"]:[]),
        ...((regime.compositeScore||50)<=30?["EXTREME_RISK_OFF"]:[]),
        ...((regime.compositeScore||50)>=75?["EXTREME_RISK_ON"]:[]),
        ...(fredMacro.yieldCurveSignal==="INVERTED"?["YIELD_CURVE_INVERTED"]:[]),
        ...(fredMacro.fedStance==="RESTRICTIVE"?["FED_RESTRICTIVE"]:[]),
        ...(fedRSS.overallTone==="HAWKISH"?["FED_HAWKISH_SIGNAL"]:[]),
      ],
      governance:{
        llmMayOverrideRegime:false,llmMayOverrideScore:false,
        llmMayInferMissingData:false,
        llmMustDiscloseDegraded:sysConf.degradedModules.length>0||sysConf.fallbackModules.length>0,
        llmToneModifier:sysConf.overall<0.40?"CAUTIOUS":sysConf.overall<0.60?"MEASURED":"CONFIDENT",
        requiredDisclaimers:sysConf.fallbackModules.length>0?["Data quality note: "+sysConf.fallbackModules.join(", ")+" using fallback values"]:[],
      },
      generatedAt:Date.now(),
    };
  }catch(e){return{error:e.message,generatedAt:Date.now()};}
}

// GOVERNANCE Phase H: Provider Health Registry
const ProviderHealthRegistry=(()=>{
  const _s={},_w=3600000;
  function _i(p){if(!_s[p])_s[p]={success:[],failure:[],latencies:[],lastSuccess:null,lastFailure:null};}
  return {
    recordSuccess(p,lat=0){_i(p);const n=Date.now();_s[p].success.push(n);_s[p].latencies.push(lat);_s[p].lastSuccess=n;_s[p].success=_s[p].success.filter(t=>n-t<_w);_s[p].failure=_s[p].failure.filter(t=>n-t<_w);_s[p].latencies=_s[p].latencies.slice(-50);},
    recordFailure(p){_i(p);const n=Date.now();_s[p].failure.push(n);_s[p].lastFailure=n;_s[p].failure=_s[p].failure.filter(t=>n-t<_w);_s[p].success=_s[p].success.filter(t=>n-t<_w);},
    getSummary(){const o={};for(const[p,d]of Object.entries(_s)){const tot=d.success.length+d.failure.length;const avg=d.latencies.length?Math.round(d.latencies.reduce((a,b)=>a+b,0)/d.latencies.length):null;o[p]={successRate:tot>0?Math.round((d.success.length/tot)*100):null,successCount:d.success.length,failureCount:d.failure.length,avgLatencyMs:avg,lastSuccess:d.lastSuccess,lastFailure:d.lastFailure,status:d.failure.length>d.success.length?"DEGRADED":d.success.length>0?"OK":"UNKNOWN"};}return o;},
  };
})();

// GOVERNANCE Phase F: Narrative Governance Rules
const NarrativeGovernanceRules = Object.freeze({
  LLM_MAY_OVERRIDE_REGIME:       false,
  LLM_MAY_OVERRIDE_SCORE:        false,
  LLM_MAY_INFER_MISSING_DATA:    false,
  LLM_MAY_HIDE_DEGRADED_STATE:   false,
  LLM_MAY_GENERATE_INDEPENDENT_RECS: false,
  LLM_MAY_REINTERPRET_WEIGHTS:   false,
  MIN_CONFIDENCE_FOR_CONFIDENT_TONE: 0.60,
  MIN_CONFIDENCE_FOR_MEASURED_TONE:  0.40,
  REQUIRED_CONTEXT_FIELDS: ["compositeScore","regime","confidence","confidenceClass","degradedModules","fallbackModules","tacticalBias","riskFlags"],
  FORBIDDEN_CONTEXT_FIELDS: ["moduleWeights","engineFormulas","rawProviderOutputs","hiddenState","optionChainDump"],
  applyToneModifier(confidence) {
    if (confidence >= this.MIN_CONFIDENCE_FOR_CONFIDENT_TONE) return "CONFIDENT";
    if (confidence >= this.MIN_CONFIDENCE_FOR_MEASURED_TONE)  return "MEASURED";
    return "CAUTIOUS";
  },
  validateContext(ctx) {
    const missing = this.REQUIRED_CONTEXT_FIELDS.filter(f => ctx[f] === undefined);
    const forbidden = this.FORBIDDEN_CONTEXT_FIELDS.filter(f => ctx[f] !== undefined);
    return { valid: missing.length===0 && forbidden.length===0, missing, forbidden };
  },
});

// ════════════════════════════════════════════════════════════════════
// SPRINT 4A: LLM NARRATIVE ADAPTER LAYER
// Mandate: zero-cost, self-hosted-first, governed, deterministic fallback
// Provider abstraction: MockAdapter | GroqAdapter | RuleBasedAdapter
// LLM receives ONLY buildNarrativeContext() output — never raw feeds
// ════════════════════════════════════════════════════════════════════

const LLM_CONFIG = Object.freeze({
  provider:    process.env.LLM_PROVIDER  || "rulebased",
  model:       process.env.LLM_MODEL     || "llama-3.1-8b-instant",
  groqKey:     process.env.GROQ_API_KEY  || "",
  groqUrl:     "https://api.groq.com/openai/v1/chat/completions",
  maxTokens:   400,
  timeoutMs:   5000,
  maxRetries:  1,
  maxRespChars:1200,
  promptVersion: "v1.0.0",
});

// Prompt version tracking
const PROMPT_VERSION = "v1.0.0";

// ══════════════════════════════════════════════════════════════════
// NARRATIVE RELIABILITY LAYER — v1.0.0
// R1: Prompt Provenance Logging
// R2: Narrative Replay Store (in-memory, admin-only, last 20 entries)

// ── A1/R1: Provenance ring buffer (last 50, no portfolio values) ──
const PROVENANCE_LOG = (() => {
  const MAX = 50, buf = [];
  return {
    push(e) { buf.push({ ...e, loggedAt: Date.now() }); if (buf.length > MAX) buf.shift(); },
    getLast(n=10) { return buf.slice(-Math.min(n, MAX)); },
    getAll() { return [...buf]; },
    size() { return buf.length; },
  };
})();

// ── A2/R2: Replay store (last 20, context snapshots only) ────────
const REPLAY_STORE = (() => {
  const MAX = 20, buf = [];
  return {
    push(e) { buf.push(e); if (buf.length > MAX) buf.shift(); },
    getAll() { return [...buf]; },
    getById(id) { return buf.find(e => e.replayId === id) || null; },
    size() { return buf.length; },
  };
})();

// ── R1: Deterministic replay ID hash ─────────────────────────────
function narrativeContextHash(ctx, audience, riskProfile, promptVersion) {
  const s = JSON.stringify({
    regime: ctx.regime,
    compositeScore: ctx.compositeScore,
    confidence: ctx.confidence ? Math.round(ctx.confidence * 1000) / 1000 : null,
    confidenceClass: ctx.confidenceClass,
    fallbackModules: (ctx.fallbackModules || []).slice().sort(),
    degradedModules: (ctx.degradedModules || []).slice().sort(),
    audience, riskProfile, promptVersion,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return 'nr_' + h.toString(16).padStart(8, '0');
}

// ── A2: Circuit breaker persistence helpers ───────────────────────
function persistCBState(failures, isOpen) {
  try {
    db.run('UPDATE circuit_breaker_state SET failures=?,is_open=?,last_failure=?,updated_at=? WHERE id=1',
      [failures, isOpen?1:0, isOpen?Date.now():null, Date.now()],
      (err) => { if (err) logger.warn({ err: err.message }, 'CB state persist failed'); });
  } catch(e) { logger.warn({ err: e.message }, 'CB persist threw'); }
}
function loadCBState() {
  return new Promise((resolve) => {
    db.get('SELECT * FROM circuit_breaker_state WHERE id=1', (err, row) => {
      if (err||!row) { resolve({ failures:0, isOpen:false }); return; }
      resolve({ failures: row.failures||0, isOpen: !!row.is_open });
    });
  });
}

// ── A1: Log provenance — in-memory + SQLite ───────────────────────
function logNarrativeProvenance(e) {
  const entry = {
    replayId: e.replayId, audience: e.audience, riskProfile: e.riskProfile,
    provider: e.provider, model: e.model||'rulebased', promptVersion: e.promptVersion,
    regime: e.regime, confidenceClass: e.confidenceClass,
    fallbackUsed: !!e.fallbackUsed, fallbackReason: e.fallbackReason||null,
    latencyMs: Math.round(e.latencyMs||0),
    governanceViolations: e.governanceViolations||[],
    contradictions: e.contradictions||[],
    uncertaintyActive: !!e.uncertaintyActive, reversalActive: !!e.reversalActive,
    fgsSanitizations: e.fgsSanitizations||0, degradationActive: !!e.degradationActive,
    calibrationApplied: !!e.calibrationApplied,
  };
  PROVENANCE_LOG.push(entry);
  logger.info({ job:'narrative-provenance', replayId:entry.replayId, provider:entry.provider,
    fallback:entry.fallbackUsed, contradictions:entry.contradictions.length,
    latencyMs:entry.latencyMs }, 'Narrative provenance logged');
  try {
    db.run(
      `INSERT INTO narrative_provenance
       (replay_id,audience,risk_profile,provider,model,prompt_version,regime,
        confidence_class,fallback_used,fallback_reason,latency_ms,
        contradiction_count,contradiction_ids,uncertainty_active,reversal_active,
        fgs_sanitizations,degradation_active,calibration_applied,logged_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [entry.replayId,entry.audience||null,entry.riskProfile||null,
       entry.provider||null,entry.model||'rulebased',entry.promptVersion||null,
       entry.regime||null,entry.confidenceClass||null,entry.fallbackUsed?1:0,
       entry.fallbackReason||null,entry.latencyMs,
       (entry.contradictions||[]).length,
       JSON.stringify((entry.contradictions||[]).map(c=>c.id||c)),
       entry.uncertaintyActive?1:0,entry.reversalActive?1:0,
       entry.fgsSanitizations||0,entry.degradationActive?1:0,
       entry.calibrationApplied?1:0,Date.now()],
      (err) => { if (err) logger.warn({ err:err.message }, 'Provenance SQLite write failed'); }
    );
  } catch(err) { logger.warn({ err:err.message }, 'Provenance SQLite write threw'); }
  return entry;
}

// A5: Hardened Contradiction Detection (7 rules, expanded keyword sets)
const CONTRADICTION_RULES = [
  { id: 'C1_BULLISH_CAUTIOUS_MISMATCH',
    check(n, ctx, meta) {
      if (!ctx.regime.includes('RISK_ON')) return null;
      const all = ((n.summary||'')+(n.tacticalView||'')).toLowerCase();
      const kw = ['cautious','defensive','pullback risk','reduce exposure','trim equity',
        'protect capital','preserve optionality','avoid deployment','hold back',
        'wait for clarity','elevated risk','market anxious','headwinds building','caution warranted'];
      if (n.marketTone==='CAUTIOUS' && kw.some(k=>all.includes(k)))
        return { id:'C1_BULLISH_CAUTIOUS_MISMATCH', description:`RISK_ON regime with CAUTIOUS tone and defensive language` };
    } },
  { id: 'C2_HIGH_CONVICTION_UNCERTAINTY_MISMATCH',
    check(n, ctx, meta) {
      if (meta.convictionClass!=='STRONG'&&meta.convictionClass!=='HIGH') return null;
      const s = (n.summary||'').toLowerCase();
      const kw = ['unclear','uncertain','no clear direction','difficult to predict','ambiguous',
        'range-bound','mixed signals','conflicting','hard to call','visibility limited',
        'awaiting confirmation','direction uncertain'];
      if (kw.some(k=>s.includes(k)))
        return { id:'C2_HIGH_CONVICTION_UNCERTAINTY_MISMATCH', description:`${meta.convictionClass} conviction with uncertainty language` };
    } },
  { id: 'C3_REVERSAL_CERTAINTY_MISMATCH',
    check(n, ctx, meta) {
      if (!meta.reversalWindowActive) return null;
      const all = ((n.tacticalView||'')+(n.summary||'')).toLowerCase();
      const kw = ['strongly recommend','act now','clear opportunity','ideal entry',
        'excellent conditions','deploy aggressively','add exposure','accumulate now',
        'strong buy signal','high confidence deployment'];
      if (n.marketTone==='CONFIDENT'||kw.some(k=>all.includes(k)))
        return { id:'C3_REVERSAL_CERTAINTY_MISMATCH', description:'Reversal window active with high-certainty tone/language' };
    } },
  { id: 'C4_DEGRADATION_AUTHORITY_MISMATCH',
    check(n, ctx, meta) {
      if ((ctx.fallbackModules||[]).length < 3) return null;
      if ((n.marketTone==='CONFIDENT'||n.marketTone==='CONSTRUCTIVE')&&!n.confidenceNote)
        return { id:'C4_DEGRADATION_AUTHORITY_MISMATCH', description:`${(ctx.fallbackModules||[]).length} fallback modules with ${n.marketTone} tone and no qualification` };
    } },
  { id: 'C5_RISK_OFF_DEPLOYMENT_MISMATCH',
    check(n, ctx, meta) {
      if (!ctx.regime.includes('RISK_OFF')) return null;
      const t = (n.tacticalView||'').toLowerCase();
      const kw = ['deploy','increase equity','accumulate aggressively','add exposure',
        'buy the dip','increase allocation','go long','overweight equity','raise equity'];
      if (kw.some(k=>t.includes(k)))
        return { id:'C5_RISK_OFF_DEPLOYMENT_MISMATCH', description:'RISK_OFF regime with deployment language' };
    } },
  { id: 'C6_LOW_CONVICTION_STRONG_LANGUAGE',
    check(n, ctx, meta) {
      if (meta.convictionClass !== 'LOW') return null;
      const t = (n.tacticalView||'').toLowerCase();
      const kw = ['strongly','clearly','definitely','without doubt','with confidence',
        'high conviction','decisive','unambiguous','certain','must'];
      if (kw.some(k=>t.includes(k)))
        return { id:'C6_LOW_CONVICTION_STRONG_LANGUAGE', description:'LOW conviction with strong/decisive tactical language' };
    } },
  { id: 'C7_UNCERTAINTY_MODE_CONFIDENT_TONE',
    check(n, ctx, meta) {
      if (!meta.uncertaintyMode?.active) return null;
      if (n.marketTone==='CONFIDENT')
        return { id:'C7_UNCERTAINTY_MODE_CONFIDENT_TONE', description:'Uncertainty mode active with CONFIDENT market tone' };
    } },
];


// scanContradictions: run all rules, return array of detected contradictions
function scanContradictions(narrative, ctx, meta) {
  const detected = [];
  for (const rule of CONTRADICTION_RULES) {
    try {
      const result = rule.check(narrative, ctx, meta);
      if (result) detected.push(result);
    } catch(e) {
      logger.warn({ job: 'contradiction-scan', rule: rule.id, err: e.message }, 'Contradiction rule threw');
    }
  }
  if (detected.length > 0) {
    logger.warn({ job: 'contradiction-scan', count: detected.length, ids: detected.map(d=>d.id) }, 'Narrative contradictions detected');
  }
  return detected;
}

// ══════════════════════════════════════════════════════════════════
// R4 — UNCERTAINTY LANGUAGE CALIBRATION
// Deterministic tone hierarchy — institutional language discipline
// Applied as post-processing after LLM/rulebased output
// ══════════════════════════════════════════════════════════════════

const UNCERTAINTY_CALIBRATION = Object.freeze({
  // LOW confidence: < 0.40
  LOW_CONFIDENCE: {
    requiredTone: ['CAUTIOUS'],
    prohibitedTones: ['CONFIDENT', 'CONSTRUCTIVE'],
    requiredQualification: true,
    institutionalNote: 'Data confidence limited — exercise additional caution in advisory use.',
  },
  // MODERATE confidence: 0.40–0.60
  MODERATE_CONFIDENCE: {
    requiredTone: ['CAUTIOUS', 'MEASURED', 'BALANCED'],
    prohibitedTones: ['CONFIDENT'],
    requiredQualification: false,
    institutionalNote: null,
  },
  // HIGH uncertainty mode active
  HIGH_UNCERTAINTY: {
    requiredTone: ['CAUTIOUS', 'MEASURED'],
    prohibitedTones: ['CONFIDENT', 'CONSTRUCTIVE'],
    requiredQualification: true,
    institutionalNote: 'Uncertainty conditions active — advisory conviction qualified.',
  },
  // Reversal window active
  REVERSAL_ACTIVE: {
    requiredTone: ['CAUTIOUS', 'MEASURED'],
    prohibitedTones: ['CONFIDENT', 'CONSTRUCTIVE'],
    requiredQualification: true,
    institutionalNote: 'Mature regime reversal window — posture: OBSERVE.',
  },
  // Degraded state (3+ fallback modules)
  DEGRADED: {
    requiredTone: ['CAUTIOUS', 'MEASURED', 'BALANCED'],
    prohibitedTones: ['CONFIDENT'],
    requiredQualification: true,
    institutionalNote: 'Multiple data sources on fallback — narrative reflects estimated values.',
  },
});

function calibrateUncertaintyTone(narrative, ctx, meta) {
  const confidence = ctx.confidence || 0.5;
  const fallbackCount = (ctx.fallbackModules || []).length;
  const uncertaintyActive = meta.uncertaintyMode?.active || false;
  const reversalActive = meta.reversalWindowActive || false;
  const degraded = fallbackCount >= 3;

  const violations = [];
  let calibration = null;

  // Determine applicable calibration tier (priority order)
  if (reversalActive) calibration = UNCERTAINTY_CALIBRATION.REVERSAL_ACTIVE;
  else if (uncertaintyActive && meta.uncertaintyMode?.severity === 'HIGH') calibration = UNCERTAINTY_CALIBRATION.HIGH_UNCERTAINTY;
  else if (confidence < 0.40) calibration = UNCERTAINTY_CALIBRATION.LOW_CONFIDENCE;
  else if (confidence < 0.60) calibration = UNCERTAINTY_CALIBRATION.MODERATE_CONFIDENCE;
  else if (degraded) calibration = UNCERTAINTY_CALIBRATION.DEGRADED;

  if (!calibration) return { violations: [], calibrationApplied: null, note: null };

  const tone = narrative.marketTone || '';
  if (calibration.prohibitedTones.includes(tone)) {
    violations.push(`Tone ${tone} prohibited under current calibration tier — expected: ${calibration.requiredTone.join('/')}`);
    // Apply correction: downgrade to safest allowed tone
    narrative = { ...narrative, marketTone: calibration.requiredTone[0], _toneCalibrated: true };
  }

  // Ensure confidenceNote present when required and missing
  if (calibration.requiredQualification && !narrative.confidenceNote && calibration.institutionalNote) {
    narrative = { ...narrative, confidenceNote: calibration.institutionalNote, _confidenceNoteInjected: true };
  }

  if (violations.length > 0) {
    logger.warn({ job: 'uncertainty-calibration', violations, tone: narrative.marketTone }, 'Uncertainty calibration corrections applied');
  }

  return { narrative, violations, calibrationApplied: calibration, note: calibration.institutionalNote };
}

// ══════════════════════════════════════════════════════════════════
// R5 — NARRATIVE REGRESSION TEST SUITE
// Focus: semantic consistency, governance compliance, degradation behavior
// Not rigid text snapshots — structural and behavioral assertions
// ══════════════════════════════════════════════════════════════════

const NARRATIVE_REGRESSION_TESTS = [
  {
    id: 'NR-01',
    description: 'contradictionScan: RISK_ON + CAUTIOUS tone flags C1',
    run() {
      const narrative = { marketTone: 'CAUTIOUS', summary: 'Market is cautious with defensive posture and pullback risk.', tacticalView: '' };
      const ctx = { regime: 'RISK_ON', compositeScore: 65, confidence: 0.70, fallbackModules: [] };
      const meta = { convictionClass: 'MODERATE', reversalWindowActive: false };
      const result = scanContradictions(narrative, ctx, meta);
      return { pass: result.some(c => c.id === 'C1_BULLISH_CAUTIOUS_MISMATCH'), detail: 'C1 detected: ' + JSON.stringify(result.map(c=>c.id)) };
    }
  },
  {
    id: 'NR-02',
    description: 'contradictionScan: NEUTRAL regime + no contradiction',
    run() {
      const narrative = { marketTone: 'BALANCED', summary: 'Market is neutral.', tacticalView: 'Maintain allocation.' };
      const ctx = { regime: 'NEUTRAL', compositeScore: 50, confidence: 0.60, fallbackModules: [] };
      const meta = { convictionClass: 'MODERATE', reversalWindowActive: false };
      const result = scanContradictions(narrative, ctx, meta);
      return { pass: result.length === 0, detail: 'No contradictions on clean NEUTRAL: ' + JSON.stringify(result) };
    }
  },
  {
    id: 'NR-03',
    description: 'contradictionScan: reversal active + CONFIDENT tone flags C3',
    run() {
      const narrative = { marketTone: 'CONFIDENT', summary: 'Market looks strong.', tacticalView: 'Strongly recommend increasing equity.' };
      const ctx = { regime: 'RISK_ON', compositeScore: 70, confidence: 0.75, fallbackModules: [] };
      const meta = { convictionClass: 'HIGH', reversalWindowActive: true };
      const result = scanContradictions(narrative, ctx, meta);
      return { pass: result.some(c => c.id === 'C3_REVERSAL_CERTAINTY_MISMATCH'), detail: JSON.stringify(result.map(c=>c.id)) };
    }
  },
  {
    id: 'NR-04',
    description: 'calibrateUncertaintyTone: LOW confidence enforces CAUTIOUS tone',
    run() {
      const narrative = { marketTone: 'CONFIDENT', summary: 'Market looks great.', confidenceNote: null };
      const ctx = { regime: 'NEUTRAL', confidence: 0.30, fallbackModules: ['equity', 'debt'] };
      const meta = { uncertaintyMode: { active: false }, reversalWindowActive: false };
      const { narrative: cal, violations } = calibrateUncertaintyTone(narrative, ctx, meta);
      return { pass: cal.marketTone === 'CAUTIOUS' && violations.length > 0, detail: `Tone: ${cal.marketTone}, violations: ${violations.length}` };
    }
  },
  {
    id: 'NR-05',
    description: 'calibrateUncertaintyTone: HIGH uncertainty injects confidenceNote when missing',
    run() {
      const narrative = { marketTone: 'MEASURED', summary: 'Market uncertain.', confidenceNote: null };
      const ctx = { regime: 'NEUTRAL', confidence: 0.55, fallbackModules: [] };
      const meta = { uncertaintyMode: { active: true, severity: 'HIGH' }, reversalWindowActive: false };
      const { narrative: cal } = calibrateUncertaintyTone(narrative, ctx, meta);
      return { pass: !!cal.confidenceNote, detail: 'confidenceNote injected: ' + !!cal.confidenceNote };
    }
  },
  {
    id: 'NR-06',
    description: 'calibrateUncertaintyTone: reversal active prohibits CONFIDENT tone',
    run() {
      const narrative = { marketTone: 'CONFIDENT', summary: 'Strong conditions.', confidenceNote: null };
      const ctx = { regime: 'RISK_ON', confidence: 0.80, fallbackModules: [] };
      const meta = { uncertaintyMode: { active: false }, reversalWindowActive: true };
      const { narrative: cal, violations } = calibrateUncertaintyTone(narrative, ctx, meta);
      return { pass: cal.marketTone !== 'CONFIDENT' && violations.length > 0, detail: `Calibrated tone: ${cal.marketTone}` };
    }
  },
  {
    id: 'NR-07',
    description: 'narrativeContextHash: identical inputs produce identical hash',
    run() {
      const ctx = { regime: 'NEUTRAL', compositeScore: 50, confidence: 0.60, confidenceClass: 'MODERATE', fallbackModules: [], degradedModules: [] };
      const h1 = narrativeContextHash(ctx, 'IFA Advisory Pitch', 'Moderate', 'v1.0.0');
      const h2 = narrativeContextHash(ctx, 'IFA Advisory Pitch', 'Moderate', 'v1.0.0');
      return { pass: h1 === h2 && h1.startsWith('nr_'), detail: `Hash: ${h1}` };
    }
  },
  {
    id: 'NR-08',
    description: 'narrativeContextHash: different regimes produce different hashes',
    run() {
      const base = { regime: 'NEUTRAL', compositeScore: 50, confidence: 0.60, confidenceClass: 'MODERATE', fallbackModules: [], degradedModules: [] };
      const h1 = narrativeContextHash(base, 'IFA Advisory Pitch', 'Moderate', 'v1.0.0');
      const h2 = narrativeContextHash({ ...base, regime: 'RISK_ON' }, 'IFA Advisory Pitch', 'Moderate', 'v1.0.0');
      return { pass: h1 !== h2, detail: `h1: ${h1}, h2: ${h2}` };
    }
  },
  {
    id: 'NR-09',
    description: 'C4: 3+ fallback modules + CONFIDENT tone + no confidenceNote flags contradiction',
    run() {
      const narrative = { marketTone: 'CONFIDENT', summary: 'Market strong.', confidenceNote: null, tacticalView: '' };
      const ctx = { regime: 'NEUTRAL', compositeScore: 55, confidence: 0.65, fallbackModules: ['equity','debt','global'] };
      const meta = { convictionClass: 'MODERATE', reversalWindowActive: false };
      const result = scanContradictions(narrative, ctx, meta);
      return { pass: result.some(c => c.id === 'C4_DEGRADATION_AUTHORITY_MISMATCH'), detail: JSON.stringify(result.map(c=>c.id)) };
    }
  },
  {
    id: 'NR-10',
    description: 'C5: RISK_OFF + deployment language flags contradiction',
    run() {
      const narrative = { marketTone: 'BALANCED', summary: 'Deploy equity aggressively.', confidenceNote: null, tacticalView: 'Deploy capital and increase equity exposure now.' };
      const ctx = { regime: 'RISK_OFF', compositeScore: 35, confidence: 0.60, fallbackModules: [] };
      const meta = { convictionClass: 'MODERATE', reversalWindowActive: false };
      const result = scanContradictions(narrative, ctx, meta);
      return { pass: result.some(c => c.id === 'C5_RISK_OFF_DEPLOYMENT_MISMATCH'), detail: JSON.stringify(result.map(c=>c.id)) };
    }
  },
  { id: 'NR-11',
    desc:'C6: LOW conviction+strong language flags contradiction',
    run() { const n={marketTone:'MEASURED',summary:'Market mixed.',tacticalView:'Strongly and clearly increase equity without doubt.'}; const ctx={regime:'NEUTRAL',compositeScore:50,confidence:0.55,fallbackModules:[]}; const m={convictionClass:'LOW',reversalWindowActive:false,uncertaintyMode:{active:false}}; const r=scanContradictions(n,ctx,m); return{pass:r.some(c=>c.id==='C6_LOW_CONVICTION_STRONG_LANGUAGE'),detail:JSON.stringify(r.map(c=>c.id))}; } },
  { id: 'NR-12',
    desc:'C7: uncertainty mode+CONFIDENT tone flags contradiction',
    run() { const n={marketTone:'CONFIDENT',summary:'Market great.',tacticalView:'Deploy capital.'}; const ctx={regime:'NEUTRAL',compositeScore:55,confidence:0.60,fallbackModules:[]}; const m={convictionClass:'MODERATE',reversalWindowActive:false,uncertaintyMode:{active:true,severity:'HIGH'}}; const r=scanContradictions(n,ctx,m); return{pass:r.some(c=>c.id==='C7_UNCERTAINTY_MODE_CONFIDENT_TONE'),detail:JSON.stringify(r.map(c=>c.id))}; } },
];

function runNarrativeRegressionTests() {
  const results = NARRATIVE_REGRESSION_TESTS.map(t => {
    try { const r = t.run(); return { id: t.id, description: t.description, ...r }; }
    catch(e) { return { id: t.id, description: t.description, pass: false, detail: 'Threw: ' + e.message }; }
  });
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  logger.info({ job: 'narrative-regression', passed, total: results.length, failed: failed.length }, 'Narrative regression tests complete');
  return { total: results.length, passed, failed: failed.length, failures: failed, results };
}

// ══════════════════════════════════════════════════════════════════
// R6 — DEGRADATION SIMULATION HARNESS
// Test graceful degradation under various failure conditions
// Admin-only: POST /api/v1/admin/narrative/simulate-degradation
// ══════════════════════════════════════════════════════════════════

const DEGRADATION_SCENARIOS = {
  ALL_FALLBACK: { fallbackModules: ['equity','debt','global','derivatives','sector'], degradedModules: ['equity','debt','global','derivatives','sector'], confidence: 0.30, regime: 'NEUTRAL' },
  PARTIAL_FALLBACK: { fallbackModules: ['debt','derivatives'], degradedModules: ['debt'], confidence: 0.55, regime: 'NEUTRAL' },
  LLM_TIMEOUT: { simulateLLMTimeout: true, fallbackModules: [], confidence: 0.70, regime: 'RISK_ON' },
  STALE_CACHE: { simulateStalecache: true, fallbackModules: ['equity'], confidence: 0.50, regime: 'NEUTRAL' },
  MISSING_MACRO: { fallbackModules: ['global'], degradedModules: ['global'], confidence: 0.58, regime: 'NEUTRAL' },
};



// Forbidden language filter
const FORBIDDEN_PHRASES = ["guaranteed","certain to","must buy","strong buy",
  "sell immediately","risk-free","assured returns","definitely will","100%",
  // H5.3 extensions
  "must act now","act immediately","don't miss","act before","time is running out",
  "window is closing","limited time","before the market opens","today's opportunity",
  "market crash","collapse is coming","panic selling","catastrophic losses","disaster ahead",
  "protect yourself now","crisis mode","emergency rebalancing","flee to safety",
  "rare opportunity","once in a decade","exceptional entry point","ideal conditions",
  "perfect allocation","best time to invest","golden opportunity","high-return opportunity",
  "will definitely","cannot fail","no downside risk","market will definitely","certain to outperform",
  "exciting opportunity","remarkable setup","outstanding conditions","markets look great",
  "fantastic entry","brilliant timing","extraordinary conditions",
  "safe investment","ideal for you","perfect for your goals","designed for investors like you","meets your needs"
];

function sanitizeNarrativeText(text) {
  if (!text) return text;
  let out = text;
  for (const phrase of FORBIDDEN_PHRASES) {
    const rx = new RegExp(phrase, "gi");
    out = out.replace(rx, "[assessment]");
  }
  return out;
}

// Structured output validator
function validateNarrativeOutput(parsed, ctx) {
  const violations = [];
  if (!parsed || typeof parsed !== "object") return { valid: false, violations: ["Not a JSON object"] };
  if (!parsed.summary)      violations.push("Missing summary field");
  if (!parsed.marketTone)   violations.push("Missing marketTone field");
  // Governance: LLM cannot override regime
  if (parsed.regime && parsed.regime !== ctx.regime)
    violations.push(`Regime override attempt: ${parsed.regime} vs ${ctx.regime}`);
  // Governance: no hallucinated scores
  if (parsed.compositeScore && Math.abs(parsed.compositeScore - ctx.compositeScore) > 5)
    violations.push("Score deviation detected");
  // Forbidden language check
  const allText = JSON.stringify(parsed).toLowerCase();
  for (const p of FORBIDDEN_PHRASES) {
    if (allText.includes(p.toLowerCase())) violations.push(`Forbidden phrase: "${p}"`);
  }
  return { valid: violations.length === 0, violations };
}

// Priority 9: validateOverviewResponse — FSD DEF-NEW-004
// Validates compositeScore range, regime enum, confidence range.
// On failure: logs VALIDATION_FAILED, returns false (caller serves stale cache).
function validateOverviewResponse(payload) {
  const violations = [];
  if (!payload || typeof payload !== "object") return { valid: false, violations: ["Not an object"] };
  const cs = payload.compositeScore;
  if (cs !== null && cs !== undefined) {
    if (typeof cs.score !== "number" || cs.score < 0 || cs.score > 100)
      violations.push(`compositeScore.score out of range: ${cs.score}`);
    const VALID_REGIMES = ["STRONG_RISK_ON","RISK_ON","NEUTRAL","RISK_OFF","STRONG_RISK_OFF"];
    if (cs.regime && !VALID_REGIMES.includes(cs.regime))
      violations.push(`Invalid regime enum: ${cs.regime}`);
  }
  const conf = payload.confidence;
  if (conf !== null && conf !== undefined) {
    if (typeof conf.overall === "number" && (conf.overall < 0 || conf.overall > 1))
      violations.push(`Confidence out of range: ${conf.overall}`);
  }
  if (violations.length > 0) {
    logger.warn({ job: "validateOverviewResponse", violations }, "VALIDATION_FAILED: overview payload");
  }
  return { valid: violations.length === 0, violations };
}

// Priority 9: validateMacroSynthesis — FSD DEF-NEW-004
// Validates FRED/BLS key fields present and in expected ranges.
// On failure: logs VALIDATION_FAILED, returns false.
function validateMacroSynthesis(fredData, blsData) {
  const violations = [];
  if (fredData) {
    if (fredData.us10YYield !== null && fredData.us10YYield !== undefined) {
      if (typeof fredData.us10YYield !== "number" || fredData.us10YYield < 0 || fredData.us10YYield > 20)
        violations.push(`us10YYield out of range: ${fredData.us10YYield}`);
    }
    if (fredData.fedFundsRate !== null && fredData.fedFundsRate !== undefined) {
      if (typeof fredData.fedFundsRate !== "number" || fredData.fedFundsRate < 0 || fredData.fedFundsRate > 25)
        violations.push(`fedFundsRate out of range: ${fredData.fedFundsRate}`);
    }
    if (fredData.yieldSpread10_2 !== null && fredData.yieldSpread10_2 !== undefined) {
      if (typeof fredData.yieldSpread10_2 !== "number" || Math.abs(fredData.yieldSpread10_2) > 10)
        violations.push(`yieldSpread10_2 out of range: ${fredData.yieldSpread10_2}`);
    }
  }
  if (blsData) {
    if (blsData.usUnemployment !== null && blsData.usUnemployment !== undefined) {
      if (typeof blsData.usUnemployment !== "number" || blsData.usUnemployment < 0 || blsData.usUnemployment > 30)
        violations.push(`usUnemployment out of range: ${blsData.usUnemployment}`);
    }
  }
  if (violations.length > 0) {
    logger.warn({ job: "validateMacroSynthesis", violations }, "VALIDATION_FAILED: macro synthesis");
  }
  return { valid: violations.length === 0, violations };
}

// LLM circuit breaker
const LLMCircuitBreaker = (() => {
  let failures = 0, lastFailure = null, open = false;
  const THRESHOLD = 3, COOLDOWN_MS = 300000;
  return {
    recordFailure() {
      failures++; lastFailure = Date.now();
      if (failures >= THRESHOLD) {
        open = true;
        logger.warn({ failures, cooldownMs: COOLDOWN_MS }, "LLM circuit breaker OPEN — falling back to rule-based");
        persistCBState(failures, true); // A2
        setTimeout(() => {
          open = false; failures = 0;
          logger.info("LLM circuit breaker CLOSED");
          persistCBState(0, false); // A2
        }, COOLDOWN_MS);
      } else {
        persistCBState(failures, false); // A2
      }
    },
    recordSuccess() { failures = 0; open = false; persistCBState(0, false); }, // A2
    isOpen() { return open; },
    getState() { return { open, failures, lastFailure }; },
    async restoreFromDB() { // A2: called on startup
      try {
        const s = await loadCBState();
        if (s.isOpen) {
          open = true; failures = s.failures;
          logger.warn({ failures }, 'LLM CB restored as OPEN from DB');
          setTimeout(() => { open = false; failures = 0; persistCBState(0, false); logger.info('LLM CB CLOSED after restart cooldown'); }, COOLDOWN_MS);
        } else { failures = s.failures; if (failures > 0) logger.info({ failures }, 'LLM CB failure count restored'); }
      } catch(e) { logger.warn({ err: e.message }, 'CB restore failed'); }
    },
  };
})();

// Build narrative prompt from curated context
function buildNarrativePrompt(ctx, audience = "IFA Advisory Pitch", riskProfile = "Moderate") {
  const tone = NarrativeGovernanceRules.applyToneModifier(ctx.confidence || 0);
  const degradedNote = ctx.fallbackModules?.length > 0
    ? `DATA NOTE: ${ctx.fallbackModules.join(", ")} modules on fallback — reflect uncertainty.`
    : "";

  // Audience communication contracts — 10-point behavioral spec per segment
  const AUDIENCE_CONTRACTS = {
    "IFA Advisory Pitch": {
      who: "Independent Financial Advisor briefing retail clients today",
      objective: "Give the IFA a clear, confident posture they can relay verbatim to a client",
      language: "Plain English. No jargon. Short sentences. Think: trusted advisor on a phone call.",
      forbidden: "RSI, MACD, DMA, EMA, Bollinger, basis points, yield spread, technical indicator names or raw values",
      translate: "Momentum weakening not RSI 39. Market anxious not VIX 17.9. US rates a headwind not 10Y at 4.57%.",
      keyDrivers: "3 plain-English reasons why the market feels the way it does. Client-ready.",
      tacticalView: "One actionable allocation posture the IFA can recommend. Concrete and simple.",
      tone: "Warm, confident, reassuring or cautionary as regime warrants. No hedging every sentence.",
    },
    "Retail Investor": {
      who: "Individual retail investor making their own decisions",
      objective: "Help them understand what the market is doing and what to do with their SIP/portfolio",
      language: "Everyday language. Relatable analogies. Avoid all financial jargon.",
      forbidden: "All technical indicators, macro acronyms, institutional terminology",
      translate: "Market is cautious not NEUTRAL regime. Good time to keep investing steadily not staggered deployment.",
      keyDrivers: "3 simple reasons in everyday language. Why should a regular person care?",
      tacticalView: "Stay invested / reduce / accumulate — in plain words with a simple reason.",
      tone: "Encouraging, honest, calm. Never alarmist. Never condescending.",
    },
    "HNI Investor": {
      who: "High Net Worth Individual with financial literacy, managing significant personal wealth",
      objective: "Regime-aware positioning advice with tax and concentration awareness",
      language: "Semi-professional. Can use allocation terms (equity/debt/gold). Avoid deep quant jargon.",
      forbidden: "Raw technical indicator values, quant terminology, derivative Greeks",
      translate: "Selling pressure building not MACD bearish. Elevated nervousness not VIX 17.9.",
      keyDrivers: "3 market dynamics relevant to portfolio allocation decisions.",
      tacticalView: "Portfolio posture — equity tilt, cash level, defensive allocation. Wealth-aware language.",
      tone: "Confident, sophisticated but accessible. Peer-to-peer advisory feel.",
    },
    "Family Office Risk Brief": {
      who: "Family Office CIO or investment committee reviewing portfolio risk",
      objective: "Regime-aware risk budget assessment — what is the downside, what needs protecting",
      language: "Formal, institutional, risk-first. Committee memo style.",
      forbidden: "Technical indicator names and raw values, speculative language, retail framing",
      translate: "Downside momentum building not MACD sell. Investor nervousness elevated not VIX 17.9. Rates a valuation headwind not US 10Y 4.57%.",
      keyDrivers: "3 specific risk signals framed as portfolio risk factors. What threatens capital preservation?",
      tacticalView: "Risk budget recommendation — reduce/maintain/deploy. Asset class tilts. Capital protection first.",
      tone: "Sober, measured, accountable. Every sentence defensible in a committee meeting.",
    },
    "Private Banker Advisory": {
      who: "Private Banker serving UHNW clients with multi-asset portfolios",
      objective: "Institutional-grade narrative suitable for client advisory conversations",
      language: "Goldman Sachs weekly note style. Precise, authoritative, narrative-grade.",
      forbidden: "Retail framing, raw technical values, generic phrases like await confirmation",
      translate: "Short-term trend has reversed not MACD sell. Elevated market risk premium not VIX 17.9. Monetary tightening cycle constraining multiples not Fed restrictive.",
      keyDrivers: "3 macro and market dynamics at institutional communication level. Name the mechanism not just the indicator.",
      tacticalView: "Risk-adjusted positioning with nuance. Opportunity vs risk framing. Sophisticated.",
      tone: "Authoritative, measured, institutional. Conveys expertise and judgment.",
    },
    "Advanced Investor Dashboard": {
      who: "Sophisticated self-directed investor who reads raw signals directly",
      objective: "Signal-level synthesis — what do the indicators say together that they don't say alone",
      language: "Direct, analytical, quantitative. Name indicators explicitly with values.",
      forbidden: "Generic summaries, vague language, anything a retail investor would need explained",
      translate: "Do NOT translate. RSI 39.13 is correct. VIX 17.91 is correct. US 10Y 4.57% is correct.",
      keyDrivers: "3 specific signal readings with values and directional implications. Name the tension if signals conflict.",
      tacticalView: "Tactical entry/exit posture based on regime + technical confluence. Specific.",
      tone: "Terse, precise, signal-first. Respect the reader's expertise.",
    },
    "Institutional Strategy Desk": {
      who: "Buy-side or sell-side strategist building market views for internal distribution",
      objective: "Regime characterisation with macro transmission and factor-level signal synthesis",
      language: "Full institutional vocabulary. Cross-asset, factor-aware, regime-framed.",
      forbidden: "Retail language, vague posture statements, generic recommendations",
      translate: "Do NOT translate. Use precise institutional language throughout.",
      keyDrivers: "3 factor-level or macro-level signals with directional regime implication.",
      tacticalView: "Factor tilt recommendation — growth/value/defensive, duration, EM positioning.",
      tone: "Analytical, precise, internally consistent. Research-note quality.",
    },
    "Conservative Retiree": {
      who: "Retired individual focused on capital preservation and income, low risk tolerance",
      objective: "Reassure or caution — is the market safe enough for their savings?",
      language: "Simple, warm, reassuring. No jargon whatsoever. Income and safety framing.",
      forbidden: "All technical terms, macro jargon, aggressive deployment language",
      translate: "Markets are calm and relatively stable not LOW volatility. Your investments are likely stable not NEUTRAL regime.",
      keyDrivers: "3 simple observations about market safety and stability. Income-preservation lens.",
      tacticalView: "Stay in safe assets / modest equity exposure / income focus. Preservation-first.",
      tone: "Calm, reassuring, protective. Never alarming. Never pushes risk-taking.",
    },
    "Aggressive Growth Investor": {
      who: "High-conviction growth investor willing to take concentrated positions for upside",
      objective: "Where is the opportunity? What signals support or undermine a bullish thesis?",
      language: "Direct, opportunity-focused, willing to name upside and downside explicitly.",
      forbidden: "Overly cautious hedging, capital preservation framing, defensive language unless regime demands",
      translate: "Momentum fading is fine to say. Buying pressure building is fine. Be direct about signal direction.",
      keyDrivers: "3 signals that either support or challenge the growth thesis. Honest about conflicts.",
      tacticalView: "Tactical allocation — where to add, where to trim, what the regime supports.",
      tone: "Energetic, direct, conviction-driven. Honest about risk but focused on opportunity.",
    },
  };

  const contract = AUDIENCE_CONTRACTS[audience] || AUDIENCE_CONTRACTS["IFA Advisory Pitch"];

  const regimeFrame =
    (ctx.compositeScore||50) >= 65 ? "BULLISH: Strong momentum. Story is about measured participation before conviction builds further." :
    (ctx.compositeScore||50) >= 55 ? "MILD BULLISH: Leaning positive, not decisively. Story is selective deployment — quality over quantity." :
    (ctx.compositeScore||50) >= 48 ? "BALANCED: Range-bound, no directional conviction. Story is patience — preserve optionality, watch for regime break." :
    (ctx.compositeScore||50) >= 38 ? "MILD DEFENSIVE: Early stress signals. Story is gradual reduction — tilt to quality, keep powder dry." :
    "DEFENSIVE: Clear pressure. Story is capital preservation — reduce equity, increase defensive allocation.";

  // 15-combination audience x risk profile behavioral matrix
  const RISK_PROFILE_BY_AUDIENCE = {
    "IFA Advisory Pitch": {
      Conservative: "Client is risk-averse. IFA must reassure — emphasise stability, SIP continuity, avoid any language suggesting volatility or loss. No aggressive deployment.",
      Moderate:     "Client wants steady growth. IFA recommends staggered deployment, balanced equity-debt mix. Avoid extremes in either direction.",
      Aggressive:   "Client wants growth. IFA can recommend overweight equity, tactical deployment on dips. Upside language appropriate if regime supports.",
    },
    "Retail Investor": {
      Conservative: "Investor is nervous about losing money. Keep it simple and reassuring. SIP is safe. No dramatic language.",
      Moderate:     "Investor wants their money to grow steadily. Stay invested message. Calm, encouraging.",
      Aggressive:   "Investor wants maximum growth. Can discuss adding to equity, buying on dips. Enthusiastic but honest about risk.",
    },
    "HNI Investor": {
      Conservative: "HNI prioritises capital protection over returns. Recommend quality large-caps, sovereign bonds, gold allocation. Avoid concentrated bets.",
      Moderate:     "HNI wants growth with protection. Balanced tilt — quality equity, some debt, tactical gold. Staggered deployment.",
      Aggressive:   "HNI is comfortable with concentration and risk. Can discuss tactical themes, mid-cap exposure, sector tilts where regime supports.",
    },
    "Family Office Risk Brief": {
      Conservative: "Committee is in capital preservation mode. Every recommendation must have downside protection rationale. Risk budget is tight.",
      Moderate:     "Committee is balancing preservation and growth. Selective deployment, quality bias, diversified across asset classes.",
      Aggressive:   "Committee is in growth deployment mode. Can discuss equity overweight, thematic exposure, tactical leverage where regime supports.",
    },
    "Private Banker Advisory": {
      Conservative: "UHNW client wants wealth protection. Emphasise downside risk management, alternatives, capital preservation structures. Measured language.",
      Moderate:     "UHNW client wants risk-adjusted growth. Balanced multi-asset approach. Institutional quality language throughout.",
      Aggressive:   "UHNW client is seeking alpha. Can discuss concentrated equity, thematic bets, tactical deployment. Sophisticated upside framing.",
    },
    "Advanced Investor Dashboard": {
      Conservative: "Sophisticated investor is in risk-off mode personally. Show signal conflicts. Flag downside risks explicitly. Technical precision.",
      Moderate:     "Sophisticated investor wants balanced signal read. Show both bull and bear case from signals. Let them decide.",
      Aggressive:   "Sophisticated investor is hunting for entries. Highlight bullish signals, name where momentum could build. Direct and conviction-driven.",
    },
    "Institutional Strategy Desk": {
      Conservative: "Desk is in defensive positioning mode. Factor tilts toward quality, low-vol, short duration. EM underweight rationale.",
      Moderate:     "Desk is benchmark-aware. Balanced factor exposure. Duration neutral. EM positioning per regime signal.",
      Aggressive:   "Desk is risk-on. Growth over value, long duration if yield curve supports, EM overweight if global signals constructive.",
    },
    "Conservative Retiree": {
      Conservative: "Retiree is extremely risk-averse. Income and capital safety only. Any volatility mention must be immediately reassured.",
      Moderate:     "Retiree wants modest growth without sleepless nights. Steady income focus, small equity exposure for inflation protection.",
      Aggressive:   "Retiree willing to take some risk for better returns. Can suggest modest equity tilt but always with capital safety as anchor.",
    },
    "Aggressive Growth Investor": {
      Conservative: "Growth investor is temporarily cautious. Acknowledge the pullback, identify re-entry signals, maintain growth thesis but protect capital short-term.",
      Moderate:     "Growth investor wants selective deployment. Quality growth names, staggered entry, watch for momentum confirmation.",
      Aggressive:   "Growth investor is fully risk-on. Maximum equity deployment where regime supports. Name the opportunity directly. Conviction language.",
    },
    "Wealth Manager Synthesis": {
      Conservative: "Wealth manager's book is in defensive mode. Cross-asset tilt toward debt and gold. Equity underweight with quality bias.",
      Moderate:     "Wealth manager running balanced book. Equity-debt-gold allocation with regime-aware tilts. Staggered rebalancing.",
      Aggressive:   "Wealth manager is deploying aggressively. Equity overweight, reduce debt, tactical gold. Cross-asset momentum framing.",
    },
  };
  const _audienceRiskMap = RISK_PROFILE_BY_AUDIENCE[audience] || RISK_PROFILE_BY_AUDIENCE["IFA Advisory Pitch"];
  const riskCtx = _audienceRiskMap[riskProfile] || _audienceRiskMap["Moderate"];

  const prompt = `You are ADVISIQ DSS — a deterministic Indian equity market intelligence system. Generate a narrative for the audience below. Follow all contracts exactly.

MARKET STATE:
- Score: ${ctx.compositeScore}/100 | Regime: ${ctx.regime} (${ctx.regimeLabel||ctx.regime}) | Confidence: ${Math.round((ctx.confidence||0)*100)}%
- Action Bias: ${ctx.actionBias||"Balanced"} | Volatility: ${ctx.volatilityState||"unknown"}
- Signal Basis: ${ctx.reasoningChain||"insufficient data"}
- Risk Flags: ${(ctx.riskFlags||[]).join(", ")||"none"}
- Macro: ${[ctx.macroState?.repoRate!=null?"Repo "+ctx.macroState.repoRate+"%":null, ctx.macroState?.us10Y!=null?"US 10Y "+ctx.macroState.us10Y+"%":null, ctx.macroState?.dxy!=null?"DXY "+ctx.macroState.dxy:null, ctx.macroState?.crudeBrent!=null?"Brent $"+ctx.macroState.crudeBrent:null, ctx.macroState?.fedStance?"Fed "+ctx.macroState.fedStance:null, ctx.macroState?.yieldCurve?"Yield Curve "+ctx.macroState.yieldCurve:null].filter(Boolean).join(" | ")||"Macro data limited"}
${degradedNote}

REGIME FRAME: ${regimeFrame}${ctx.stabilityHint || ""}
RISK PROFILE: ${riskCtx}

AUDIENCE CONTRACT — ${audience}:
- WHO: ${contract.who}
- OBJECTIVE: ${contract.objective}
- LANGUAGE: ${contract.language}
- FORBIDDEN IN OUTPUT: ${contract.forbidden}
- SIGNAL TRANSLATION: ${contract.translate}
- keyDrivers FORMAT: ${contract.keyDrivers}
- tacticalView FORMAT: ${contract.tacticalView}
- TONE: ${contract.tone}

GOVERNANCE (non-negotiable):
- Do NOT override score, regime, or action bias
- Do NOT infer data not provided above
- Do NOT recommend specific stocks
- Do NOT use forbidden language for this audience

Respond ONLY with valid JSON — no markdown, no preamble:
{
  "summary": "2-3 sentences — market posture in this audience's language",
  "marketTone": "CAUTIOUS|MEASURED|BALANCED|CONSTRUCTIVE|CONFIDENT",
  "keyDrivers": ["driver 1", "driver 2", "driver 3"],
  "riskFlags": ["risk 1", "risk 2"],
  "tacticalView": "1-2 sentence positioning statement in this audience's language",
  "macroContext": "1 sentence — most relevant US/global macro factor and its India transmission implication. Include only if FRED/BLS data available.",
  "confidenceNote": "1 sentence — limiting factor on confidence. Include ONLY if system confidence below 0.60. Omit entirely if confidence >= 0.60.",
  "confidenceAlignment": true
}`;

  return { prompt, promptVersion: PROMPT_VERSION, tone, audience };
}

// Mock Adapter — validates orchestration without real inference
async function mockAdapter(ctx, audience) {
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));
  const tone = NarrativeGovernanceRules.applyToneModifier(ctx.confidence || 0);
  return {
    summary: `[MOCK] Market is in ${ctx.regime} regime with composite score ${ctx.compositeScore}/100. Confidence is ${Math.round((ctx.confidence||0)*100)}%.`,
    marketTone: tone === "CAUTIOUS" ? "CAUTIOUS" : tone === "MEASURED" ? "MEASURED" : "BALANCED",
    keyDrivers: ctx.topDrivers?.slice(0,3) || ["technical", "equity"],
    riskFlags: ctx.riskFlags?.slice(0,2) || [],
    tacticalView: `[MOCK] ${ctx.actionBias || "Balanced allocation recommended."}`,
    confidenceAlignment: true,
  };
}

// Groq Adapter
async function groqAdapter(ctx, audience, riskProfile="Moderate") {
  if (!LLM_CONFIG.groqKey) throw new Error("GROQ_API_KEY not configured");
  const { prompt } = buildNarrativePrompt(ctx, audience, riskProfile);
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_CONFIG.timeoutMs);
  try {
    const res = await fetch(LLM_CONFIG.groqUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LLM_CONFIG.groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_CONFIG.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: LLM_CONFIG.maxTokens,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    if (!raw) throw new Error("Empty Groq response");
    const latencyMs = Date.now() - t0;
    const parsed = JSON.parse(raw.slice(0, LLM_CONFIG.maxRespChars));
    return { ...parsed, _latencyMs: latencyMs, _model: LLM_CONFIG.model };
  } finally {
    clearTimeout(timer);
  }
}

// Rule-based fallback adapter (always works, no external dependency)
function ruleBasedAdapter(ctx) {
  const tone = NarrativeGovernanceRules.applyToneModifier(ctx.confidence || 0);
  const score = ctx.compositeScore || 50;
  const regime = ctx.regime || "NEUTRAL";
  const summaries = {
    STRONG_RISK_ON:  `Market conditions are strongly bullish with composite score ${score}/100. Broad participation and positive momentum support risk-on positioning.`,
    RISK_ON:         `Market posture is constructive with composite score ${score}/100. Technical and fundamental signals favour selective equity accumulation.`,
    NEUTRAL:         `Market conditions are balanced with composite score ${score}/100. Directional conviction is limited; await regime confirmation before increasing exposure.`,
    RISK_OFF:        `Risk-off dynamics are emerging with composite score ${score}/100. Defensiveness is warranted; reduce cyclical exposure and build liquidity.`,
    STRONG_RISK_OFF: `Market conditions are significantly deteriorated with composite score ${score}/100. Capital preservation is the primary objective.`,
  };
  const regimeKey = regime.replace(/ /g,"_");
  const summary = summaries[regimeKey] || summaries["NEUTRAL"];
  const confidenceNote = ctx.confidence < 0.40
    ? ` Data quality is reduced — ${(ctx.fallbackModules||[]).join(", ")} operating on fallback values.` : "";
  return {
    summary: summary + confidenceNote,
    marketTone: tone === "CAUTIOUS" ? "CAUTIOUS" : score >= 60 ? "CONSTRUCTIVE" : score <= 40 ? "CAUTIOUS" : "MEASURED",
    keyDrivers: ctx.topDrivers?.slice(0,3) || [],
    riskFlags:  ctx.riskFlags?.slice(0,2)  || [],
    tacticalView: ctx.actionBias || "Balanced allocation. Await regime confirmation.",
    confidenceAlignment: true,
  };
}


// P1-A: isRegimeReady() — cold start guard (v8 DEF-NEW-001)
// Prevents generateNarrative() from running before RegimeEngine
// completes first compute. Eliminates null/100 in narrative output.
function isRegimeReady(cache) {
  const r = cache.get('regime:composite');
  return r !== null &&
         r !== undefined &&
         r.compositeScore !== null &&
         r.compositeScore !== undefined &&
         ['STRONG_RISK_ON', 'RISK_ON', 'NEUTRAL', 'RISK_OFF', 'STRONG_RISK_OFF']
           .includes(r.regime);
}

// Main narrative generator — provider abstraction layer
async function generateNarrative(audience = "IFA Advisory Pitch", riskProfile = "Moderate") {
  const t0 = Date.now();

  // P1-A: cold start guard — return COLD_START fallback if regime not ready
  if (!isRegimeReady(DSSCache)) {
    const _coldCtx = buildNarrativeContext(DSSCache);
    logger.warn({ job: "narrative-generate", reason: "COLD_START" }, "isRegimeReady false — returning cold start fallback");
    return {
      ...ruleBasedAdapter(_coldCtx),
      narrativeMeta: {
        provider:             "rulebased",
        model:                null,
        promptVersion:        "cold-start-guard",
        audience,
        riskProfile,
        tone:                 "CAUTIOUS",
        latencyMs:            Date.now() - t0,
        responseValid:        false,
        fallbackUsed:         true,
        fallbackReason:       "COLD_START",
        governanceViolations: [],
        circuitBreakerState:  LLMCircuitBreaker.getState(),
        generatedAt:          Date.now(),
        contextConfidence:    _coldCtx.confidence,
        contextRegime:        _coldCtx.regime,
      },
      governanceApplied: true,
      disclaimer: "System warming up — RegimeEngine has not completed first compute. Retry in 30 seconds.",
    };
  }

  // FSD 11.3: Phase 7 — supplement narrative context with brain:latest
  const _brainSupplement = DSSCache.get("brain:latest") || null;
  const ctx = {
    ...buildNarrativeContext(DSSCache),
    // brain:latest enrichment — adds intelligence fields not in base context
    brainIntelligence: _brainSupplement ? {
      macroModifier:    _brainSupplement.macroModifier    ?? null,
      macroModifierLog: _brainSupplement.macroModifierLog ?? [],
      activeWeightSum:  _brainSupplement.activeWeightSum  ?? null,
      scheduledAt:      _brainSupplement.scheduledAt      ?? null,
    } : null,
  };
  const provider = LLM_CONFIG.provider;
  let raw = null, fallbackUsed = false, governanceViolations = [], latencyMs = 0;
  // FSD 10.5: Narrative stability — prevent tone oscillation during stable regimes
  // If regime unchanged AND score delta < 5pts AND prev narrative exists → inject tone hint
  const _prevNarrative = DSSCache.get("narrative:llm") || null;
  const _prevTone = _prevNarrative?.marketTone || null;
  const _prevRegime = _prevNarrative?.narrativeMeta?.contextRegime || null;
  const _prevScore = _prevNarrative?.narrativeMeta?.contextConfidence || null;
  const _scoreDelta = (ctx.compositeScore !== null && _prevNarrative?.narrativeMeta?.contextRegime)
    ? Math.abs((ctx.compositeScore || 50) - (_prevNarrative?.compositeScore || 50))
    : 99;
  const _stableRegime = _prevRegime === ctx.regime && _scoreDelta < 5 && _prevTone;
  const _stabilityHint = _stableRegime
    ? `
STABILITY CONTEXT: The regime has been ${ctx.regime} and tone was ${_prevTone} in the previous narrative. Score has moved less than 5 points. Maintain consistent ${_prevTone} tone unless signals strongly justify a change.`
    : "";
  const _stableCtx = { ...ctx, stabilityHint: _stabilityHint, prevMarketTone: _stableRegime ? _prevTone : null };
  const promptMeta = buildNarrativePrompt(_stableCtx, audience, riskProfile);

  // Attempt primary provider
  if (provider !== "rulebased" && !LLMCircuitBreaker.isOpen()) {
    try {
      if (provider === "mock") raw = await mockAdapter(ctx, audience);
      else if (provider === "groq") raw = await groqAdapter(ctx, audience, riskProfile);
      if (raw) {
        const validation = validateNarrativeOutput(raw, ctx);
        if (!validation.valid) {
          governanceViolations = validation.violations;
          logger.warn({ violations: validation.violations }, "LLM narrative governance violation — falling back");
          LLMCircuitBreaker.recordFailure();
          raw = null;
        } else {
          LLMCircuitBreaker.recordSuccess();
          raw = { ...raw, summary: sanitizeNarrativeText(raw.summary), tacticalView: sanitizeNarrativeText(raw.tacticalView) };
        }
      }
    } catch (err) {
      logger.warn({ provider, err: err.message }, "LLM adapter failed — falling back to rule-based");
      LLMCircuitBreaker.recordFailure();
      raw = null;
    }
  } else if (LLMCircuitBreaker.isOpen()) {
    logger.info("LLM circuit breaker open — using rule-based directly");
  }

  // Fallback to rule-based
  if (!raw) {
    raw = ruleBasedAdapter(ctx);
    fallbackUsed = true;
  }

  latencyMs = Date.now() - t0;

  // FSD 10.2: deterministic confidenceNote — present only when confidence < 0.60
  const _confNote = ctx.confidence < 0.60
    ? (() => {
        const _fb = (ctx.fallbackModules||[]);
        if (ctx.confidence < 0.40) return `Signal confidence is limited — ${_fb.length > 0 ? _fb.join(", ") + " using estimated values" : "multiple data sources degraded"}. Exercise additional caution in advisory use.`;
        return `Signal confidence is moderate — ${_fb.length > 0 ? _fb.join(", ") + " using estimated values" : "some inputs are estimated"}. Full confirmation pending additional live data.`;
      })()
    : null;

  // FSD 10.2: deterministic macroContext — strongest active US→India transmission signal
  const _macroCtx = (() => {
    const _fred = DSSCache.get("macro:fred") || {};
    const _bls  = DSSCache.get("macro:bls")  || {};
    const _rss  = DSSCache.get("macro:fedrss") || {};
    const _glob = DSSCache.get("equity:global") || {};
    if (!_fred.us10YYield && !_glob.dxy && !_glob.crudeOil) return null;
    // Select the strongest transmission signal
    const _spread = _fred.yieldSpread10_2 ?? null;
    const _us10Y  = _fred.us10YYield ?? null;
    const _dxy    = _glob.dxy ?? null;
    const _crude  = _glob.crudeOil ?? null;
    const _tone   = _rss.overallTone ?? null;
    if (_spread !== null && _spread < -0.20)
      return `US yield curve is inverted (spread ${_spread.toFixed(2)}%) — historically a recession warning signal that typically dampens EM risk appetite and FII flows into India.`;
    if (_us10Y !== null && _us10Y > 4.5)
      return `Elevated US 10-year yield at ${_us10Y}% raises the global risk-free rate benchmark, compressing India equity valuations and increasing the hurdle rate for FII allocations.`;
    if (_tone === "HAWKISH")
      return `US Federal Reserve communications reflect a hawkish policy stance, signalling tighter liquidity conditions that typically reduce appetite for emerging market risk assets including India.`;
    if (_dxy !== null && _dxy > 106)
      return `A strong US Dollar (DXY ${_dxy}) typically triggers FII outflows from India as emerging market assets become less attractive in dollar terms.`;
    if (_crude !== null && _crude > 90)
      return `Elevated Brent crude at $${_crude}/bbl pressures India's current account deficit, adding macro headwind to equity market performance.`;
    if (_dxy !== null && _dxy < 102)
      return `A weaker US Dollar (DXY ${_dxy}) is supportive for India — typically associated with FII inflows and improved EM risk appetite.`;
    if (_crude !== null && _crude < 75)
      return `Declining Brent crude at $${_crude}/bbl relieves pressure on India's current account deficit, providing a positive macro tailwind for equity markets.`;
    if (_us10Y !== null)
      return `US 10-year yield at ${_us10Y}% is within a range that provides moderate support for EM valuations, with no acute pressure on India equity risk premium currently.`;
    return null;
  })();

  // Inject deterministic fields into raw if not already provided by LLM
  if (raw) {
    if (!raw.confidenceNote && _confNote) raw = { ...raw, confidenceNote: _confNote };
    if (!raw.macroContext   && _macroCtx) raw = { ...raw, macroContext:   _macroCtx };
  }

  const narrativeMeta = {
    provider:            fallbackUsed ? "rulebased" : provider,
    model:               fallbackUsed ? null : LLM_CONFIG.model,
    promptVersion:       promptMeta.promptVersion,
    audience,
    riskProfile,
    tone:                promptMeta.tone,
    latencyMs,
    responseValid:       governanceViolations.length === 0,
    fallbackUsed,
    governanceViolations,
    circuitBreakerState: LLMCircuitBreaker.getState(),
    generatedAt:         Date.now(),
    contextConfidence:   ctx.confidence,
    contextRegime:       ctx.regime,
    confidenceNotePresent: !!_confNote,
    macroContextPresent:   !!_macroCtx,
    warmupActive:          !_brainSupplement,
    durabilityScore:       _brainSupplement ? (_brainSupplement.durabilityScore  ?? null) : null,
    durabilityClass:       _brainSupplement ? (_brainSupplement.durabilityClass  ?? null) : null,
    cyclesSinceChange:     _brainSupplement ? (_brainSupplement.cyclesSinceChange ?? null) : null,
    // v9 Sprint 2: Conviction
    convictionScore:       _brainSupplement ? (_brainSupplement.convictionScore      ?? null) : null,
    convictionClass:       _brainSupplement ? (_brainSupplement.convictionClass      ?? null) : null,
    convictionComponents:  _brainSupplement ? (_brainSupplement.convictionComponents ?? null) : null,
    convictionTrajectory:  _brainSupplement ? (_brainSupplement.convictionTrajectory ?? null) : null,
  };

  logger.info({ job: "narrative-generate", provider: narrativeMeta.provider, fallback: fallbackUsed, latencyMs }, "Narrative generated");

  // H1: Apply Final Governance Sanitizer
  const _brainLatestForFgs = DSSCache.get('brain:latest') || null;
  let _fgsResult = { executed: false, failureFallback: false, sanitizationsApplied: 0, categoriesTriggered: [], convictionDowngradesApplied: 0, suppressionsApplied: 0, sanitizerVersion: FGS_VERSION };
  try {
    const _fgsOut = fgsSanitize(raw, narrativeMeta, _brainLatestForFgs);
    raw = _fgsOut.narrative;
    _fgsResult = _fgsOut.fgsResult;
  } catch(e) {
    logger.error({ err: e.message }, 'FGS failed — serving ruleBasedAdapter fallback');
    raw = ruleBasedAdapter(ctx);
    _fgsResult = { executed: false, failureFallback: true, sanitizationsApplied: 0, categoriesTriggered: [], convictionDowngradesApplied: 0, suppressionsApplied: 0, sanitizerVersion: FGS_VERSION };
  }
  // H2: Detect uncertainty mode
  const _uncertaintyMode = detectUncertaintyMode(narrativeMeta, _brainLatestForFgs);
  // H3: Detect mature regime reversal
  const _dur = _brainLatestForFgs && _brainLatestForFgs.durabilityClass || 'EMERGING';
  const _reg = _brainLatestForFgs && _brainLatestForFgs.regime || ctx.regime;
  const _cyc = _brainLatestForFgs && typeof _brainLatestForFgs.cyclesSinceChange === 'number' ? _brainLatestForFgs.cyclesSinceChange : 0;
  const _reversalState = detectMatureRegimeReversal(_reg, _dur, _cyc);
  // H4: Escalation caps
  const _convClass = _brainLatestForFgs && _brainLatestForFgs.convictionClass || null;
  const _convScore = _brainLatestForFgs && _brainLatestForFgs.convictionScore || null;
  const _conf = ctx.confidence || 0.50;
  const _fbMods = _brainLatestForFgs && _brainLatestForFgs.fallbackModules ? _brainLatestForFgs.fallbackModules.length : 0;
  const _escalationCheck = convictionConsistencyValidation('ACT', _convClass, _convScore, _dur, _conf, _reversalState.matureRegimeReversal, _fbMods);

  // R1: Generate replay ID (deterministic hash of narrative inputs)
  const _replayId = narrativeContextHash(ctx, audience, riskProfile, PROMPT_VERSION);

  // R3: Contradiction detection — scan before render
  const _contradictions = scanContradictions(raw, ctx, {
    convictionClass: narrativeMeta.convictionClass,
    reversalWindowActive: narrativeMeta.reversalWindowActive || false,
    uncertaintyMode: narrativeMeta.uncertaintyMode || {},
  });
  if (_contradictions.length > 0) {
    narrativeMeta._contradictions = _contradictions;
    logger.warn({ job: 'contradiction-scan', replayId: _replayId, contradictions: _contradictions.map(c=>c.id) }, 'Narrative contradictions — governance review triggered');
  }

  // R4: Uncertainty language calibration — enforce institutional tone discipline
  const _calibResult = calibrateUncertaintyTone(raw, ctx, {
    ...narrativeMeta,
    uncertaintyMode: _uncertaintyMode,
    reversalWindowActive: _reversalState.reversalWindowActive,
  });
  if (_calibResult.violations && _calibResult.violations.length > 0) {
    raw = _calibResult.narrative;
    narrativeMeta._calibrationViolations = _calibResult.violations;
    narrativeMeta._calibrationApplied = true;
  }

  // R1: Log provenance
  logNarrativeProvenance({
    replayId: _replayId,
    audience,
    riskProfile,
    provider: narrativeMeta.provider,
    model: narrativeMeta.model,
    promptVersion: narrativeMeta.promptVersion,
    regime: ctx.regime,
    confidenceClass: ctx.confidenceClass,
    fallbackUsed: fallbackUsed,
    fallbackReason: fallbackUsed ? (LLMCircuitBreaker.isOpen() ? 'CIRCUIT_BREAKER_OPEN' : 'LLM_ERROR') : null,
    latencyMs: latencyMs,
    governanceViolations: governanceViolations,
    contradictions: _contradictions,
    uncertaintyActive: _uncertaintyMode.active,
    reversalActive: _reversalState.reversalWindowActive,
    fgsSanitizations: _fgsResult.sanitizationsApplied,
    degradationActive: (ctx.fallbackModules || []).length > 0,
  });

  // R2: Store in replay store (prompt payload snapshot — no portfolio values)
  REPLAY_STORE.push({
    replayId: _replayId,
    storedAt: Date.now(),
    audience,
    riskProfile,
    promptVersion: PROMPT_VERSION,
    model: LLM_CONFIG.model,
    provider: narrativeMeta.provider,
    contextSnapshot: {
      regime: ctx.regime,
      compositeScore: ctx.compositeScore,
      confidence: ctx.confidence,
      confidenceClass: ctx.confidenceClass,
      fallbackModules: ctx.fallbackModules || [],
      degradedModules: ctx.degradedModules || [],
    },
    narrativeStructure: {
      marketTone: raw.marketTone,
      hasSummary: !!raw.summary,
      hasKeyDrivers: Array.isArray(raw.keyDrivers) && raw.keyDrivers.length > 0,
      hasTacticalView: !!raw.tacticalView,
      hasConfidenceNote: !!raw.confidenceNote,
    },
    contradictions: _contradictions,
    governanceViolations,
    calibrationApplied: !!narrativeMeta._calibrationApplied,
  });

  return {
    ...raw,
    narrativeMeta: {
      ...narrativeMeta,
      replayId: _replayId,
      contradictions: _contradictions,
      fgsResult: _fgsResult,
      uncertaintyMode: _uncertaintyMode,
      matureRegimeReversal: _reversalState.matureRegimeReversal,
      reversalWindowActive: _reversalState.reversalWindowActive,
      reversalWindowCyclesRemaining: _reversalState.reversalWindowCyclesRemaining,
      previousMatureRegime: _reversalState.previousMatureRegime,
      escalationCapsApplied: _escalationCheck.caps,
      toneGovernanceFlags: _fgsResult.categoriesTriggered
    },
    governanceApplied: true,
    disclaimer: ctx.confidence < 0.40
      ? "This narrative is generated under reduced data confidence. Some inputs use fallback values."
      : null,
  };
}

// Narrative cache — refreshed every 15 minutes by scheduler
let _narrativeCache = null;
let _narrativeCacheTs = 0;
const NARRATIVE_CACHE_TTL = 900000; // 15 minutes

async function refreshNarrativeCache(audience = "IFA Advisory Pitch") {
  try {
    const result = await generateNarrative(audience, riskProfile);
    _narrativeCache = result;
    _narrativeCacheTs = Date.now();
    DSSCache.set("narrative:llm", result);
    logger.info({ job: "narrative-cache-refresh", provider: result.narrativeMeta?.provider, fallback: result.narrativeMeta?.fallbackUsed }, "Narrative cache refreshed");
  } catch (err) {
    logger.error({ err: err.message }, "refreshNarrativeCache failed");
  }
}

// On-demand narrative generation API endpoint
// POST /api/v1/narrative/generate { audience }
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
// SECTION-19 : DERIVED MACRO SCORE ENGINE (PATCH E-7) → RegimeEngine (Session 18)
// Session 18 Step 2: score:* cache keys written by all signal engines.
// Provenance fields: sourceOrigin, fallbackActive, staleReason, cacheAgeMin
// SECTION-20 : EQUITY UI BUILDERS (KPI / Technical / Fundamental / Flows)
// SECTION-21 : SUPPORT RESISTANCE ENGINE
// SECTION-22 : MARKET SCORE ENGINE (computeMarketScore / computeFearGreed)
// SECTION-23 : BRAIN SIGNAL ENGINE (buildSignals / getRegime / intelligence)
// SECTION-24 : BRAIN NARRATIVE ENGINE (buildNarrative / buildAdvisory / interpretation)
// SECTION-24B: NARRATIVE ENGINE (NarrativeEngine / _buildRuleNarrative / narrative:compiled)
// SECTION-25 : SCHEDULER + JOBS (runNSEIndexJob / refreshEquityMacroCaches / setIntervals)
// SECTION-26 : API ROUTES (/api/v1/* / /brain-auto / /health / /api/v1/global)
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

const DATA_STATUS = Object.freeze({LIVE:"live",DEGRADED:"degraded",FALLBACK:"fallback",STALE:"stale",PARTIAL:"partial",DISCONNECTED:"disconnected",RECOVERING:"recovering",UNAVAILABLE:"unavailable"});
function buildProvenanceField(o){const ts=o.timestamp||Date.now();return{value:o.value??null,source:o.source||"unknown",degraded:o.degraded||false,fallback:o.fallback||false,stale:o.stale||false,confidence:Math.round((o.confidence??1.0)*100)/100,degradedReason:o.degradedReason||null,timestamp:ts,freshnessSeconds:Math.round((Date.now()-ts)/1000),dataStatus:o.fallback?"fallback":o.degraded?"degraded":o.stale?"stale":(o.value===null||o.value===undefined)?"unavailable":"live"};}
const CONFIDENCE_CLASS=Object.freeze({HIGH:"HIGH",MODERATE:"MODERATE",LOW:"LOW",DEGRADED:"DEGRADED",UNRELIABLE:"UNRELIABLE"});
const MOD_CONF_WEIGHTS=Object.freeze({equity:0.30,technical:0.20,global:0.20,derivatives:0.15,debt:0.10,sector:0.05});
function computeSystemConfidence(cache){try{const keys={equity:"score:equity",technical:"score:technical",global:"score:global",derivatives:"score:derivatives",debt:"score:debt",sector:"score:sector"};const mc={},deg=[],stale=[],fb=[],unavail=[];let wC=0,wT=0;for(const[key,ck]of Object.entries(keys)){const sc=cache.get(ck),w=MOD_CONF_WEIGHTS[key]||0;let c=0,st="unavailable";if(!sc||sc.score===null||sc.score===undefined){c=0.05;unavail.push(key);}else if(sc.fallbackActive===true||sc.sourceOrigin==="hardcoded-fallback"||sc.sourceOrigin==="bootstrap-fallback"){c=Math.min(sc.confidence||0.35,0.50);st="fallback";fb.push(key);}else if(sc.staleReason){c=Math.min(sc.confidence||0.55,0.70);st="stale";stale.push(key);}else{c=Math.min(sc.confidence||0.70,1.0);st=sc.confidence>=0.60?"live":"degraded";if(st==="degraded")deg.push(key);}mc[key]={confidence:Math.round(c*100)/100,status:st};wC+=c*w;wT+=w;}const ov=wT>0?Math.round((wC/wT)*100)/100:0;const cls=ov>=0.80?CONFIDENCE_CLASS.HIGH:ov>=0.60?CONFIDENCE_CLASS.MODERATE:ov>=0.40?CONFIDENCE_CLASS.LOW:ov>=0.20?CONFIDENCE_CLASS.DEGRADED:CONFIDENCE_CLASS.UNRELIABLE;const cov=Object.values(keys).filter(k=>{const s=cache.get(k);return s&&s.score!==null;}).length/6;return{overall:ov,overallPct:Math.round(ov*100),classification:cls,moduleCoverage:Math.round(cov*100)/100,degradedModules:deg,staleModules:stale,fallbackModules:fb,unavailableModules:unavail,drivers:mc,computedAt:Date.now()};}catch(e){return{overall:0,overallPct:0,classification:CONFIDENCE_CLASS.UNRELIABLE,moduleCoverage:0,degradedModules:[],staleModules:[],fallbackModules:[],unavailableModules:[],drivers:{},computedAt:Date.now()};}}


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
		const crypto = require("crypto"); // PHASE-A
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
                          score REAL,
			  confidence INTEGER,
			  timestamp INTEGER
                          module_coverage REAL,
                          fallback_count INTEGER,
                          stale_count INTEGER,
                          overall_confidence REAL,
                          conf_class TEXT
			)
		  `);
		db.run('CREATE INDEX IF NOT EXISTS idx_signals_time ON signals(timestamp)');
                // A1: Narrative provenance persistence
                db.run(`
                  CREATE TABLE IF NOT EXISTS narrative_provenance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    replay_id TEXT NOT NULL,
                    audience TEXT, risk_profile TEXT, provider TEXT, model TEXT,
                    prompt_version TEXT, regime TEXT, confidence_class TEXT,
                    fallback_used INTEGER DEFAULT 0, fallback_reason TEXT,
                    latency_ms INTEGER, contradiction_count INTEGER DEFAULT 0,
                    contradiction_ids TEXT, uncertainty_active INTEGER DEFAULT 0,
                    reversal_active INTEGER DEFAULT 0, fgs_sanitizations INTEGER DEFAULT 0,
                    degradation_active INTEGER DEFAULT 0, calibration_applied INTEGER DEFAULT 0,
                    logged_at INTEGER
                  )
                `);
                db.run('CREATE INDEX IF NOT EXISTS idx_prov_replay ON narrative_provenance(replay_id)');
                db.run('CREATE INDEX IF NOT EXISTS idx_prov_time ON narrative_provenance(logged_at)');
                // A2: Circuit breaker state persistence
                db.run(`
                  CREATE TABLE IF NOT EXISTS circuit_breaker_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    failures INTEGER DEFAULT 0, last_failure INTEGER,
                    is_open INTEGER DEFAULT 0, updated_at INTEGER
                  )
                `);
                db.run('INSERT OR IGNORE INTO circuit_breaker_state (id,failures,last_failure,is_open,updated_at) VALUES (1,0,NULL,0,NULL)');

		db.run('CREATE INDEX IF NOT EXISTS idx_decisions_time ON decisions(timestamp)');
                db.run(`CREATE TABLE IF NOT EXISTS comm_visits (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT NOT NULL, visit_date TEXT NOT NULL, visit_hour INTEGER NOT NULL, is_revisit INTEGER DEFAULT 0, source TEXT DEFAULT 'DIRECT', page TEXT DEFAULT 'HOME', ua_class TEXT DEFAULT 'UNKNOWN', logged_at INTEGER NOT NULL)`);
                db.run('CREATE INDEX IF NOT EXISTS idx_visits_date ON comm_visits(visit_date)');
                db.run('CREATE INDEX IF NOT EXISTS idx_visits_hash ON comm_visits(ip_hash)');
                db.run(`CREATE TABLE IF NOT EXISTS comm_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, priority TEXT DEFAULT 'MORNING', title TEXT NOT NULL, body TEXT NOT NULL, prospect_ref TEXT, triggered_at INTEGER NOT NULL, delivered INTEGER DEFAULT 0, dismissed INTEGER DEFAULT 0)`);
                db.run('CREATE INDEX IF NOT EXISTS idx_ops_events_pri ON comm_ops_events(priority, delivered)');
                db.run(`CREATE TABLE IF NOT EXISTS comm_prospects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT, organisation TEXT, linkedin_url TEXT UNIQUE NOT NULL, score INTEGER DEFAULT 2, source_string TEXT DEFAULT 'S1', last_post_observed TEXT, personalisation_note TEXT, status TEXT DEFAULT 'SOURCED', interaction_count INTEGER DEFAULT 0, last_interaction_at INTEGER, added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
                db.run('CREATE INDEX IF NOT EXISTS idx_prospects_status ON comm_prospects(status)');
                db.run(`CREATE TABLE IF NOT EXISTS comm_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_id INTEGER, action_type TEXT NOT NULL, status TEXT DEFAULT 'PENDING', due_at INTEGER, completed_at INTEGER, note TEXT, outcome TEXT, objection TEXT, logged_at INTEGER NOT NULL)`);
                db.run('CREATE INDEX IF NOT EXISTS idx_actions_due ON comm_actions(due_at, status)');
                db.run('CREATE INDEX IF NOT EXISTS idx_actions_prospect ON comm_actions(prospect_id)');
                db.run(`ALTER TABLE comm_actions ADD COLUMN force_feed INTEGER DEFAULT 0`,(e)=>{if(e&&!e.message.includes('duplicate'))console.log('[schema] force_feed:',e.message);else console.log('[schema] force_feed column ready');});
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

// PHASE-A: TRAFFIC TELEMETRY MIDDLEWARE
// Privacy-safe. Fire-and-forget. Raw IP never stored.
(function installTrafficMiddleware(){
  let _sd='',_sv='';
  function salt(){const t=new Date().toISOString().slice(0,10);if(_sd!==t){_sd=t;_sv=crypto.randomBytes(16).toString('hex');}return _sv;}
  function inferSrc(ref,ua){if(!ref){if(ua&&/mobile|android|iphone/i.test(ua))return 'WHATSAPP ';return 'DIRECT ';}if(/linkedin\.com/i.test(ref))return 'LINKEDIN ';return 'OTHER ';}
  function inferUA(ua){if(!ua)return 'UNKNOWN ';if(/mobile|android|iphone|ipad/i.test(ua))return 'MOBILE ';return 'DESKTOP ';}
  function inferPage(u){if(!u||u==='/') return 'HOME';if(u.startsWith('/ops'))return 'OPS';if(u.includes('brief'))return 'BRIEF';return 'HOME';}
  app.use((req,res,next)=>{
    if(req.method!=='GET')return next();
    if(req.path.startsWith('/api/'))return next();
    if(req.path.includes('.'))return next();
    next();
    setImmediate(()=>{
      try{
        const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress||'unknown';
        const h=crypto.createHash('sha256').update(ip+salt()).digest('hex').slice(0,32);
        const now=Date.now();
        const vd=new Date(now).toISOString().slice(0,10);
        const vh=new Date(now).getUTCHours();
        const s=inferSrc(req.headers['referer']||req.headers['referrer'],req.headers['user-agent']);
        const u=inferUA(req.headers['user-agent']);
        const p=inferPage(req.path);
      const vid=req.headers['x-visitor-id']||null;
      const vtype=(req.headers['x-visitor-type']||'PUBLIC').trim();
      if(vtype==='FOUNDER')return;
      const dedupeKey=vid||h;
      const dedupeField=vid?'visitor_id':'ip_hash';
      db.get('SELECT 1 FROM comm_visits WHERE '+dedupeField+'=? LIMIT 1',[dedupeKey],(err,row)=>{
        db.run('INSERT INTO comm_visits (ip_hash,visit_date,visit_hour,is_revisit,source,page,ua_class,visitor_id,visitor_type,logged_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[h,vd,vh,row?1:0,s,p,u,vid,vtype,now],function(){});
        });
      }catch(e){}
    });
  });
})();


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
			// Governance-validated restoration — each field individually validated before trust
			// Additive only: no logic changes, no threshold changes
			const safeSignalsHistory = Array.isArray(data.signalsHistory) ? data.signalsHistory : [];
			const safeV8RegimeHistory = Array.isArray(data.v8_regimeHistory) ? data.v8_regimeHistory : [];
			const safeCycles = typeof data.cyclesSinceChange === 'number' && data.cyclesSinceChange >= 0
			  ? data.cyclesSinceChange : 0;
			const safeLastRegimeChangeTs = typeof data.lastRegimeChangeTs === 'number'
			  ? data.lastRegimeChangeTs : null;
			const safeLastSnapshot = data.lastSnapshot && typeof data.lastSnapshot === 'object'
			  && typeof data.lastSnapshot.regime === 'string'
			  ? data.lastSnapshot : null;
			const safeAlerts = Array.isArray(data.alerts) ? data.alerts : [];
			if (safeSignalsHistory.length > 0) {
			  logger.info({ job: 'loadMemory', cycles: safeCycles, signals: safeSignalsHistory.length,
			    lastRegime: safeLastSnapshot?.regime || 'unknown' }, 'Durability state restored from memory.json');
			}
			return {
			  decisions:          data.decisions || [],
			  regimeHistory:      data.regimeHistory || [],
			  signalsHistory:     safeSignalsHistory,
			  v8_regimeHistory:   safeV8RegimeHistory,
			  cyclesSinceChange:  safeCycles,
			  lastRegimeChangeTs: safeLastRegimeChangeTs,
			  lastSnapshot:       safeLastSnapshot,
			  alerts:             safeAlerts,
			};
		  } catch(e) {
			logger.warn({ job: 'loadMemory', err: e.message }, 'memory.json load failed — starting with clean state');
			return {
			  decisions: [], regimeHistory: [], signalsHistory: [], v8_regimeHistory: [],
			  cyclesSinceChange: 0, lastRegimeChangeTs: null, lastSnapshot: null, alerts: [],
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
                          const _pn=url.includes("yahoo.com")?"Yahoo":url.includes("nseindia.com")?"NSE":url.includes("tradingeconomics.com")?"TradingEconomics":url.includes("angelone.in")?"AngelOne":url.includes("rbi.org")?"RBI":"Other";
                          if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordSuccess(_pn);
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
                          const _pfn=url.includes("yahoo.com")?"Yahoo":url.includes("nseindia.com")?"NSE":url.includes("tradingeconomics.com")?"TradingEconomics":url.includes("angelone.in")?"AngelOne":url.includes("rbi.org")?"RBI":"Other";
                          if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordFailure(_pfn);
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
// SECTION-09B : ANGEL ONE SMARTAPI ADAPTER
////////////////////////////////////////////////////////
const _aoSpeakeasy = require('speakeasy');
const _AO_CONFIG = {
  apiKey: process.env.AO_API_KEY || '',
  clientId: process.env.AO_CLIENT_ID || '',
  mpin: process.env.AO_MPIN || '',
  totpSecret: process.env.AO_TOTP_SECRET || '',
  baseUrl: 'https://apiconnect.angelone.in',
};
const _aoSession = { jwtToken:null, refreshToken:null, feedToken:null, expiresAt:0, loginInProgress:false };
// T4: SmartAPI observability tracking
const _aoObs = {
  loginStatus: 'NOT_ATTEMPTED',   // NOT_ATTEMPTED | SUCCESS | FAILED
  lastLoginAt: null,
  lastLoginFailAt: null,
  lastLoginFailReason: null,
  loginAttempts: 0,
  quoteStatus: 'UNKNOWN',         // UNKNOWN | OK | FAILED
  lastQuoteAt: null,
  lastQuoteFailAt: null,
  optionChainStatus: 'UNKNOWN',
  lastOptionChainAt: null,
  lastOptionChainFailAt: null,
  pcrStatus: 'UNKNOWN',
  lastPcrAt: null,
  india10yStatus: 'UNKNOWN',
  lastIndia10yAt: null,
};
function _aoGenerateTotp() { return _aoSpeakeasy.totp({ secret:_AO_CONFIG.totpSecret, encoding:'base32' }); }
async function _aoLogin() {
  if (_aoSession.loginInProgress) { await new Promise(r=>setTimeout(r,3000)); return _aoSession.jwtToken!==null; }
  _aoSession.loginInProgress=true;
  try {
    const totp=_aoGenerateTotp();
    const res=await fetch(`${_AO_CONFIG.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json','X-UserType':'USER','X-SourceID':'WEB','X-ClientLocalIP':'127.0.0.1','X-ClientPublicIP':process.env.SERVER_PUBLIC_IP||'51.21.94.67','X-MACAddress':'00:00:00:00:00:00','X-PrivateKey':_AO_CONFIG.apiKey},
      body:JSON.stringify({clientcode:_AO_CONFIG.clientId,password:_AO_CONFIG.mpin,totp}),
      signal:AbortSignal.timeout(10000),
    });
    const data=await res.json();
    if(data.status===true&&data.data&&data.data.jwtToken){
      _aoSession.jwtToken=data.data.jwtToken; _aoSession.refreshToken=data.data.refreshToken;
      _aoSession.feedToken=data.data.feedToken; _aoSession.expiresAt=Date.now()+55*60*1000;
      _aoObs.loginStatus='SUCCESS'; _aoObs.lastLoginAt=Date.now(); _aoObs.loginAttempts++;
      logger.info({job:'ao-login',status:'SUCCESS',ts:Date.now()});
      return true;
    }
    logger.error({job:'ao-login',status:'FAILED',msg:data.message,ts:Date.now()});
    return false;
  } catch(err) { logger.error({job:'ao-login',err:err.message,ts:Date.now()}); return false; }
  finally { _aoSession.loginInProgress=false; }
}
async function _aoEnsureSession() { if(_aoSession.jwtToken&&Date.now()<_aoSession.expiresAt)return true; return _aoLogin(); }
async function _aoPost(path,body) {
  const ok=await _aoEnsureSession(); if(!ok)return null;
  try {
    const res=await fetch(`${_AO_CONFIG.baseUrl}${path}`,{
      method:'POST',
      headers:{'Authorization':'Bearer '+_aoSession.jwtToken,'Content-Type':'application/json','Accept':'application/json','X-UserType':'USER','X-SourceID':'WEB','X-ClientLocalIP':'127.0.0.1','X-ClientPublicIP':process.env.SERVER_PUBLIC_IP||'51.21.94.67','X-MACAddress':'00:00:00:00:00:00','X-PrivateKey':_AO_CONFIG.apiKey},
      body:JSON.stringify(body), signal:AbortSignal.timeout(10000),
    });
    return await res.json();
  } catch(err) { logger.warn({job:'ao-post',path,err:err.message}); return null; }
}
async function _aoFetchPCR() {
  try {
    const data=await _aoPost('/rest/secure/angelbroking/market/v1/optionChain',{name:'NIFTY',expirydate:''});
    if(!data||data.status!==true||!data.data)return null;
    const rows=data.data; if(!Array.isArray(rows)||rows.length===0)return null;
    let totalPEOI=0,totalCEOI=0;
    for(const row of rows){totalPEOI+=Number(row.putOI||row.put_oi||0);totalCEOI+=Number(row.callOI||row.call_oi||0);}
    const pcr=totalCEOI>0?Math.round((totalPEOI/totalCEOI)*1000)/1000:null;
    logger.info({job:'ao-pcr',pcr,ts:Date.now()});
    return pcr!==null?{pcr,totalPEOI,totalCEOI,source:'angel-one'}:null;
  } catch(err) { logger.error({job:'ao-pcr',err:err.message}); return null; }
}
async function _aoFetchIndia10Y() {
  try {
    const data=await _aoPost('/rest/secure/angelbroking/market/v1/quote/ltp',{mode:'LTP',exchangeTokens:{NSE:['10503']}});
    if(data&&data.status===true&&data.data&&data.data.fetched&&data.data.fetched[0]){
      const ltp=data.data.fetched[0].ltp;
      if(ltp){const y=ltp>20?ltp/100:ltp;logger.info({job:'ao-10y',yield:y,ts:Date.now()});return y;}
    }
    return null;
  } catch(err) { logger.error({job:'ao-10y',err:err.message}); return null; }
}
(async()=>{
  if(_AO_CONFIG.apiKey&&_AO_CONFIG.clientId&&_AO_CONFIG.mpin&&_AO_CONFIG.totpSecret){
    logger.info({job:'ao-adapter',msg:'Initialising Angel One session',ts:Date.now()});
    await _aoLogin();
  } else { logger.warn({job:'ao-adapter',msg:'AO credentials missing',ts:Date.now()}); }
})();

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

////////////////////////////////////////////////////////
// SECTION-10B : FRED MACRO INGESTION MODULE
////////////////////////////////////////////////////////
const FRED_CONFIG = Object.freeze({
  apiKey:  process.env.FRED_API_KEY || "",
  baseUrl: "https://api.stlouisfed.org/fred/series/observations",
  timeout: 8000,
  series:  { DGS10:{label:"US 10Y Yield",unit:"%"}, DGS2:{label:"US 2Y Yield",unit:"%"}, T10Y2Y:{label:"Yield Curve Spread",unit:"%"}, FEDFUNDS:{label:"Fed Funds Rate",unit:"%"}, CPIAUCSL:{label:"US CPI",unit:"index"}, CPILFESL:{label:"US Core CPI",unit:"index"}, UNRATE:{label:"US Unemployment",unit:"%"} },
});
async function fetchFREDSeries(seriesId,limit=2){
  if(!FRED_CONFIG.apiKey){return null;}
  try{
    const url=`${FRED_CONFIG.baseUrl}?series_id=${seriesId}&api_key=${FRED_CONFIG.apiKey}&limit=${limit}&sort_order=desc&file_type=json`;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),FRED_CONFIG.timeout);
    const res=await fetch(url,{signal:controller.signal});clearTimeout(timer);
    if(!res.ok)throw new Error(`FRED HTTP ${res.status}`);
    const data=await res.json();const obs=data.observations||[];
    const latest=obs.find(o=>o.value!=="."&&o.value!=="");if(!latest)return null;
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordSuccess("FRED");
    return{seriesId,value:parseFloat(latest.value),date:latest.date,source:"FRED",fetchedAt:Date.now()};
  }catch(err){
    logger.warn({seriesId,err:err.message},"fetchFREDSeries failed");
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordFailure("FRED");
    return null;
  }
}
async function fetchFREDMacro(){
  if(!FRED_CONFIG.apiKey)return null;
  try{
    const[dgs10,dgs2,t10y2y,fedfunds,cpi,unrate,indiaLongRate]=await Promise.all([fetchFREDSeries("DGS10",1),fetchFREDSeries("DGS2",1),fetchFREDSeries("T10Y2Y",1),fetchFREDSeries("FEDFUNDS",1),fetchFREDSeries("CPIAUCSL",2),fetchFREDSeries("UNRATE",1),fetchFREDSeries("INDIRLTLT01STM",1)]);
    const spreadVal=t10y2y?.value??null;
    const yieldCurveSignal=spreadVal===null?"UNKNOWN":spreadVal<-0.20?"INVERTED":spreadVal<0.10?"FLAT":spreadVal<0.50?"NORMAL":"STEEP";
    const fedRate=fedfunds?.value??null;
    const fedStance=fedRate===null?"UNKNOWN":fedRate>=5.00?"RESTRICTIVE":fedRate>=3.50?"MODERATELY_RESTRICTIVE":fedRate>=2.00?"NEUTRAL":"ACCOMMODATIVE";
    const result={us10YYield:dgs10?.value??null,us2YYield:dgs2?.value??null,yieldSpread10_2:spreadVal,yieldCurveSignal,fedFundsRate:fedRate,fedStance,usUnemployment:unrate?.value??null,usCpiIndex:cpi?.value??null,indiaLongRate:indiaLongRate?.value??null,indiaLongRateDate:indiaLongRate?.date||null,dates:{dgs10:dgs10?.date||null,fedfunds:fedfunds?.date||null,t10y2y:t10y2y?.date||null,unrate:unrate?.date||null,indiaLongRate:indiaLongRate?.date||null},source:"FRED",fetchedAt:Date.now(),fallbackActive:false,staleReason:null};
    DSSCache.set("macro:fred",result);
    logger.info({job:"fetchFREDMacro",us10Y:result.us10YYield,fedRate:result.fedFundsRate,spread:result.yieldSpread10_2,yieldCurve:result.yieldCurveSignal,fedStance:result.fedStance},"FRED macro refreshed");
    return result;
  }catch(err){logger.error({err:err.message},"fetchFREDMacro failed");return null;}
}
////////////////////////////////////////////////////////
// SECTION-10C : BLS MACRO INGESTION MODULE
// Monthly releases — fetch at startup + once daily only
////////////////////////////////////////////////////////
const BLS_SERIES={"CUUR0000SA0":"US CPI","CUUR0000SA0L1E":"US Core CPI","LNS14000000":"US Unemployment","CES0000000001":"US Nonfarm Payrolls"};
async function fetchBLSSeries(sid){
  try{
    const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),8000);
    const r=await fetch(`https://api.bls.gov/publicAPI/v1/timeseries/data/${sid}`,{signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)throw new Error(`BLS ${r.status}`);
    const d=await r.json();
    if(d.status!=="REQUEST_SUCCEEDED")throw new Error(`BLS:${d.status}`);
    const latest=d.Results?.series?.[0]?.data?.[0];
    if(!latest)return null;
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordSuccess("BLS");
    return{seriesId:sid,value:parseFloat(latest.value),year:latest.year,period:latest.period,periodName:latest.periodName,source:"BLS",fetchedAt:Date.now()};
  }catch(e){
    logger.warn({seriesId:sid,err:e.message},"fetchBLSSeries failed");
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordFailure("BLS");
    return null;
  }
}
async function fetchBLSMacro(){
  try{
    const[cpi,coreCpi,unemp,payrolls]=await Promise.all([fetchBLSSeries("CUUR0000SA0"),fetchBLSSeries("CUUR0000SA0L1E"),fetchBLSSeries("LNS14000000"),fetchBLSSeries("CES0000000001")]);
    const usUnemployment=unemp?.value??null,usPayrolls=payrolls?.value??null;
    const laborSignal=usUnemployment===null?"UNKNOWN":usUnemployment<=4.0?"STRONG":usUnemployment<=4.5?"MODERATE":usUnemployment<=5.5?"WEAKENING":"WEAK";
    const payrollSignal=usPayrolls===null?"UNKNOWN":usPayrolls>150?"STRONG":usPayrolls>50?"MODERATE":"WEAK";
    const result={usCpiIndex:cpi?.value??null,usCoreCpi:coreCpi?.value??null,usUnemployment,usPayrolls,laborSignal,payrollSignal,dates:{cpi:cpi?`${cpi.year}-${cpi.period}`:null,unemployment:unemp?`${unemp.year}-${unemp.period}`:null,payrolls:payrolls?`${payrolls.year}-${payrolls.period}`:null},source:"BLS",fetchedAt:Date.now(),fallbackActive:false};
    DSSCache.set("macro:bls",result);
    logger.info({job:"fetchBLSMacro",cpi:result.usCpiIndex,unemployment:usUnemployment,payrolls:usPayrolls,laborSignal,payrollSignal},"BLS macro refreshed");
    return result;
  }catch(e){logger.error({err:e.message},"fetchBLSMacro failed");return null;}
}

////////////////////////////////////////////////////////
// SECTION-10D : FEDERAL RESERVE RSS INGESTION MODULE
// Zero-cost, EC2-compatible, event-driven signals
// Fetches FOMC minutes, policy statements, press releases
// Cadence: every 4 hours (Fed releases are infrequent)
////////////////////////////////////////////////////////
const FED_RSS_URL="https://www.federalreserve.gov/feeds/press_all.xml";
const FED_KEYWORDS={hawkish:["rate hike","tighten","restrictive","inflation concern","above target","price stability"],dovish:["rate cut","easing","accommodative","below target","support growth","labor market"],neutral:["hold","pause","unchanged","monitor","assess","data dependent"],fomc:["fomc","federal open market","meeting","minutes","statement"],policy:["policy","interest rate","federal funds","reserve requirement"]};
async function fetchFedRSS(){
  try{
    const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),8000);
    const r=await fetch(FED_RSS_URL,{signal:ctrl.signal,headers:{"User-Agent":"ADVISIQ-DSS/1.0 (market intelligence research)"}});
    clearTimeout(t);
    if(!r.ok)throw new Error(`FedRSS HTTP ${r.status}`);
    const xml=await r.text();
    // Parse items from RSS XML
    const items=[];
    const itemRx=/<item>([\s\S]*?)<\/item>/g;
    let m;
    while((m=itemRx.exec(xml))!==null&&items.length<10){
      const block=m[1];
      const title=(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/.exec(block)||/<title>([^<]+)<\/title>/.exec(block))?.[1]||"";
      const link=(/<link><!\[CDATA\[([^\]]+)\]\]><\/link>/.exec(block)||/<link>([^<]+)<\/link>/.exec(block))?.[1]||"";
      const pubDate=/<pubDate>([^<]+)<\/pubDate>/.exec(block)?.[1]||"";
      if(title)items.push({title:title.replace(/&quot;/g,'"').replace(/&amp;/g,"&").trim(),link:link.trim(),pubDate:pubDate.trim()});
    }
    // Classify each item
    const classified=items.map(item=>{
      const txt=item.title.toLowerCase();
      let sentiment="NEUTRAL",isFOMC=false,isPolicy=false;
      const hawkScore=FED_KEYWORDS.hawkish.filter(k=>txt.includes(k)).length;
      const doveScore=FED_KEYWORDS.dovish.filter(k=>txt.includes(k)).length;
      if(FED_KEYWORDS.fomc.some(k=>txt.includes(k)))isFOMC=true;
      if(FED_KEYWORDS.policy.some(k=>txt.includes(k)))isPolicy=true;
      if(hawkScore>doveScore)sentiment="HAWKISH";
      else if(doveScore>hawkScore)sentiment="DOVISH";
      return{...item,sentiment,isFOMC,isPolicy,relevanceScore:hawkScore+doveScore+(isFOMC?2:0)+(isPolicy?1:0)};
    }).sort((a,b)=>b.relevanceScore-a.relevanceScore);
    // Overall Fed tone from top 3 items
    const top3=classified.slice(0,3);
    const hawkCount=top3.filter(i=>i.sentiment==="HAWKISH").length;
    const doveCount=top3.filter(i=>i.sentiment==="DOVISH").length;
    const overallTone=hawkCount>doveCount?"HAWKISH":doveCount>hawkCount?"DOVISH":"NEUTRAL";
    const fomcItems=classified.filter(i=>i.isFOMC);
    const result={items:classified.slice(0,8),overallTone,fomcItems:fomcItems.slice(0,3),latestTitle:classified[0]?.title||null,latestDate:classified[0]?.pubDate||null,source:"FedRSS",fetchedAt:Date.now(),fallbackActive:false};
    DSSCache.set("macro:fedrss",result);
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordSuccess("FedRSS");
    logger.info({job:"fetchFedRSS",items:classified.length,tone:overallTone,fomcItems:fomcItems.length},"Fed RSS refreshed");
    return result;
  }catch(e){
    logger.warn({err:e.message},"fetchFedRSS failed");
    if(typeof ProviderHealthRegistry!=="undefined")ProviderHealthRegistry.recordFailure("FedRSS");
    return null;
  }
}

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
		const cookies = (typeof warmup1.headers.getSetCookie === "function" ? warmup1.headers.getSetCookie() : [warmup1.headers.get("set-cookie") || ""]).filter(Boolean)
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
		const cookies2arr = (typeof warmup2.headers.getSetCookie === "function" ? warmup2.headers.getSetCookie() : [warmup2.headers.get("set-cookie") || ""]).filter(Boolean)
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

		// Step 3.5 — visit option chain page to set session context
		try {
			await fetch("https://www.nseindia.com/option-chain", {
				headers: {
					...headers,
					"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"
				}
			});
			await new Promise(r => setTimeout(r, 500));
		} catch(e) {}
		const optionUrl =
		  "https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY";

		// Step 5 — use the accumulated main-session headers (cookies set above)
		const optionRes = await fetch(optionUrl, {
		  headers: {
			...headers,
			"Referer":          "https://www.nseindia.com/option-chain",
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

		// ── SESSION 18 STEP 2: score:derivatives ──
		// P1-B: VIX-only scoring (v8 DEF-NEW-005)
		// FSD v8 Section 8 Priority 3 — clean lookup table replaces
		// additive-from-50 when PCR null. Conf 0.55 (directionally valid).
		safeExecute(() => {
		  const _pcr    = payload.pcr;
		  const _vixVal = DSSCache.get("nse:index")?.vixValue || null;
		  const _pcrLive = _pcr !== null && _pcr !== undefined;
		  const _vixLive = _vixVal !== null;

		  function computeDerivativesScoreVixOnly(vix) {
		    if (vix === null || vix === undefined) return 50;
		    if (vix < 13)  return 70;
		    if (vix < 18)  return 55;
		    if (vix <= 25) return 40;
		    return 20;
		  }

		  let _derivScore, _dConf, _sourceOrigin;

		  if (_pcrLive && _vixLive) {
		    _derivScore = 50;
		    if (_pcr > 1.3) _derivScore += 15; else if (_pcr > 1.1) _derivScore += 8;
		    else if (_pcr < 0.75) _derivScore -= 15; else if (_pcr < 0.9) _derivScore -= 8;
		    if (_vixVal < 12) _derivScore += 10; else if (_vixVal < 16) _derivScore += 5;
		    else if (_vixVal > 22) _derivScore -= 15; else if (_vixVal > 18) _derivScore -= 8;
		    _derivScore = Math.max(0, Math.min(100, _derivScore));
		    _dConf = 0.78;
		    _sourceOrigin = "nse-option-chain";
		  } else if (_vixLive) {
		    _derivScore = computeDerivativesScoreVixOnly(_vixVal);
		    _dConf = 0.55;
		    _sourceOrigin = "vix-only-fallback";
		  } else {
		    _derivScore = 50;
		    _dConf = 0.20;
		    _sourceOrigin = "bootstrap-fallback";
		  }

		  DSSCache.set("score:derivatives", {
		    score: _derivScore, confidence: _dConf,
		    sourceOrigin: _sourceOrigin,
		    fallbackActive: !_pcrLive && !_vixLive,
		    staleReason: !_pcrLive ? "DEF-001: PCR null — VIX-only scoring active" : null,
		    fetchedAt: Date.now(), cacheAgeMin: 0
		  });
		  logger.info({ job: "score:derivatives-write", score: _derivScore, confidence: _dConf, pcrLive: _pcrLive, vixLive: _vixLive, vix: _vixVal, sourceOrigin: _sourceOrigin, ts: Date.now() });
		}, null);
		// ── END score:derivatives ──

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

		const peIsLive      = niftyPe !== null;
		const earningsIsDerived = true;

		const payload = {

		  niftyPe,

		  earningsGrowth,

		  revenueGrowthScore,

		  marginExpansionScore,

		  timestamp: Date.now(),

		  source: "fundamental-engine",

		  sourceOrigin: peIsLive ? "nse-live" : "derived-fallback",
		  fallbackActive: !peIsLive,
		  staleReason: !peIsLive ? "NSE PE fetch failed — earnings derived from heuristic" : null,
		  fundamentalDataQuality: {
		    niftyPe:             peIsLive ? "live" : "unavailable",
		    earningsGrowth:      earningsIsDerived ? "derived" : "hardcoded",
		    revenueGrowthScore:  earningsIsDerived ? "derived" : "hardcoded",
		    marginExpansionScore: "derived",
		    creditGrowth:        "hardcoded",
		    gstCollections:      "macro-engine",
		    manufacturingPMI:    "macro-engine"
		  },
		  cacheAgeMin: 0
		};

		DSSCache.set(
		  "equity:fundamental",
		  payload
		);

		// ── SESSION 18 STEP 2: score:equity ──
		safeExecute(() => {
		  const _peIsLive = payload.niftyPe !== null;
		  let _eScore = 50;
		  if (_peIsLive) {
		    if (payload.niftyPe <= 18) _eScore += 20; else if (payload.niftyPe <= 20) _eScore += 12;
		    else if (payload.niftyPe <= 22) _eScore += 5; else if (payload.niftyPe >= 26) _eScore -= 15;
		    else if (payload.niftyPe >= 24) _eScore -= 8;
		  }
		  if (payload.earningsGrowth >= 15) _eScore += 15;
		  else if (payload.earningsGrowth >= 12) _eScore += 8;
		  else if (payload.earningsGrowth < 8) _eScore -= 10;
		  _eScore = Math.max(0, Math.min(100, _eScore));
		  const _eConf = _peIsLive ? 0.72 : 0.45;
		  DSSCache.set("score:equity", {
		    score: _eScore, confidence: _eConf,
		    sourceOrigin: _peIsLive ? "nse-live" : "derived-heuristic",
		    fallbackActive: !_peIsLive,
		    staleReason: !_peIsLive ? "NSE PE unavailable — equity score derived from RSI/MACD heuristic" : null,
		    fetchedAt: Date.now(), cacheAgeMin: 0
		  });
		  logger.info({ job: "score:equity-write", score: _eScore, confidence: _eConf, peIsLive: _peIsLive, ts: Date.now() });
		}, null);
		// ── END score:equity ──

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

		const _us10YVal=us10Y?.current||null,_dxyVal=dxy?.current||null,_crudeVal=crude||null;
		const _prevG=DSSCache.get("equity:global")||{};
		// FRED: primary source for US10Y
		const _fredG=DSSCache.get("macro:fred")||{};
		const _fredUs10Y=_fredG.us10YYield||null;
		const dxyFinal=_dxyVal||_prevG.dxy||104.50;
		const crudeFinal=_crudeVal||_prevG.crudeOil||83.00;
		const us10YFinal=_fredUs10Y||_us10YVal||_prevG.us10Y||null;
		const payload = {

		  us10Y: us10YFinal,

		  dxy: dxyFinal,

		  crudeOil: crudeFinal,

		  fedPolicy: fed,

		  hardcodedFallback: (!_us10YVal||!_dxyVal||!_crudeVal),

		  timestamp: Date.now()
		};

		DSSCache.set(
		  "equity:global",
		  payload
		);

		// ── SESSION 18 STEP 2: score:global + signals:global ──
		safeExecute(() => {
		  const _us10Y  = payload.us10Y    || null;
		  const _dxy    = payload.dxy      || null;
		  const _crude  = payload.crudeOil || null;
		  const _fed    = payload.fedPolicy || {};

		  let _gScore = 50;
		  if (_fed.bull === true)   _gScore += 15;
		  if (_fed.bull === false)  _gScore -= 15;
		  if (_dxy !== null) {
		    if (_dxy < 102)         _gScore += 8;
		    else if (_dxy > 106)    _gScore -= 8;
		  }
		  if (_crude !== null) {
		    if (_crude < 75)        _gScore += 10;
		    else if (_crude > 90)   _gScore -= 10;
		    else if (_crude > 83)   _gScore -= 5;
		  }
		  if (_us10Y !== null) {
		    if (_us10Y > 4.5)       _gScore -= 8;
		    else if (_us10Y < 4.0)  _gScore += 5;
		  }
		  _gScore = Math.max(0, Math.min(100, _gScore));

		  const _liveCount = [_us10Y, _dxy, _crude].filter(v => v !== null).length;
		  const _gConf = _liveCount === 3 ? 0.85 : _liveCount === 2 ? 0.65 : _liveCount === 1 ? 0.45 : 0.20;

		  DSSCache.set("score:global", {
		    score: _gScore, confidence: _gConf,
		    sourceOrigin: _liveCount > 0 ? "yahoo-live" : "unavailable",
		    fallbackActive: _liveCount < 3,
		    staleReason: _liveCount < 3 ? "One or more Yahoo global quotes unavailable" : null,
		    fetchedAt: Date.now(), cacheAgeMin: 0
		  });

		  const _gSignals = [];
		  if (_fed.signal) _gSignals.push({ name: "Fed Policy", value: _fed.stance || null, signal: _fed.signal, sentiment: _fed.bull === true ? "bullish" : _fed.bull === false ? "bearish" : "neutral", confidence: _gConf, source: "derived" });
		  if (_crude !== null) _gSignals.push({ name: "Crude Oil (Brent)", value: _crude, signal: _crude > 90 ? "SELL" : _crude < 75 ? "BUY" : "WATCH", sentiment: _crude > 90 ? "bearish" : _crude < 75 ? "bullish" : "neutral", confidence: 0.80, source: "Yahoo" });
		  if (_dxy   !== null) _gSignals.push({ name: "DXY (Dollar Index)", value: _dxy,   signal: _dxy > 106 ? "SELL" : _dxy < 102 ? "BUY" : "WATCH",   sentiment: _dxy > 106 ? "bearish" : _dxy < 102 ? "bullish" : "neutral", confidence: 0.80, source: "Yahoo" });
		  if (_us10Y !== null) _gSignals.push({ name: "US 10Y Yield",       value: _us10Y, signal: _us10Y > 4.5 ? "SELL" : _us10Y < 4.0 ? "BUY" : "WATCH", sentiment: _us10Y > 4.5 ? "bearish" : "neutral", confidence: 0.80, source: "Yahoo" });

		  DSSCache.set("signals:global", {
		    signals: _gSignals, dxyProxy: _dxy, us10YYield: _us10Y, crudeBrent: _crude,
		    usdInr: null, fedPolicy: _fed,
		    sourceOrigin: _liveCount > 0 ? "yahoo-live" : "unavailable",
		    fallbackActive: _liveCount < 3, fetchedAt: Date.now()
		  });

		  logger.info({ job: "score:global-write", score: _gScore, confidence: _gConf, liveDataPoints: _liveCount, ts: Date.now() });
		}, null);
		// ── END score:global + signals:global ──

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
		// FSD Priority 7: RBI RSS G-Sec attempt (before TE fetch)
		let _rbiYieldData = null;
		try {
		  const _rbiRss = await fetch("https://rbi.org.in/scripts/rss.aspx?Id=316", {
		    headers: { "User-Agent": "Mozilla/5.0 (compatible; ADVISIQ/1.0)" },
		    signal: AbortSignal.timeout(8000)
		  });
		  if (_rbiRss.ok) {
		    const _rbiText = await _rbiRss.text();
		    const _repoPattern = /repo\s+rate[^0-9]*([0-9]+\.?[0-9]*)\s*(?:per\s*cent|%)/i;
		    const _repoMatch = _rbiText.match(_repoPattern);
		    if (_repoMatch && _repoMatch[1]) {
		      const _parsedRate = parseFloat(_repoMatch[1]);
		      if (_parsedRate >= 4.0 && _parsedRate <= 10.0) {
		        _rbiYieldData = { repoRate: _parsedRate, source: "rbi-rss-live" };
		        logger.info({ repoRate: _parsedRate }, "P7: RBI RSS repo rate parsed");
		      }
		    }
		    if (!_rbiYieldData) logger.info("P7: RBI RSS fetched — no parseable rate — TE fallback active");
		  }
		} catch(e) {
		  logger.warn({ err: e.message }, "P7: RBI RSS failed — TE fallback active");
		}

		// ── India Sovereign Macro: FRED Canonical Architecture ────────
		// Source: INDIRLTLT01STM (OECD India Long-Term Interest Rate)
		// Monthly cadence — institutionally stable, whitelist-free, API-native
		// No Trading Economics, No SmartAPI G-Sec, No Yahoo proxies
		const _fredMacroCache = DSSCache.get("macro:fred") || {};
		const _fredIndiaRate = _fredMacroCache.indiaLongRate ?? null;
		const _fredIndiaRateDate = _fredMacroCache.indiaLongRateDate ?? null;
		const INDIA_GSEC_GOVERNED_BASE = 6.70; // governed continuity — update with RBI cycle
		let gsec10Y = null, gsec5Y = null, gsec2Y = null;
		let _indiaSovereignSource = 'GOVERNED';
		if (_fredIndiaRate && _fredIndiaRate > 4.0 && _fredIndiaRate < 12.0) {
		  gsec10Y = _fredIndiaRate;
		  gsec5Y  = Math.round((gsec10Y - 0.12) * 100) / 100;
		  gsec2Y  = Math.round((gsec10Y - 0.26) * 100) / 100;
		  _indiaSovereignSource = 'FRED';
		  _aoObs.india10yStatus = 'OK';
		  _aoObs.lastIndia10yAt = Date.now();
		  logger.info({ job: 'fetchIndiaMacro', gsec10Y, date: _fredIndiaRateDate, source: 'FRED:INDIRLTLT01STM' }, 'India 10Y sovereign rate from FRED');
		} else {
		  _aoObs.india10yStatus = 'GOVERNED_FALLBACK';
		  logger.info({ job: 'fetchIndiaMacro', fredRate: _fredIndiaRate }, 'FRED India rate unavailable — using governed base');
		}

		// DEF-004: provenance-annotated return with stale-reason for hardcoded fallbacks
		const gsec10YResolved = gsec10Y ?? INDIA_GSEC_GOVERNED_BASE;
		const gsec5YResolved  = gsec5Y  ?? (INDIA_GSEC_GOVERNED_BASE - 0.12);
		const gsec1YResolved  = gsec2Y  ?? (INDIA_GSEC_GOVERNED_BASE - 0.26);
		const allYieldsLive   = _indiaSovereignSource === 'FRED';

		if (!allYieldsLive) {
		  logger.warn(
		    { gsec10Y: !!gsec10Y, gsec5Y: !!gsec5Y, gsec2Y: !!gsec2Y },
		    "DEF-004: G-Sec yield fetch incomplete — serving hardcoded fallback values"
		  );
		}

		return {
		  repoRate: _rbiYieldData?.repoRate ?? (DSSCache.get("monetary:policy")?.repoRate ?? 6.0),
		  repoRateSource: _rbiYieldData ? "rbi-rss-live" : (DSSCache.get("monetary:policy")?.dataStatus ?? "governed-config"),
		  cpi: 4.75,
		  cpiSource: "hardcoded",
		  gsec10Y: gsec10YResolved,
		  gsec5Y:  gsec5YResolved,
		  gsec1Y:  gsec1YResolved,
		  gsecLive: allYieldsLive,
		  sourceOrigin: _indiaSovereignSource === 'FRED' ? "fred-indirltlt01stm" : "governed-continuity",
		  // Confidence-state taxonomy: REDUCED_CONFIRMATION when 10Y live but spreads derived
		  // GOVERNED_ESTIMATE when all values are hardcoded
		  confidenceState: allYieldsLive ? "LIVE" : (gsec10Y ? "REDUCED_CONFIRMATION" : "GOVERNED_ESTIMATE"),
		  confidenceState: _indiaSovereignSource === 'FRED' ? 'LIVE' : 'GOVERNED',
		  fallbackActive: _indiaSovereignSource !== 'FRED',
		  staleReason: _indiaSovereignSource !== 'FRED' ? 'India sovereign: FRED INDIRLTLT01STM not yet loaded — governed continuity active' : null,
		  fetchedAt: Date.now()
		};

	  } catch (err) {
		logger.error({ err: err.message }, "Macro fetch failed — using governed fallback");
		// Governed fallback: return minimum viable macro object so debt module can compute
		const _mp = DSSCache.get("monetary:policy") || {};
		return {
		  repoRate: _mp.repoRate ?? 6.0,
		  repoRateSource: "governed-config-fallback",
		  cpi: 4.75,
		  cpiSource: "hardcoded",
		  gsec10Y: null,
		  gsec5Y: null,
		  gsec1Y: null,
		  gsecLive: false,
		  sourceOrigin: "governed-fallback",
		  fallbackActive: true,
		  staleReason: "fetchIndiaMacro exception — governed fallback active: " + err.message,
		  fetchedAt: Date.now()
		};
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
// SECTION-19 : DERIVED MACRO SCORE ENGINE → RegimeEngine (Session 18 Step 3)
// Current: deriveInflationScore / deriveGrowthScore / deriveLiquidityScore / deriveMacroCompositeScore
// Session 18: RegimeEngine class replaces this section (Step 3 - pending deployment)
// score:* inputs now written by all upstream engines (Step 2 complete)
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
// SECTION-19-V9-H : SPRINT 5 GOVERNANCE HARDENING
// H1: FinalGovernanceSanitizer
// H2: Uncertainty Mode Detection
// H3: Mature Regime Reversal Protection
// H4: Escalation Caps Matrix
////////////////////////////////////////////////////////

// H2: Uncertainty mode trigger detection
function detectUncertaintyMode(narrativeMeta, brainLatest) {
  const triggers = [];
  const conf = brainLatest && typeof brainLatest.confidence === 'number' ? brainLatest.confidence : 0.50;
  const durClass = brainLatest && brainLatest.durabilityClass ? brainLatest.durabilityClass : 'EMERGING';
  const convClass = brainLatest && brainLatest.convictionClass ? brainLatest.convictionClass : null;
  const convTraj = brainLatest && brainLatest.convictionTrajectory ? brainLatest.convictionTrajectory : null;
  const cycles = brainLatest && typeof brainLatest.cyclesSinceChange === 'number' ? brainLatest.cyclesSinceChange : 0;
  const fallbackMods = brainLatest && Array.isArray(brainLatest.fallbackModules) ? brainLatest.fallbackModules.length : 0;
  const highTriggers = [];
  const moderateTriggers = [];
  if (conf < 0.50)                        highTriggers.push('LOW_CONFIDENCE');
  if (durClass === 'EMERGING')             highTriggers.push('EMERGING_DURABILITY');
  if (convClass === 'LOW')                 highTriggers.push('LOW_CONVICTION');
  if (cycles <= 3)                         highTriggers.push('UNSTABLE_REGIME_TRANSITION');
  if (fallbackMods >= 3)                   moderateTriggers.push('HIGH_FALLBACK_COUNT');
  if (convTraj === 'DECLINING')            moderateTriggers.push('CONVICTION_DECLINING');
  const allTriggers = [...highTriggers, ...moderateTriggers];
  const isHigh = highTriggers.length > 0;
  const isCompound = moderateTriggers.length >= 3;
  const severity = isCompound ? 'COMPOUND' : isHigh ? 'HIGH' : moderateTriggers.length > 0 ? 'MODERATE' : null;
  return {
    active: allTriggers.length > 0,
    triggers: allTriggers,
    severity,
    mandatoryPosture: (isHigh || isCompound) ? 'OBSERVATIONAL' : moderateTriggers.length > 0 ? 'CONDITIONAL' : 'STANDARD'
  };
}

// H3: Mature Regime Reversal detection
let _prevDurabilityClass = null;
let _prevRegimeForReversal = null;
let _matureReversalDetectedAt = null;
let _matureReversalPrevRegime = null;

function detectMatureRegimeReversal(currentRegime, currentDurabilityClass, cyclesSinceChange) {
  const wasMature = _prevDurabilityClass === 'MATURE';
  const regimeChanged = _prevRegimeForReversal && _prevRegimeForReversal !== currentRegime;
  const isFresh = cyclesSinceChange <= 3;
  let reversalActive = false;
  let cyclesRemaining = null;
  if (wasMature && regimeChanged && isFresh) {
    if (!_matureReversalDetectedAt) {
      _matureReversalDetectedAt = Date.now();
      _matureReversalPrevRegime = _prevRegimeForReversal;
    }
    reversalActive = true;
    cyclesRemaining = Math.max(0, 5 - cyclesSinceChange);
  } else if (cyclesSinceChange > 5) {
    _matureReversalDetectedAt = null;
    _matureReversalPrevRegime = null;
  }
  // Update tracking state
  _prevDurabilityClass = currentDurabilityClass;
  _prevRegimeForReversal = currentRegime;
  return {
    matureRegimeReversal: reversalActive,
    reversalWindowActive: reversalActive,
    reversalWindowCyclesRemaining: cyclesRemaining,
    previousMatureRegime: _matureReversalPrevRegime || null,
    reversalDetectedAt: _matureReversalDetectedAt || null
  };
}

// H4: Escalation caps matrix — convictionConsistencyValidation
function convictionConsistencyValidation(intensity, convictionClass, convictionScore, durabilityClass, confidence, matureReversal, fallbackModCount) {
  const caps = [];
  let capped = intensity;
  const INTENSITY_RANK = { 'OBSERVE': 0, 'MAINTAIN': 0, 'CONSIDER': 1, 'ACT': 2, 'PRIORITISE_REDUCTION': 3 };
  const applyRank = (cap, reason) => {
    if ((INTENSITY_RANK[capped] || 0) > (INTENSITY_RANK[cap] || 0)) {
      capped = cap; caps.push(reason);
    }
  };
  // H3 override — highest priority
  if (matureReversal) { capped = 'OBSERVE'; caps.push('MATURE_REVERSAL_OVERRIDE'); return { intensity: capped, caps }; }
  // Compound no-confidence floor (H4.4)
  if ((confidence || 0) < 0.50 && durabilityClass === 'EMERGING' && (fallbackModCount || 0) >= 2) {
    capped = 'OBSERVE'; caps.push('COMPOUND_NO_CONFIDENCE_FLOOR'); return { intensity: capped, caps };
  }
  // Individual caps
  if (convictionClass === 'LOW')                                    applyRank('CONSIDER', 'LOW_CONVICTION_CAP');
  if (convictionClass === 'MODERATE')                               applyRank('ACT', 'MODERATE_CONVICTION_CAP');
  if (durabilityClass === 'EMERGING')                               applyRank('CONSIDER', 'EMERGING_DURABILITY_CAP');
  if (durabilityClass === 'CONFIRMING' && convictionClass !== 'HIGH' && convictionClass !== 'STRONG') applyRank('ACT', 'CONFIRMING_DURABILITY_CAP');
  if ((confidence || 0) < 0.40)                                     applyRank('OBSERVE', 'LOW_CONFIDENCE_CAP');
  else if ((confidence || 0) < 0.60)                                applyRank('CONSIDER', 'MEDIUM_CONFIDENCE_CAP');
  if ((fallbackModCount || 0) >= 3)                                  applyRank('CONSIDER', 'HIGH_FALLBACK_CAP');
  return { intensity: capped, caps };
}

// H1: Final Governance Sanitizer
const FGS_VERSION = '1.0';

function fgsSanitize(narrative, narrativeMeta, brainLatest) {
  if (!narrative) return { narrative, fgsResult: { executed: false, failureFallback: false, sanitizationsApplied: 0, categoriesTriggered: [], convictionDowngradesApplied: 0, suppressionsApplied: 0, sanitizerVersion: FGS_VERSION } };
  let sanitizationsApplied = 0;
  let suppressionsApplied = 0;
  let convictionDowngradesApplied = 0;
  const categoriesTriggered = [];
  const out = { ...narrative };
  const convClass = (brainLatest && brainLatest.convictionClass) || null;
  const durClass = (brainLatest && brainLatest.durabilityClass) || 'EMERGING';
  const fieldsToSanitize = ['summary', 'tacticalView', 'macroContext', 'confidenceNote',
    'portfolioPostureNote', 'durabilityNote', 'convictionQualifier',
    'deploymentPacingNote', 'stressAwarenessNote'];
  for (const field of fieldsToSanitize) {
    if (!out[field] || typeof out[field] !== 'string') continue;
    let text = out[field];
    // S1: Transaction specificity
    const s1rx = /\b(move|shift|transfer|invest|withdraw|redeploy|allocate)\s+\d+[\d.]*\s*%/gi;
    if (s1rx.test(text)) { text = text.replace(s1rx, '[Specific allocation guidance is the responsibility of the advisor.]'); sanitizationsApplied++; if (!categoriesTriggered.includes('S1_TRANSACTION_SPECIFICITY')) categoriesTriggered.push('S1_TRANSACTION_SPECIFICITY'); }
    // S2: Urgency framing
    const s2patterns = ['must act now','act immediately','urgent','time-sensitive','window closing','limited time','don\'t delay','act before markets','once in a decade'];
    for (const p of s2patterns) { if (text.toLowerCase().includes(p)) { text = text.replace(new RegExp(p, 'gi'), ''); sanitizationsApplied++; if (!categoriesTriggered.includes('S2_URGENCY_FRAMING')) categoriesTriggered.push('S2_URGENCY_FRAMING'); } }
    // S3: Product/security references (generic patterns)
    const s3rx = /\b(fund|scheme|ETF|NAV|ISIN|BeES|Index Fund)\s+[A-Z][a-zA-Z]+/g;
    if (s3rx.test(text)) { text = text.replace(s3rx, 'equity-oriented allocation'); sanitizationsApplied++; if (!categoriesTriggered.includes('S3_PRODUCT_REFERENCE')) categoriesTriggered.push('S3_PRODUCT_REFERENCE'); }
    // S4: Prohibited certainty framing
    const s4patterns = ['guaranteed','certain to','will definitely','cannot fail','assured','risk-free','no downside','safe investment','best time to invest','ideal allocation','perfect entry'];
    for (const p of s4patterns) { if (text.toLowerCase().includes(p)) { text = text.replace(new RegExp(p, 'gi'), 'signal conditions are constructive'); sanitizationsApplied++; suppressionsApplied++; if (!categoriesTriggered.includes('S4_CERTAINTY_FRAMING')) categoriesTriggered.push('S4_CERTAINTY_FRAMING'); } }
    // S5: Conviction-language alignment
    if (convClass === 'LOW') {
      const s5map = [['strong opportunity','potential opportunity warrants monitoring'],['deploy now','conditions may support gradual consideration'],['significant upside','some upside signals are present'],['high conviction',''],['act on this','consider monitoring']];
      for (const [from, to] of s5map) { if (text.toLowerCase().includes(from)) { text = text.replace(new RegExp(from, 'gi'), to); convictionDowngradesApplied++; sanitizationsApplied++; if (!categoriesTriggered.includes('S5_CONVICTION_ALIGNMENT')) categoriesTriggered.push('S5_CONVICTION_ALIGNMENT'); } }
    }
    // S6: Suitability claims
    const s6patterns = ['suitable for','appropriate for your','fits your profile','meets your requirement','ideal for','designed for investors like'];
    for (const p of s6patterns) { if (text.toLowerCase().includes(p)) { text = text.replace(new RegExp(p, 'gi'), 'relevant to current market conditions'); sanitizationsApplied++; if (!categoriesTriggered.includes('S6_SUITABILITY_CLAIM')) categoriesTriggered.push('S6_SUITABILITY_CLAIM'); } }
    // S7: Fear amplification (RISK_OFF contexts)
    const s7patterns = [['market crash','sustained risk-off conditions'],['collapse is coming','sustained risk-off signals present'],['emergency rebalancing','defensive posture adjustment'],['flee to safety','increase allocation to defensive assets'],['catastrophic','significant'],['panic selling','sustained risk-off pressure']];
    for (const [from, to] of s7patterns) { if (text.toLowerCase().includes(from)) { text = text.replace(new RegExp(from, 'gi'), to); sanitizationsApplied++; if (!categoriesTriggered.includes('S7_FEAR_AMPLIFICATION')) categoriesTriggered.push('S7_FEAR_AMPLIFICATION'); } }
    out[field] = text.trim();
  }
  // H1.5 suppressions — remove entire sentences with prohibited patterns
  const suppressPatterns = [/[^.!?]*\d+[\d.]*\s*%[^.!?]*(?:returns?|gains?|growth)[^.!?]*[.!?]/gi, /[^.!?]*(?:market will|markets will|will rise|will fall)[^.!?]*(?:next quarter|next month|this year)[^.!?]*[.!?]/gi, /[^.!?]*(?:SEBI|RBI|regulatory)[^.!?]*(?:compliant|approved|guideline)[^.!?]*[.!?]/gi];
  for (const field of ['summary','tacticalView']) {
    if (!out[field]) continue;
    for (const rx of suppressPatterns) { if (rx.test(out[field])) { out[field] = out[field].replace(rx, '').trim(); suppressionsApplied++; } }
  }
  return {
    narrative: out,
    fgsResult: {
      executed: true,
      sanitizationsApplied,
      categoriesTriggered,
      convictionDowngradesApplied,
      suppressionsApplied,
      postSanitizationLength: JSON.stringify(out).length,
      sanitizerVersion: FGS_VERSION,
      failureFallback: false
    }
  };
}

////////////////////////////////////////////////////////
// SECTION-19A-V9 : REGIME DURABILITY ENGINE (Sprint 1)
// computeRegimeDurability(memory, moduleScores) -> { durabilityScore, durabilityClass }
// Formula: 0.40*ageScore + 0.35*stabilityScore + 0.25*signalConsensus
////////////////////////////////////////////////////////

function computeRegimeDurability(memory, moduleScores) {
  // T5: Proportional degradation — insufficient history returns graduated score, not binary 0.15
  if (!memory || !Array.isArray(memory.signalsHistory)) {
    return { durabilityScore: 0.10, durabilityClass: 'EMERGING', durabilityFallback: true, fallbackReason: 'NO_MEMORY' };
  }
  if (memory.signalsHistory.length < 3) {
    // Proportional: 0 entries = 0.10, 1 entry = 0.13, 2 entries = 0.16
    const partialScore = 0.10 + (memory.signalsHistory.length * 0.03);
    return { durabilityScore: Math.round(partialScore * 1000)/1000, durabilityClass: 'EMERGING',
      durabilityFallback: true, fallbackReason: 'INSUFFICIENT_HISTORY_' + memory.signalsHistory.length };
  }
  const cycles = typeof memory.cyclesSinceChange === 'number' ? memory.cyclesSinceChange : 0;
  const ageScore = Math.min(1.0, cycles / 20);
  const last10 = memory.signalsHistory.slice(-10);
  let stabilityScore = 1.0;
  if (last10.length >= 2) {
    const scores = last10.map(e => (typeof e.compositeScore === 'number' ? e.compositeScore : 50));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / scores.length;
    stabilityScore = Math.max(0, 1 - (variance / 25));
  }
  let signalConsensus = 0.5;
  const regime = memory.lastSnapshot && memory.lastSnapshot.regime ? memory.lastSnapshot.regime : null;
  if (regime && moduleScores && typeof moduleScores === 'object') {
    const modArr = Object.values(moduleScores).filter(m => m && typeof m.score === 'number' && m.score !== null);
    if (modArr.length > 0) {
      let agreeing = 0;
      for (const m of modArr) {
        const s = m.score;
        if ((regime === 'RISK_ON' || regime === 'STRONG_RISK_ON') && s >= 55) agreeing++;
        else if ((regime === 'RISK_OFF' || regime === 'STRONG_RISK_OFF') && s <= 45) agreeing++;
        else if (regime === 'NEUTRAL' && s >= 43 && s <= 57) agreeing++;
      }
      signalConsensus = agreeing / modArr.length;
    }
  }
  const durabilityScore = Math.round(((0.40 * ageScore) + (0.35 * stabilityScore) + (0.25 * signalConsensus)) * 1000) / 1000;
  let durabilityClass;
  if (durabilityScore >= 0.75)      durabilityClass = 'MATURE';
  else if (durabilityScore >= 0.50) durabilityClass = 'ESTABLISHED';
  else if (durabilityScore >= 0.25) durabilityClass = 'CONFIRMING';
  else                              durabilityClass = 'EMERGING';
  return { durabilityScore, durabilityClass, durabilityFallback: false, fallbackReason: null };
}

////////////////////////////////////////////////////////
// SECTION-19B-V9 : CONVICTION ENGINE (Sprint 2)
// computeConviction(confidence, durabilityScore, portfolioAlignmentScore)
// Formula: (0.40 x confidence) + (0.35 x durabilityScore) + (0.25 x portfolioAlignmentScore)
// portfolioAlignmentScore defaults to 0.50 (neutral) when no portfolio context
////////////////////////////////////////////////////////

function computeConviction(confidence, durabilityScore, portfolioAlignmentScore) {
  // Input normalisation and fallback
  const _conf  = (typeof confidence         === 'number' && isFinite(confidence))         ? Math.min(1, Math.max(0, confidence))         : 0.50;
  const _dur   = (typeof durabilityScore    === 'number' && isFinite(durabilityScore))    ? Math.min(1, Math.max(0, durabilityScore))    : 0.15;
  const _align = (typeof portfolioAlignmentScore === 'number' && isFinite(portfolioAlignmentScore)) ? Math.min(1, Math.max(0, portfolioAlignmentScore)) : 0.50;

  const raw = (0.40 * _conf) + (0.35 * _dur) + (0.25 * _align);
  const convictionScore = Math.round(raw * 1000) / 1000;

  let convictionClass;
  if (convictionScore >= 0.75)      convictionClass = 'STRONG';
  else if (convictionScore >= 0.55) convictionClass = 'HIGH';
  else if (convictionScore >= 0.30) convictionClass = 'MODERATE';
  else                              convictionClass = 'LOW';

  const _isDurabilityFallback = (_dur === 0.15);
  return {
    convictionScore,
    convictionClass,
    convictionComponents: { confidence: _conf, durabilityScore: _dur, portfolioAlignmentScore: _align },
    convictionDataQuality: _isDurabilityFallback ? 'FALLBACK_DURABILITY' : 'LIVE'
  };
}

// Conviction smoothing — Brain.Auto CONFIDENCE_SMOOTHING = 0.70
// Prevents single-cycle spikes. Applied in brain scheduler.
let _lastConvictionScore = null;
let _lastConvictionTs = null;
const CONVICTION_SMOOTHING = 0.70;

function smoothConviction(prev, next) {
  if (prev === null || prev === undefined) return next;
  return Math.round(((CONVICTION_SMOOTHING * prev) + ((1 - CONVICTION_SMOOTHING) * next)) * 1000) / 1000;
}

// Conviction trajectory detection — 5-cycle declining trend
const _convictionHistory = [];
function updateConvictionTrajectory(score) {
  _convictionHistory.push(score);
  if (_convictionHistory.length > 5) _convictionHistory.shift();
  if (_convictionHistory.length < 5) return 'INSUFFICIENT_DATA';
  const declining = _convictionHistory.every((v, i) => i === 0 || v <= _convictionHistory[i - 1]);
  const rising    = _convictionHistory.every((v, i) => i === 0 || v >= _convictionHistory[i - 1]);
  if (declining) return 'DECLINING';
  if (rising)    return 'RISING';
  return 'STABLE';
}

////////////////////////////////////////////////////////
// SECTION-19C-V9 : PORTFOLIO CONTEXT ENGINE (Sprint 3)
// PortfolioContextEngine.compute() — pure function, no I/O, no caching
// Constitutional: allocation values NEVER logged or persisted
////////////////////////////////////////////////////////

const PCE_EQUITY_RANGES = {
  STRONG_RISK_ON: { Conservative: [35,50], Moderate: [55,70], Aggressive: [70,85] },
  RISK_ON:        { Conservative: [30,45], Moderate: [50,65], Aggressive: [65,80] },
  NEUTRAL:        { Conservative: [25,40], Moderate: [40,55], Aggressive: [55,70] },
  RISK_OFF:       { Conservative: [15,30], Moderate: [25,40], Aggressive: [35,55] },
  STRONG_RISK_OFF:{ Conservative: [10,20], Moderate: [15,30], Aggressive: [25,40] }
};

const PCE_ALIGNMENT_SCORES = {
  APPROPRIATELY_POSITIONED: 0.20,
  MINIMAL:   0.30,
  MODERATE:  0.55,
  SIGNIFICANT: 0.75,
  SUBSTANTIAL: 0.90
};

function pceComputePortfolioContext(equityPct, debtPct, goldPct, riskProfile, regime, durabilityClass) {
  // Input validation
  const VALID_PROFILES = ['Conservative', 'Moderate', 'Aggressive'];
  const VALID_REGIMES  = ['STRONG_RISK_ON','RISK_ON','NEUTRAL','RISK_OFF','STRONG_RISK_OFF'];

  if (typeof equityPct !== 'number' || typeof debtPct !== 'number') {
    return { valid: false, error: 'PCE_INVALID_INPUT', provided: true };
  }
  const _gold = (typeof goldPct === 'number') ? goldPct : (100 - equityPct - debtPct);
  const _sum = equityPct + debtPct + _gold;
  if (Math.abs(_sum - 100) > 1) {
    return { valid: false, error: 'PCE_INVALID_INPUT', reason: 'sum_check_failed', provided: true };
  }
  if (equityPct < 0 || debtPct < 0 || _gold < 0) {
    return { valid: false, error: 'PCE_INVALID_INPUT', reason: 'negative_value', provided: true };
  }
  if (!VALID_PROFILES.includes(riskProfile)) {
    return { valid: false, error: 'PCE_INVALID_INPUT', reason: 'invalid_risk_profile', provided: true };
  }
  const _regime = VALID_REGIMES.includes(regime) ? regime : 'NEUTRAL';
  const _dur    = durabilityClass || 'EMERGING';

  // Equity range lookup
  const _baseRange = PCE_EQUITY_RANGES[_regime][riskProfile];
  let _lower = _baseRange[0];
  let _upper = _baseRange[1];

  // Durability adjustment
  if (_dur === 'EMERGING') { _lower -= 5; _upper += 5; }
  if (_dur === 'MATURE' && riskProfile === 'Aggressive') { _upper -= 5; }
  _lower = Math.max(0, _lower);
  _upper = Math.min(100, _upper);

  const _midpoint = (_lower + _upper) / 2;
  const _gap = equityPct - _midpoint;
  const _absGap = Math.abs(_gap);

  // Mismatch direction
  let mismatchDirection;
  if (_absGap < 5)       mismatchDirection = 'APPROPRIATELY_POSITIONED';
  else if (_gap > 0)     mismatchDirection = 'OVERWEIGHT';
  else                   mismatchDirection = 'UNDERWEIGHT';

  // Mismatch class
  let mismatchClass;
  if (_absGap < 5)        mismatchClass = 'MINIMAL';
  else if (_absGap < 10)  mismatchClass = 'MODERATE';
  else if (_absGap < 20)  mismatchClass = 'SIGNIFICANT';
  else                    mismatchClass = 'SUBSTANTIAL';

  // Deployment capacity
  const _cap = mismatchDirection === 'UNDERWEIGHT' ? Math.abs(_gap) : 0;
  let deploymentCapacityClass;
  if (_cap < 5)       deploymentCapacityClass = 'MINIMAL';
  else if (_cap < 15) deploymentCapacityClass = 'MODERATE';
  else                deploymentCapacityClass = 'SUBSTANTIAL';

  // portfolioAlignmentScore for conviction engine
  const _alignKey = mismatchDirection === 'APPROPRIATELY_POSITIONED' ? 'APPROPRIATELY_POSITIONED' : mismatchClass;
  const portfolioAlignmentScore = PCE_ALIGNMENT_SCORES[_alignKey] ?? 0.50;

  return {
    provided: true,
    valid: true,
    riskProfile,
    goldPctDerived: (typeof goldPct !== 'number'),
    goldPctAssumed: (typeof goldPct !== 'number') ? _gold : null,
    mismatchDirection,
    mismatchMagnitude: Math.round(_gap * 10) / 10,
    mismatchClass,
    deploymentCapacity: Math.round(_cap * 10) / 10,
    deploymentCapacityClass,
    targetRange: { lower: _lower, upper: _upper },
    portfolioAlignmentScore,
    computedAt: Date.now()
  };
}

////////////////////////////////////////////////////////
// SECTION-19D-V9 : ADVISORY COGNITION LAYER (Sprint 4)
// aclComputeAdvisoryPosture() -- convergence of Market State + Portfolio State
// Constitutional: no securities, no amounts, no suitability, deterministic
////////////////////////////////////////////////////////

function aclClassifyScenario(regime, durabilityClass, mismatchDirection, mismatchClass, confidence) {
  const _bullish  = ['RISK_ON','STRONG_RISK_ON'].includes(regime);
  const _bearish  = ['RISK_OFF','STRONG_RISK_OFF'].includes(regime);
  const _neutral  = regime === 'NEUTRAL';
  const _confirmed = ['ESTABLISHED','MATURE'].includes(durabilityClass);
  const _fresh     = ['EMERGING','CONFIRMING'].includes(durabilityClass);
  const _lowConf   = confidence < 0.40;
  const _over      = mismatchDirection === 'OVERWEIGHT';
  const _under     = mismatchDirection === 'UNDERWEIGHT';
  const _appropriate = mismatchDirection === 'APPROPRIATELY_POSITIONED';
  const _substantial = mismatchClass === 'SUBSTANTIAL';
  const _mature    = durabilityClass === 'MATURE';

  // H: ANY_REGIME + SUBSTANTIAL_MISMATCH + LOW_CONFIDENCE (check first — highest priority)
  if (_substantial && _lowConf) return 'H';
  // I: LATE_CYCLE_WARNING — MATURE RISK_ON (simplified: no horizonAlignment in v9 Sprint 4)
  if (_mature && _bullish && _over) return 'I';
  // A: CONFIRMED_BULLISH + OVERWEIGHT
  if (_bullish && _confirmed && _over) return 'A';
  // B: CONFIRMED_BULLISH + UNDERWEIGHT
  if (_bullish && _confirmed && _under) return 'B';
  // C: FRESH_BULLISH + ANY
  if (_bullish && _fresh) return 'C';
  // F: CONFIRMED_BEARISH + OVERWEIGHT
  if (_bearish && _confirmed && _over) return 'F';
  // G: CONFIRMED_BEARISH + APPROPRIATE/UNDERWEIGHT
  if (_bearish && _confirmed && (_appropriate || _under)) return 'G';
  // D: NEUTRAL + OVERWEIGHT SIGNIFICANT+
  if (_neutral && _over && ['SIGNIFICANT','SUBSTANTIAL'].includes(mismatchClass)) return 'D';
  // E: NEUTRAL + APPROPRIATELY_POSITIONED (or any remaining neutral)
  return 'E';
}

function aclGetIntensityAndPacing(scenario, durabilityClass) {
  const _mature = durabilityClass === 'MATURE';
  const _established = durabilityClass === 'ESTABLISHED';
  switch (scenario) {
    case 'A': return { intensity: 'MAINTAIN',             pacing: null };
    case 'B': return { intensity: _established||_mature ? 'ACT' : 'CONSIDER',
                       pacing: _mature ? { tranches:2, periodWeeks:3 } : _established ? { tranches:4, periodWeeks:4 } : { tranches:7, periodWeeks:7 } };
    case 'C': return { intensity: 'OBSERVE',              pacing: null };
    case 'D': return { intensity: 'CONSIDER',             pacing: { tranches:7, periodWeeks:7 } };
    case 'E': return { intensity: 'MAINTAIN',             pacing: null };
    case 'F': return { intensity: 'PRIORITISE_REDUCTION', pacing: { tranches:2, periodWeeks:3 } };
    case 'G': return { intensity: 'MAINTAIN',             pacing: null };
    case 'H': return { intensity: 'OBSERVE',              pacing: null };
    case 'I': return { intensity: 'ACT',                  pacing: { tranches:2, periodWeeks:3 } };
    default:  return { intensity: 'OBSERVE',              pacing: null };
  }
}

const ACL_POSTURE_TEMPLATES = {
  A: 'Regime supports equity positioning. Portfolio is well-deployed. Maintain current allocation and monitor for late-cycle signals.',
  B: 'Confirmed regime supports increased equity allocation. Gradual deployment appropriate given conviction level.',
  C: 'Regime signal is present but unconfirmed. Await durability confirmation before adjusting allocation.',
  D: 'Market regime is neutral. Elevated equity exposure creates unnecessary risk. Gradual reduction towards target range is appropriate.',
  E: 'Market regime is neutral and portfolio is appropriately positioned. Maintain current allocation.',
  F: 'Defensive regime confirmed. Portfolio is over-exposed to equity risk. Prioritise reduction towards target range.',
  G: 'Defensive regime confirmed. Portfolio is appropriately positioned or defensively oriented. Maintain defensive posture.',
  H: 'Significant positioning gap detected under low confidence conditions. Validate data quality before acting.',
  I: 'Regime is mature and portfolio is over-positioned. Late-cycle discipline suggests selective and measured approach.'
};

const ACL_STRESS_TABLE = {
  Conservative: '3-7% historical drawdown range observed in similar conditions.',
  Moderate:     '7-15% historical drawdown range observed in similar conditions.',
  Aggressive:   '12-22% historical drawdown range observed in similar conditions.'
};

function aclComputeAdvisoryPosture(marketState, portfolioState, convictionScore, convictionClass) {
  // Input validation
  if (!marketState || !marketState.regime) { return { valid: false, error: 'ACL_MARKET_STATE_UNAVAILABLE', aclEligibility: false, degradationStatus: 'MARKET_STATE_UNAVAILABLE' }; }
  if (!portfolioState || !portfolioState.provided) { return { valid: false, error: 'ACL_NO_PORTFOLIO_CONTEXT', aclEligibility: false, degradationStatus: 'NO_PORTFOLIO_CONTEXT' }; }
  if (!portfolioState.valid) { return { valid: false, error: 'ACL_INVALID_PORTFOLIO_INPUT', aclEligibility: false, degradationStatus: 'INVALID_PORTFOLIO_INPUT' }; }

  const { regime, durabilityClass, confidence } = marketState;
  const { mismatchDirection, mismatchClass, riskProfile } = portfolioState;

  const scenario    = aclClassifyScenario(regime, durabilityClass, mismatchDirection, mismatchClass, confidence || 0.50);
  const { intensity, pacing } = aclGetIntensityAndPacing(scenario, durabilityClass);
  const postureStatement = ACL_POSTURE_TEMPLATES[scenario] || ACL_POSTURE_TEMPLATES['E'];

  // portfolioPostureValidation — constitutional safety check
  const _violations = [];
  if (/[0-9]+%/.test(postureStatement))      _violations.push('AMOUNT_IN_STATEMENT');
  if (/fund|scheme|stock|bond/i.test(postureStatement)) _violations.push('SECURITY_NAMED');
  if (/suitable|appropriate for you/i.test(postureStatement)) _violations.push('SUITABILITY_CLAIM');
  if (_violations.length > 0) {
    return { valid: false, error: 'ACL_GOVERNANCE_VIOLATION', violations: _violations };
  }

  // stressAwarenessNote — RISK_OFF ESTABLISHED/MATURE only
  let stressAwarenessNote = null;
  const _bearishConfirmed = ['RISK_OFF','STRONG_RISK_OFF'].includes(regime) && ['ESTABLISHED','MATURE'].includes(durabilityClass);
  if (_bearishConfirmed && riskProfile && ACL_STRESS_TABLE[riskProfile]) {
    stressAwarenessNote = 'Historical analogue (not a projection): ' + ACL_STRESS_TABLE[riskProfile];
  }

  const _govDowngrades = [];
  let _cappedIntensity = intensity;
  const _capsApplied = [];
  const _convScore = (typeof convictionScore === 'number') ? convictionScore : 0.50;
  if (_convScore < 0.30 && ['ACT','CONSIDER','PRIORITISE_REDUCTION'].indexOf(_cappedIntensity) >= 0) { _cappedIntensity = 'OBSERVE'; _capsApplied.push('LOW_CONVICTION_CAP'); _govDowngrades.push('conviction<0.30->OBSERVE'); }
  if (durabilityClass === 'EMERGING' && ['ACT','PRIORITISE_REDUCTION'].indexOf(_cappedIntensity) >= 0) { _cappedIntensity = 'CONSIDER'; _capsApplied.push('EMERGING_DURABILITY_CAP'); _govDowngrades.push('EMERGING->CONSIDER'); }
  if ((confidence || 0) < 0.40 && ['ACT','CONSIDER','PRIORITISE_REDUCTION'].indexOf(_cappedIntensity) >= 0) { _cappedIntensity = 'OBSERVE'; _capsApplied.push('LOW_CONFIDENCE_CAP'); _govDowngrades.push('conf<0.40->OBSERVE'); }
  // RF-1: fallback durability governance cap
  const _durScore_acl = (marketState && typeof marketState.durabilityScore === 'number') ? marketState.durabilityScore : 0.15;
  const _durIsFallback = (_durScore_acl === 0.15);
  if (_durIsFallback && ['ACT','CONSIDER','PRIORITISE_REDUCTION'].indexOf(_cappedIntensity) >= 0) { _cappedIntensity = 'OBSERVE'; _capsApplied.push('FALLBACK_DURABILITY_CAP'); _govDowngrades.push('fallback_durability->OBSERVE'); }
  return {
    valid: true,
    scenarioType:        scenario,
    adjustmentIntensity: _cappedIntensity,
    mismatchDirection,
    mismatchClass,
    deploymentPacing:    pacing,
    postureStatement,
    stressAwarenessNote,
    horizonQualification: null,
    advisoryBasisTrace: {
      regimeInput:             regime,
      durabilityInput:         durabilityClass,
      mismatchInput:           mismatchDirection + '_' + mismatchClass,
      convictionInput:         convictionClass || null,
      convictionScoreInput:    typeof convictionScore === 'number' ? convictionScore : null,
      scenarioResolution:      scenario,
      scenarioResolutionMethod: ['A','B','C','D','F','G','H','I'].indexOf(scenario) >= 0 ? 'EXPLICIT' : 'FALLTHROUGH'
    },
    computedAt:              Date.now(),
    portfolioContextProvided: true,
    requestedIntensity:   intensity,
    cappedIntensity:      _cappedIntensity,
    capsApplied:          _capsApplied,
    governanceDowngrades: _govDowngrades,
    aclEligibility:       true,
    degradationStatus:    _capsApplied.length > 0 ? 'GOVERNANCE_CAPPED' : 'CLEAN'
  };
}

////////////////////////////////////////////////////////
// SECTION-19B : REGIME ENGINE (AUTHORITATIVE)
////////////////////////////////////////////////////////

class RegimeEngine {
  constructor(dssCache, pinoLogger) {
    this._cache = dssCache;
    this._logger = pinoLogger;
    this._lastComputed = null;
  }

  async compute() {
    const equity      = this._cache.get("score:equity")      || { score: null, confidence: 0 };
    const technical   = this._cache.get("score:technical")   || { score: null, confidence: 0 };
    const global_     = this._cache.get("score:global")      || { score: null, confidence: 0 };
    const derivatives = this._cache.get("score:derivatives") || { score: null, confidence: 0 };
    const debt        = this._cache.get("score:debt")        || { score: null, confidence: 0 };
    const sector      = this._cache.get("score:sector")      || { score: null, confidence: 0 };

    const MODULE_WEIGHTS = { equity:0.30, technical:0.20, global_:0.20, derivatives:0.15, debt:0.10, sector:0.05 };
    const modules = { equity, technical, global_, derivatives, debt, sector };

    // P2-A: Dynamic weight redistribution (v8 DEF-NEW-002)
    // Modules on fallback (score=50 placeholder) have their base weight
    // redistributed proportionally to live modules so fallback gravity
    // toward NEUTRAL does not suppress decisive directional signals.
    // Invariant: MODULE_WEIGHTS unchanged. Redistribution is runtime-only.
    const _isFallback = (mod) =>
      mod.fallbackActive === true ||
      mod.sourceOrigin === "hardcoded-fallback" ||
      mod.sourceOrigin === "bootstrap-fallback";

    // Compute live base weight sum for redistribution denominator
    let _liveBaseWeight = 0;
    for (const [name, mod] of Object.entries(modules)) {
      if (mod.score === null || mod.score === undefined) continue;
      if (_isFallback(mod)) continue;
      _liveBaseWeight += MODULE_WEIGHTS[name];
    }

    let weightedSum = 0, activeWeightSum = 0;
    const _redistributionLog = {};
    for (const [name, mod] of Object.entries(modules)) {
      if (mod.score === null || mod.score === undefined) continue;
      const conf = mod.confidence || 0;
      const m = conf >= 0.60 ? 1.00 : conf >= 0.40 ? 0.70 : 0.00;
      if (m === 0.00) continue;
      // Skip fallback modules — do not contribute deadweight score=50
      if (_isFallback(mod) && _liveBaseWeight > 0) {
        _redistributionLog[name] = { skipped: true, reason: mod.sourceOrigin || "fallback" };
        continue;
      }
      // Redistribute: scale this module weight up by 1/_liveBaseWeight
      const baseW = MODULE_WEIGHTS[name];
      const redistributedW = _liveBaseWeight > 0 ? baseW / _liveBaseWeight : baseW;
      const ew = redistributedW * m;
      weightedSum += mod.score * ew;
      activeWeightSum += ew;
      _redistributionLog[name] = { baseW: Math.round(baseW*100)/100, redistributedW: Math.round(redistributedW*1000)/1000, ew: Math.round(ew*1000)/1000 };
    }

    const compositeScore = activeWeightSum > 0
      ? Math.round((weightedSum / activeWeightSum) * 10) / 10
      : 50;

    // P2-B: FRED/BLS/FedRSS macro modifier (v8 FSD Section 8 Priority 2c)
    // Bounded ±8pt adjustment applied after weighted module average.
    // Prevents US macro layer from dominating India-specific signals.
    const _fred = this._cache.get("macro:fred") || {};
    const _bls  = this._cache.get("macro:bls")  || {};
    const _rss  = this._cache.get("macro:fedrss") || {};
    let _macroMod = 0;
    const _macroModLog = [];
    // Yield curve signal (FRED T10Y2Y)
    const _spread = _fred.yieldSpread10_2 ?? null;
    if (_spread !== null) {
      if (_spread < -0.20) { _macroMod -= 5; _macroModLog.push("YIELD_INVERTED:-5"); }
      else if (_spread > 0.50) { _macroMod += 3; _macroModLog.push("YIELD_STEEP:+3"); }
    }
    // Fed funds rate (FRED FEDFUNDS)
    const _fedRate = _fred.fedFundsRate ?? null;
    if (_fedRate !== null) {
      if (_fedRate >= 5.00) { _macroMod -= 3; _macroModLog.push("FED_RESTRICTIVE:-3"); }
      else if (_fedRate < 2.00) { _macroMod += 3; _macroModLog.push("FED_ACCOMMODATIVE:+3"); }
    }
    // Labor signal (BLS UNRATE — prefer BLS, fallback to FRED)
    const _unemp = _bls.usUnemployment ?? _fred.usUnemployment ?? null;
    if (_unemp !== null) {
      if (_unemp <= 4.0) { _macroMod += 2; _macroModLog.push("LABOR_STRONG:+2"); }
      else if (_unemp > 5.5) { _macroMod -= 3; _macroModLog.push("LABOR_WEAK:-3"); }
    }
    // Fed tone (FedRSS)
    const _fedTone = _rss.overallTone ?? null;
    if (_fedTone === "HAWKISH") { _macroMod -= 2; _macroModLog.push("FED_HAWKISH:-2"); }
    else if (_fedTone === "DOVISH") { _macroMod += 2; _macroModLog.push("FED_DOVISH:+2"); }
    // Hard cap ±8 — macro cannot dominate India signals
    _macroMod = Math.max(-8, Math.min(8, _macroMod));
    const compositeScoreRaw = compositeScore;
    const compositeScoreFinal = Math.round((compositeScore + _macroMod) * 10) / 10;


    const regime = compositeScoreFinal >= 70 ? "STRONG_RISK_ON"
                 : compositeScoreFinal >= 55 ? "RISK_ON"
                 : compositeScoreFinal >= 45 ? "NEUTRAL"
                 : compositeScoreFinal >= 30 ? "RISK_OFF"
                 : "STRONG_RISK_OFF";

    const regimeLabel = compositeScoreFinal >= 70 ? "STRONGLY BULLISH"
                      : compositeScoreFinal >= 55 ? "BULLISH"
                      : compositeScoreFinal >= 45 ? "CAUTIOUSLY NEUTRAL"
                      : compositeScoreFinal >= 30 ? "BEARISH"
                      : "STRONGLY BEARISH";

    const actionBias = compositeScoreFinal >= 55 ? "Overweight equities; reduce cash"
                     : compositeScoreFinal >= 45 ? "Balanced; await confirmation"
                     : "Tilt toward debt and gold; reduce equity";

    const includedModules = Object.entries(modules)
      .filter(([, mod]) => mod.score !== null && (mod.confidence || 0) >= 0.40)
      .map(([name]) => name.replace("global_", "global"));

    const result = {
      compositeScore: compositeScoreFinal, regime, regimeLabel, actionBias, includedModules,
      compositeScoreRaw, macroModifier: _macroMod, macroModifierLog: _macroModLog,
      activeWeightSum: Math.round(activeWeightSum * 1000) / 1000,
      moduleScores: {
        equity: equity.score, technical: technical.score, global: global_.score,
        derivatives: derivatives.score, debt: debt.score, sector: sector.score,
      },
      computedAt: Date.now(),
      dataStatus: activeWeightSum >= 0.60 ? DATA_STATUS_ENUM.LIVE : DATA_STATUS_ENUM.STALE,
    };

    this._cache.set("regime:composite", result);
    this._cache.set("brain:compositeScore", compositeScore);
    this._lastComputed = result;

    this._logger.info({
      job: "regime-engine", compositeScore, regime, includedModules,
      activeWeightSum, moduleScores: result.moduleScores, ts: Date.now(),
    }, "RegimeEngine computed");

    return result;
  }

  read() {
    const cached = this._cache.get("regime:composite");
    if (cached) return cached;
    if (this._lastComputed) return this._lastComputed;
    return {
      compositeScore: 50, regime: "NEUTRAL", regimeLabel: "CAUTIOUSLY NEUTRAL",
      actionBias: "Balanced; await confirmation", includedModules: [],
      moduleScores: { equity:null, technical:null, global:null, derivatives:null, debt:null, sector:null },
      computedAt: null, dataStatus: DATA_STATUS_ENUM.UNAVAILABLE,
    };
  }
}

const regimeEngine = new RegimeEngine(DSSCache, logger);

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

    const levels=[...support.map(l=>({...l,type:"support"})),...resistance.map(l=>({...l,type:"resistance"}))].sort((a,b)=>a.value-b.value);
return {

    regime,

    support,

    resistance,
    levels,

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
		  // SESSION 20C: RegimeEngine is single authority — read directly
		  const rd = regimeEngine.read();
		  if (rd && typeof rd.compositeScore === 'number') return rd.compositeScore;
		  // Cold-start fallback only (RegimeEngine not yet computed)
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
				// DEF-005: Credit Growth score is hardcoded — no live source connected yet
			{ name: "Credit Growth", score: 60, color: "#00c97a", dataQuality: "hardcoded", staleReason: "Live RBI credit data not yet fetched" },
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
		  // Session 20K: India VIX from allIndices (same feed, no Yahoo dependency)
		  const vixRow = nseIndexJson?.data?.find(x => x.index === "INDIA VIX");
		  if (vixRow && vixRow.last) {
			marketCache.vixValue = Number(vixRow.last);
			logger.info({ indiaVix: marketCache.vixValue }, "India VIX updated from NSE allIndices");
		  }
		  // END India VIX
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

		// ── SESSION 18 STEP 2: score:technical + signals:technical ──
		safeExecute(() => {
		  let _tScore = 50;
		  if (rsi !== null) {
		    if (rsi < 30) _tScore += 15; else if (rsi > 70) _tScore -= 15;
		    else if (rsi < 45) _tScore -= 5; else if (rsi > 55) _tScore += 5;
		  }
		  if (macd !== null) { if (macd > 0) _tScore += 10; else _tScore -= 10; }
		  const _niftyLtp = current || null;
		  if (_niftyLtp && sma50)  { if (_niftyLtp > sma50)  _tScore += 8;  else _tScore -= 8;  }
		  if (_niftyLtp && sma200) { if (_niftyLtp > sma200) _tScore += 7;  else _tScore -= 7;  }
		  if (sma50 && sma200)     { if (sma50 > sma200)     _tScore += 5;  else _tScore -= 5;  }
		  _tScore = Math.max(0, Math.min(100, _tScore));

		  const _liveInd = [rsi, macd, sma50, sma200].filter(v => v !== null).length;
		  const _tConf   = _liveInd === 4 ? 0.90 : _liveInd === 3 ? 0.75 : _liveInd === 2 ? 0.55 : 0.30;

		  DSSCache.set("score:technical", {
		    score: _tScore, confidence: _tConf,
		    sourceOrigin: dailyCloses.length >= 200 ? "yahoo-daily-live" : "yahoo-daily-partial",
		    fallbackActive: dailyCloses.length < 50,
		    staleReason: dailyCloses.length < 50 ? "Insufficient candle history" : null,
		    fetchedAt: Date.now(), cacheAgeMin: 0
		  });

		  const _tSignals = [];
		  if (rsi !== null)         _tSignals.push({ name: "RSI (14)",  value: rsi,   signal: rsi < 30 ? "BUY" : rsi > 70 ? "SELL" : "WATCH",         sentiment: rsi < 30 ? "bullish" : rsi > 70 ? "bearish" : "neutral",           confidence: _tConf, source: "derived" });
		  if (macd !== null)        _tSignals.push({ name: "MACD",      value: macd,  signal: macd > 0 ? "BUY" : "SELL",                               sentiment: macd > 0 ? "bullish" : "bearish",                                   confidence: _tConf, source: "derived" });
		  if (_niftyLtp && sma50)   _tSignals.push({ name: "50DMA",     value: sma50, signal: _niftyLtp > sma50  ? "BUY" : "SELL",                    sentiment: _niftyLtp > sma50  ? "bullish" : "bearish",                        confidence: _tConf, source: "derived" });
		  if (_niftyLtp && sma200)  _tSignals.push({ name: "200DMA",    value: sma200,signal: _niftyLtp > sma200 ? "BUY" : "SELL",                    sentiment: _niftyLtp > sma200 ? "bullish" : "bearish",                        confidence: _tConf, source: "derived" });

		  DSSCache.set("signals:technical", {
		    signals: _tSignals, rsi, macd, sma50, sma200, niftyLtp: _niftyLtp, crossSignal,
		    sourceOrigin: "nse-yahoo-hybrid", fallbackActive: dailyCloses.length < 50, fetchedAt: Date.now()
		  });

		  logger.info({ job: "score:technical-write", score: _tScore, confidence: _tConf, liveSignals: _liveInd, ts: Date.now() });
		}, null);
		// ── END score:technical + signals:technical ──

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
          // FedRSS scheduler — every 4h (infrequent Fed releases)
          setInterval(async () => { try { await fetchFedRSS(); } catch(e) {} }, 14400000);
          // BLS scheduler — daily refresh (monthly data, no need for frequent polling)
          setInterval(async () => { try { await fetchBLSMacro(); } catch(e) {} }, 86400000);
		          // FRED scheduler — first run 30s, then every 4h
          setTimeout(async () => {
            try { await fetchFREDMacro(); } catch(e) { logger.warn({err:e.message},"FRED initial fetch failed"); }
            setInterval(async () => { try { await fetchFREDMacro(); } catch(e) {} }, 14400000);
          }, 30000);
          // LLM narrative scheduler — 90s first run, then every 15min
          setTimeout(async () => {
            if(typeof refreshNarrativeCache==="function"){
              await refreshNarrativeCache();
              setInterval(()=>refreshNarrativeCache().catch(()=>{}),900000);
            }
          }, 90000);
setTimeout(async () => { await runNSEIndexJob(); }, 60000);
		setTimeout(() => {
		  refreshSectorCache();
		  setInterval(() => refreshSectorCache(), 600000);
		}, 180000);
		// refreshDebtCache setTimeout moved to 1-tab scope (scope fix)
		setTimeout(async () => { await fetchAMFISIPData(); }, 600000);
		setTimeout(async () => { await refreshEquityMacroCaches(); }, 45000);
		
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

	// ── regime-compute job (Session 19A) ──
	setTimeout(async () => {
	  await safeExecuteAsync(async () => { await regimeEngine.compute(); }, null);
	  setInterval(async () => {
	    await safeExecuteAsync(async () => { await regimeEngine.compute(); }, null);
	  }, 60000);
	}, 45000);
	// ── END regime-compute job ──
	// ── overview-compile job (Session 20A) ──
	setTimeout(() => {
	  safeExecute(() => { overviewEngine.build(); }, null);
	  setInterval(() => {
	    safeExecute(() => { overviewEngine.build(); }, null);
	  }, 60000);
	}, 50000);
	// ── END overview-compile job ──
        // ── debt-cache periodic refresh (T7 debt stabilization) ──
        // 90s retry: startup debt refresh may fail if FRED/Yahoo not ready
        // Startup race fix: 120s ensures FRED cache is populated before debt retry
        setTimeout(async () => {
          try {
            const _dc = DSSCache.get('score:debt');
            const _fredReady = !!(DSSCache.get('macro:fred')?.us10YYield);
            if (!_dc || _dc.fallbackActive === true || _dc.score === null || _dc.score === undefined) {
              if (!_fredReady) {
                logger.warn({ job: 'debt-scheduler', msg: 'FRED not ready at 120s — deferring debt retry 60s' });
                setTimeout(async () => { try { await refreshDebtCache(); } catch(e) {} }, 60000);
              } else {
                logger.info({ job: 'debt-scheduler', msg: 'startup debt fallback — FRED ready — triggering retry' });
                await refreshDebtCache();
                logger.info({ job: 'debt-scheduler', msg: 'debt cache retry complete' });
              }
            }
          } catch(e) { logger.warn({ job: 'debt-scheduler', err: e.message }, 'debt retry failed'); }
        }, 120000);
        // Periodic debt refresh every 15 minutes
        setInterval(async () => {
          try { await refreshDebtCache(); }
          catch(e) { logger.warn({ job: 'debt-scheduler', err: e.message }, 'periodic debt refresh failed'); }
        }, 15 * 60 * 1000);
        // ── END debt-cache periodic refresh ──
// ── narrative-gen job (Session 20F) ──
setTimeout(() => {
  safeExecute(() => { narrativeEngine.synthesize(); }, null);
  setInterval(() => {
    safeExecute(() => { narrativeEngine.synthesize(); }, null);
  }, 900000);
}, 60000);
// ── END narrative-gen job ──

// ── brain-auto scheduler (v8 P3-5) ──
// Populates brain:latest every 60s from RegimeEngine read()
// Phase 7 Step 1: cache population only — no route rewiring
setTimeout(() => {
  const runScheduledBrain = () => {
    try {
      const _brainRegime = regimeEngine.read();
      if (!_brainRegime || _brainRegime.compositeScore === null) return;
      // D27.1 RELOCATED: cyclesSinceChange increment (was orphaned in /brain-auto)
      // Canonical authority: MEMORY.lastSnapshot?.regime (ownership verified 2026-05-30)
      if (MEMORY.lastSnapshot && _brainRegime.regime !== MEMORY.lastSnapshot.regime) {
        MEMORY.lastRegimeChangeTs = Date.now();
        MEMORY.cyclesSinceChange = 0;
      } else if (MEMORY.lastSnapshot) {
        MEMORY.cyclesSinceChange = (MEMORY.cyclesSinceChange || 0) + 1;
      }
      saveMemory(MEMORY);
      // END D27.1 RELOCATED
      const _brainPayload = {
        compositeScore:    _brainRegime.compositeScore,
        regime:            _brainRegime.regime,
        regimeLabel:       _brainRegime.regimeLabel,
        actionBias:        _brainRegime.actionBias,
        moduleScores:      _brainRegime.moduleScores,
        macroModifier:     _brainRegime.macroModifier     ?? null,
        compositeScoreRaw: _brainRegime.compositeScoreRaw ?? null,
        macroModifierLog:  _brainRegime.macroModifierLog  ?? [],
        activeWeightSum:   _brainRegime.activeWeightSum   ?? null,
        confidence:        (DSSCache.get('score:equity')?.confidence ?? null),
        scheduledAt:       Date.now(),
        source:            'brain-scheduled',
        ...(() => { try {
          const _d = computeRegimeDurability(MEMORY, _brainRegime.moduleScores);
          return { durabilityScore: _d.durabilityScore, durabilityClass: _d.durabilityClass, cyclesSinceChange: MEMORY.cyclesSinceChange ?? 0 };
        } catch(e) { return { durabilityScore: 0.15, durabilityClass: 'EMERGING', cyclesSinceChange: 0 }; } })(),
        // v9 Sprint 2: Conviction Engine
        ...(() => { try {
          const _durScore  = (() => { try { return computeRegimeDurability(MEMORY, _brainRegime.moduleScores).durabilityScore; } catch(e) { return 0.15; } })();
          const _rawConv   = computeConviction(_brainRegime.confidence ?? (DSSCache.get('score:equity')?.confidence ?? 0.50), _durScore, 0.50);
          const _nowTs = Date.now();
          if (_lastConvictionTs && (_nowTs - _lastConvictionTs) > 300000) { _lastConvictionScore = null; }
          const _smoothed  = smoothConviction(_lastConvictionScore, _rawConv.convictionScore);
          _lastConvictionScore = _smoothed;
          _lastConvictionTs = _nowTs;
          const _trajectory = updateConvictionTrajectory(_smoothed);
          return { convictionScore: _smoothed, convictionClass: _rawConv.convictionClass, convictionComponents: _rawConv.convictionComponents, convictionTrajectory: _trajectory };
        } catch(e) { return { convictionScore: null, convictionClass: null, convictionComponents: null, convictionTrajectory: null }; } })(),
      };
      DSSCache.set('brain:latest', _brainPayload);
      DSSCache.set('brain:ts', Date.now());
      logger.info({ job: 'brain-scheduled', score: _brainPayload.compositeScore, regime: _brainPayload.regime }, 'brain:latest updated');
    } catch(e) {
      logger.warn({ err: e.message }, 'scheduled brain failed');
    }
  };
  runScheduledBrain();
  setInterval(runScheduledBrain, 60000);
}, 90000); // 30s after RegimeEngine first run (45s)
// ── END brain-auto scheduler ──


        // ── equity/global/derivatives bootstrap (Session 20I) ──
        DSSCache.set("score:equity", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        DSSCache.set("score:global", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        DSSCache.set("score:derivatives", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        // ── END equity/global/derivatives bootstrap ──

        // ── equity/global/derivatives bootstrap (Session 20I) ──
        DSSCache.set("score:equity", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        DSSCache.set("score:global", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        DSSCache.set("score:derivatives", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback", fallbackActive: true,
          staleReason: "bootstrap value — refreshEquityMacroCaches pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        // ── END equity/global/derivatives bootstrap ──

        // ── debt-bootstrap job (Session 20I) ──
        DSSCache.set("score:debt", {
          score: 50, confidence: 0.45,
          sourceOrigin: "bootstrap-fallback",
          fallbackActive: true,
          staleReason: "DEF-004: bootstrap value — refreshDebtCache pending",
          fetchedAt: Date.now(), cacheAgeMin: 0
        });
        setTimeout(async () => {
          try { await refreshDebtCache(); } catch(e) {
            logger.warn({ err: e.message }, "debt-bootstrap: refreshDebtCache failed");
          }
          setInterval(async () => {
            try { await refreshDebtCache(); } catch(e) {
              logger.warn({ err: e.message }, "debt-refresh-toplevel: failed");
            }
          }, 20 * 60 * 1000);
        }, 30000);
        
        // SPRINT 4A: LLM narrative cache — initial + 15min refresh
        setTimeout(async () => {
          if (typeof refreshNarrativeCache === "function") {
            await refreshNarrativeCache();
            setInterval(() => refreshNarrativeCache().catch(()=>{}), 900000);
          }
        }, 90000);
// ── END debt-bootstrap job ──




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
			  flows.push({ sector: sector.replaceAll("_", " "), value: `${flowObj.valueCr >= 0 ? "+" : "-"}₹${Math.abs(flowObj.valueCr)} Cr`, bull: flowObj.direction === "inflow", valueCr: flowObj.valueCr });
			  themes.push(themeObj);
			}

			if (heatmap.length < 4) {
			  logger.warn({ got: heatmap.length }, "buildSectorPayload: fewer than 4 sectors succeeded — payload suppressed");
			  return null;
			}
			if (heatmap.length < 8) {
			  logger.warn({ got: heatmap.length }, "buildSectorPayload: partial sector payload — persisting degraded cache");
			}

			const _maxCr=Math.max(1,...flows.map(f=>Math.abs(f.valueCr||0)));
			flows.forEach(f=>{f.flowPct=Math.min(100,Math.round(Math.abs(f.valueCr||0)/_maxCr*100));});
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

		// T7: Datasource priority rebalancing — FRED primary for US10Y, Yahoo secondary
		// This eliminates Yahoo-DOWN causing debt module fallback
		const _fredCache = DSSCache.get("macro:fred") || {};
		const _globalCache = DSSCache.get("equity:global") || {};

		// US10Y: FRED primary (already cached, refreshes independently)
		const _fredUs10Y = _fredCache.us10YYield ?? null;
		const _fredUs2Y  = _fredCache.us2YYield  ?? null;
		const _fredDXY   = _globalCache.dxy       ?? null;

		// Build us10YData from FRED if available, else try Yahoo
		let us10YData = null;
		if (_fredUs10Y !== null) {
		  us10YData = { current: _fredUs10Y, changePct: 0, source: 'FRED' };
		  logger.info({ job: 'buildDebtPayload', us10Y: _fredUs10Y, source: 'FRED' }, 'US10Y from FRED cache');
		} else {
		  logger.warn({ job: 'buildDebtPayload' }, 'FRED US10Y unavailable — attempting Yahoo fallback');
		  try { us10YData = await fetchYahooQuote(DEBT_SYMBOLS.US10Y); } catch(e) { us10YData = null; }
		}

		// US2Y: FRED primary, Yahoo fallback
		let us2YData = null;
		if (_fredUs2Y !== null) {
		  us2YData = { current: _fredUs2Y, changePct: 0, source: 'FRED' };
		} else {
		  try { await new Promise(r => setTimeout(r, 1000)); us2YData = await fetchYahooQuote(DEBT_SYMBOLS.US2Y); } catch(e) { us2YData = null; }
		}

		// DXY: global cache primary, Yahoo fallback
		let dxyData = null;
		if (_fredDXY !== null) {
		  dxyData = { current: _fredDXY, changePct: 0, source: 'global-cache' };
		} else {
		  try { await new Promise(r => setTimeout(r, 2000)); dxyData = await fetchYahooQuote(DEBT_SYMBOLS.DXY); } catch(e) { dxyData = null; }
		}

		// Gold: Yahoo only (no primary alternative — degrade gracefully)
		let goldData = null;
		try { await new Promise(r => setTimeout(r, 3000)); goldData = await fetchYahooQuote(DEBT_SYMBOLS.GOLD); } catch(e) { goldData = null; }

		// India macro: existing fetchIndiaMacro
		const macro = await fetchIndiaMacro();

		logger.info({ us10Y: !!us10YData, us10YSrc: us10YData?.source||'none', us2Y: !!us2YData, dxy: !!dxyData, gold: !!goldData, macro: !!macro }, "buildDebtPayload: data availability check");

		// Only us10Y and macro are required — dxy/gold degrade gracefully
		if (!us10YData || !macro) {
		  logger.warn({ us10Y: !!us10YData, fredUs10Y: _fredUs10Y, macro: !!macro }, "buildDebtPayload: null guard hit — returning null");
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

			// ── SESSION 18 STEP 2: score:sector + signals:sector ──
			safeExecute(() => {
			  const _heatmap  = payload.heatmap  || [];
			  const _rotation = payload.rotation || [];
			  const _total    = _rotation.length || 1;
			  const _bullCount = _rotation.filter(r => r.bull === true).length;
			  const _bearCount = _rotation.filter(r => r.bull === false).length;
			  let _sScore = 50 + ((_bullCount - _bearCount) / _total) * 30;
			  _sScore = Math.max(0, Math.min(100, Math.round(_sScore)));
			  const _sConf = _total >= 8 ? 0.85 : _total >= 6 ? 0.70 : _total >= 4 ? 0.55 : 0.30;
			  let _topSector = null, _bottomSector = null, _topPct = -Infinity, _bottomPct = Infinity;
			  for (const h of _heatmap) {
			    const _pct = parseFloat((h.change || "0").replace(/[^0-9.\-]/g, "")) || 0;
			    if (_pct > _topPct)    { _topPct    = _pct; _topSector    = h.name; }
			    if (_pct < _bottomPct) { _bottomPct = _pct; _bottomSector = h.name; }
			  }
			  const _rotationPhase = _bullCount >= _total * 0.625 ? "LEADING"
			                       : _bullCount >= _total * 0.375 ? "IMPROVING"
			                       : _bullCount >= _total * 0.125 ? "WEAKENING" : "LAGGING";
			  DSSCache.set("score:sector", {
			    score: _sScore, confidence: _sConf, sourceOrigin: "nse-live",
			    fallbackActive: _total < 4, staleReason: _total < 4 ? "Fewer than 4 sectors available" : null,
			    fetchedAt: Date.now(), cacheAgeMin: 0
			  });
			  DSSCache.set("signals:sector", {
			    topSector: _topSector, bottomSector: _bottomSector, rotationPhase: _rotationPhase,
			    bullSectors: _bullCount, bearSectors: _bearCount, totalSectors: _total, heatmap: _heatmap,
			    sourceOrigin: "nse-live", fallbackActive: _total < 4, fetchedAt: Date.now()
			  });
			  logger.info({ job: "score:sector-write", score: _sScore, confidence: _sConf, topSector: _topSector, bottomSector: _bottomSector, rotationPhase: _rotationPhase, sectorCount: _total, ts: Date.now() });
			}, null);
			// ── END score:sector + signals:sector ──

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

		// ── SESSION 18 STEP 2: score:debt + signals:debt ──
		safeExecute(() => {
		  const _ov       = payload.overview || {};
                  const _fredD    = DSSCache.get("macro:fred") || {};
                  // FRED: prefer DGS10 over Yahoo for US10Y in debt scoring
		  const _realRate = _ov.realRate || null;
                  const _us10Y    = _fredD.us10YYield || _ov.us10Y || null;
		  const _dxy      = _ov.dxy      || null;
		  const _gsecLive = payload.gsecLive === true;

		  let _dScore = 50;
		  if (_realRate !== null) {
		    if (_realRate >= 1.5) _dScore += 15; else if (_realRate >= 0.5) _dScore += 8; else if (_realRate < 0) _dScore -= 15;
		  }
		  if (_us10Y !== null) { if (_us10Y < 4.0) _dScore += 10; else if (_us10Y > 4.5) _dScore -= 10; }
		  if (_dxy   !== null) { if (_dxy < 102)   _dScore += 5;  else if (_dxy > 106)   _dScore -= 5;  }
		  _dScore = Math.max(0, Math.min(100, _dScore));

                  const _dConf = _gsecLive ? 0.75 : _fredD.us10YYield ? 0.60 : 0.45;

		  DSSCache.set("score:debt", {
		    score: _dScore, confidence: _dConf,
                    sourceOrigin: _gsecLive ? "te-live" : _fredD.us10YYield ? "fred-partial" : "hardcoded-fallback",
		    fallbackActive: !_gsecLive,
		    staleReason: !_gsecLive ? "DEF-004: G-Sec yields hardcoded — confidence penalised" : null,
		    fetchedAt: Date.now(), cacheAgeMin: 0
		  });

		  const _dSignals = (payload.rateSignals || []).map(rs => ({
		    name: rs.factor, value: null,
		    signal: rs.bull ? "BUY" : "SELL",
		    sentiment: rs.bull ? "bullish" : "bearish",
		    confidence: _dConf, source: "derived"
		  }));

		  DSSCache.set("signals:debt", {
		    signals: _dSignals,
		    repoRate: _ov.repoRate || null, cpi: _ov.cpi || null, realRate: _realRate,
		    gsec10Y: _ov.us10Y || null,
		    rateCyclePhase: (_realRate !== null && _realRate > 1.0) ? "Pause" : "Uncertain",
		    gsecLive: _gsecLive,
		    sourceOrigin: _gsecLive ? "te-live" : "hardcoded-fallback",
		    fallbackActive: !_gsecLive, fetchedAt: Date.now()
		  });

		  logger.info({ job: "score:debt-write", score: _dScore, confidence: _dConf, gsecLive: _gsecLive, ts: Date.now() });
		}, null);
		// ── END score:debt + signals:debt ──

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
// refreshDebtCache 300s duplicate removed — handled in app.listen startup


		
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

		  // DEF-004: hardcoded G-Sec yields must not claim live (Never-Fabricate Rule)
		  if (cached.gsecLive === false && dataStatus === "live") {
			dataStatus = DATA_STATUS_ENUM.STALE;
			logger.info(
			  { gsecLive: false, code: "DEF-004" },
			  "DEF-004: G-Sec yields are hardcoded — overriding dataStatus to stale"
			);
		  }
		  // DEF-004: repoRate and CPI are also hardcoded — surface that too
		  if (
			(cached.repoRateSource === "hardcoded" || cached.cpiSource === "hardcoded") &&
			dataStatus === DATA_STATUS_ENUM.LIVE
		  ) {
			dataStatus = DATA_STATUS_ENUM.STALE;
		  }

		  if (dataStatus === "unavailable") {

			return res.status(503).json({
			  status: "ERROR",
			  dataStatus: "unavailable"
			});
		  }

		  // DEF-009: merge score:debt provenance
		  const _scoreDebt = DSSCache.get("score:debt") || {};
		  const _debtData = Object.assign({}, cached, {
		    sourceOrigin:   _scoreDebt.sourceOrigin   || cached.sourceOrigin   || null,
		    fallbackActive: _scoreDebt.fallbackActive != null ? _scoreDebt.fallbackActive : (cached.fallbackActive != null ? cached.fallbackActive : null),
		    staleReason:    _scoreDebt.staleReason    || cached.staleReason    || null,
		    fetchedAt:      _scoreDebt.fetchedAt      || cached.fetchedAt      || null,
		  });

		  return res.json({

			status: "OK",

			timestamp: Date.now(),

			dataStatus,

			data: _debtData
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
// SECTION-22B : OVERVIEW ENGINE
// Synthesis-only orchestration layer.
// Reads from cache. No external fetches.
// Writes to overview:compiled (TTL 60s).
// Powers /api/v1/overview exclusively.
////////////////////////////////////////////////////////

class OverviewEngine {
  constructor(dssCache, regimeEng, pinoLogger) {
    this._cache = dssCache;
    this._regime = regimeEng;
    this._logger = pinoLogger;
  }

  build() {
    const regime      = this._regime.read();
    const equity      = this._cache.get("nse:index")         || {};
    const technical   = this._cache.get("signals:technical") || { signals: [] };
    const sectors     = this._cache.get("signals:sector")    || {};
    const debt        = this._cache.get("signals:debt")      || {};
    const global_     = this._cache.get("signals:global")    || {};
    const flows       = this._cache.get("equity:flows")      || {};
    const optchain    = this._cache.get("nse:optionchain")   || {};

    // --- Composite score block ---
    const compositeScore = {
      score:              regime.compositeScore,
      label:              regime.regimeLabel,
      actionBias:         regime.actionBias,
      regime:             regime.regime,
      includedModules:    regime.includedModules,
      moduleScores:       regime.moduleScores,
      dataStatus:         regime.dataStatus,
      computedAt:         regime.computedAt,
      // P3-3: macro modifier observability passthrough
      compositeScoreRaw:  regime.compositeScoreRaw  ?? null,
      macroModifier:      regime.macroModifier       ?? null,
      macroModifierLog:   regime.macroModifierLog    ?? [],
      activeWeightSum:    regime.activeWeightSum      ?? null,
    };

    // --- Fear & Greed (Appendix B.6) ---
    const fearGreed = this._computeFearGreed(technical, optchain, flows);

    // --- Signal strip ---
    const allSignals = [
      ...(technical.signals  || []),
      ...(debt.signals       || []),
      ...(global_.signals    || []),
    ];
    const signalStrip = allSignals
      .filter(s => s && (s.confidence || 0) >= 0.60 && s.signal !== "WATCH")
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 6)
      .map(s => ({ name: s.name, signal: s.signal, sentiment: s.sentiment, confidence: s.confidence, source: s.source }));

    // --- Breadth ---
    const breadth = {
      advanceDeclineRatio: null,
      sentiment:           null,
      dataStatus:          DATA_STATUS_ENUM.UNAVAILABLE,
    };

    // --- Flows ---
    const fiiNet = flows.fiiEquity || null;
    const diiNet = flows.diiEquity || null;
    const flowsBlock = {
      fiiNet,
      diiNet,
      fiiSentiment: fiiNet === null ? null
                  : fiiNet > 500   ? "STRONG_BUY"
                  : fiiNet > 0     ? "MILD_BUY"
                  : fiiNet > -500  ? "MILD_SELL"
                  : "STRONG_SELL",
      dataStatus: fiiNet !== null ? DATA_STATUS_ENUM.LIVE : DATA_STATUS_ENUM.UNAVAILABLE,
    };

    // --- Module health (PARITY: weight/weightPct/included/contribution) ---
    const ms = regime.moduleScores || {};
    const _MW = { equity:0.30, technical:0.20, global:0.20, derivatives:0.15, debt:0.10, sector:0.05 };
    const _inc = regime.includedModules || [];
    const _mkMod = (key, label, score, extra) => ({
      label, score, status: this._moduleStatus(score),
      weight: _MW[key]||0, weightPct: Math.round((_MW[key]||0)*100),
      included: _inc.includes(key),
      contribution: (score!=null && _inc.includes(key)) ? Math.round(score*(_MW[key]||0)*10)/10 : null,
      ...extra,
    });
    const modules = {
      equity:      _mkMod("equity",      "Equity",       ms.equity,      { niftyLtp: equity.niftyLtp||null, niftyChangePct: equity.niftyChangePct||null }),
      technical:   _mkMod("technical",   "Technical",    ms.technical,   { topSignal: signalStrip[0]||null }),
      sector:      _mkMod("sector",      "Sectors",      ms.sector,      { leading: sectors.topSector||null, lagging: sectors.bottomSector||null }),
      debt:        _mkMod("debt",        "Debt / Rates", ms.debt,        { repoRate: debt.repoRate||null, realRate: debt.realRate||null }),
      global:      _mkMod("global",      "Global Macro", ms.global,      { dxy: (global_.signals||[]).find(s=>s.name==="DXY (Dollar Index)")?.value||null, crude: (global_.signals||[]).find(s=>s.name==="Crude Oil (Brent)")?.value||null }),
      derivatives: _mkMod("derivatives", "Derivatives",  ms.derivatives, { vix: equity.vixValue||null, pcr: flows.pcr||null }),
    };

    const _staleReasons = Object.entries(regime.moduleScores || {})
      .filter(([, v]) => v === null || v === undefined)
      .map(([k]) => k + "_score_unavailable");
    const _ageMin = regime.computedAt
      ? Math.round((Date.now() - regime.computedAt) / 60000 * 10) / 10
      : null;
    const provenance = {
      computedAt:      regime.computedAt || null,
      cacheAgeMin:     _ageMin,
      includedModules: regime.includedModules || [],
      staleReasons:    _staleReasons,
    };
    const systemConf = computeSystemConfidence(this._cache);
    const result = {
      compositeScore,
      fearGreed,
      signalStrip,
      breadth,
      modules,
      provenance,
      confidence: systemConf,
      dataStatus: regime.dataStatus,
      timestamp:  Date.now(),
    };

    this._cache.set("overview:compiled", result);

    this._logger.info({
      job:            "overview-engine",
      compositeScore: regime.compositeScore,
      regime:         regime.regime,
      signalStripLen: signalStrip.length,
      fearGreedScore: fearGreed.score,
      ts:             Date.now(),
    }, "OverviewEngine compiled");

    return result;
  }

  _computeFearGreed(technical, optchain, flows) {
    const signals = technical.signals || [];
    const rsiSig  = signals.find(s => s.name === "RSI (14)");
    const rsiVal  = rsiSig ? (rsiSig.value || 50) : 50;

    const momentumScore  = rsiVal > 70 ? 80 : rsiVal < 30 ? 20 : 40 + rsiVal * 0.4;
    const breadthScore   = 50;
    const vix            = 18;
    const volatilityScore= Math.min(100, Math.max(0, 100 - ((vix - 10) / 25) * 100));
    const fiiNet         = flows.fiiEquity || 0;
    const flowScore      = Math.min(100, Math.max(0, 50 + (fiiNet / 2000) * 50));

    const raw   = momentumScore * 0.25 + breadthScore * 0.25 + volatilityScore * 0.25 + flowScore * 0.25;
    const score = Math.round(raw);
    const label = score > 80 ? "EXTREME GREED"
                : score > 60 ? "GREED"
                : score > 40 ? "NEUTRAL"
                : score > 20 ? "FEAR"
                : "EXTREME FEAR";

    return {
      score, label,
      components: {
        momentum:   Math.round(momentumScore),
        breadth:    Math.round(breadthScore),
        volatility: Math.round(volatilityScore),
        flows:      Math.round(flowScore),
      },
    };
  }

  _moduleStatus(score) {
    if (score === null || score === undefined) return "UNAVAILABLE";
    if (score >= 60) return "POSITIVE";
    if (score >= 45) return "NEUTRAL";
    return "NEGATIVE";
  }
}

const overviewEngine = new OverviewEngine(DSSCache, regimeEngine, logger);

////////////////////////////////////////////////////////
// SECTION-24B : NARRATIVE ENGINE
// Rule-based synthesis layer. Reads cache + regimeEngine.read() only.
// NO external fetches. NO independent regime derivation.
// Writes narrative:compiled. fallback:true until Phase 7 LLM.
////////////////////////////////////////////////////////

class NarrativeEngine {
  constructor(dssCache, regimeEng, pinoLogger) {
    this._cache = dssCache;
    this._regime = regimeEng;
    this._logger = pinoLogger;
  }

  synthesize() {
    const regime    = this._regime.read();
    const equity    = this._cache.get("nse:index")         || {};
    const technical = this._cache.get("signals:technical") || { signals: [] };
    const sectors   = this._cache.get("signals:sector")    || {};
    const debt      = this._cache.get("signals:debt")      || {};
    const global_   = this._cache.get("signals:global")    || {};
    const flows     = this._cache.get("equity:flows")      || {};

    const narrative = this._buildRuleNarrative({
      regime, equity, technical, sectors, debt, global_, flows
    });

    const _narrativeAgeMin = regime.computedAt
      ? Math.round((Date.now() - regime.computedAt) / 60000 * 10) / 10
      : null;
    const _narrativeStaleReasons = Object.entries(regime.moduleScores || {})
      .filter(([, v]) => v === null || v === undefined)
      .map(([k]) => k + "_score_unavailable");
    const provenance = {
      computedAt:      regime.computedAt || null,
      cacheAgeMin:     _narrativeAgeMin,
      includedModules: regime.includedModules || [],
      staleReasons:    _narrativeStaleReasons,
    };
    const result = {
      verdict:        narrative.verdict,
      signals:        narrative.signals,
      sectors:        narrative.sectors,
      global:         narrative.global,
      risks:          narrative.risks,
      action:         narrative.action,
      regime:         regime.regime,
      compositeScore: regime.compositeScore,
      fallback:       true,
      generatedAt:    Date.now(),
      inputScore:     regime.compositeScore,
      dataStatus:     regime.dataStatus,
      provenance,
    };

    this._cache.set("narrative:compiled", result);

    this._logger.info({
      job:            "narrative-engine",
      compositeScore: regime.compositeScore,
      regime:         regime.regime,
      fallback:       true,
      ts:             Date.now(),
    }, "NarrativeEngine synthesized");

    return result;
  }

  _buildRuleNarrative({ regime, equity, technical, sectors, debt, global_, flows }) {
    const score     = regime.compositeScore || 50;
    const tSignals  = technical.signals || [];
    const rsiSig    = tSignals.find(s => s.name === "RSI (14)") || tSignals.find(s => s.name === "RSI (14D)");
    const sma50Sig  = tSignals.find(s => s.name === "50DMA");
    const sma200Sig = tSignals.find(s => s.name === "200DMA");
    const niftyChg  = equity.niftyChangePct || null;
    const vix       = equity.vixValue       || null;
    const fiiNet    = flows.fiiEquity       || null;
    const topSector = sectors.topSector     || null;
    const bottomSec = sectors.bottomSector  || null;
    const rotPhase  = sectors.rotationPhase || null;
    const gSignals  = global_.signals       || {};
    const dxySig    = Array.isArray(gSignals) ? gSignals.find(s => s.name === "DXY (Dollar Index)") : null;
    const crudeSig  = Array.isArray(gSignals) ? gSignals.find(s => s.name === "Crude Oil (Brent)")  : null;
    const us10ySig  = Array.isArray(gSignals) ? gSignals.find(s => s.name === "US 10Y Yield")       : null;
    const fedPolicy = global_.fedPolicy || {};
    const realRate  = debt.realRate || null;

    // VERDICT
    const vp = [];
    if      (score >= 70) vp.push("Markets are in a strong risk-on regime with broad participation.");
    else if (score >= 55) vp.push("Markets reflect a constructive bias, though momentum requires confirmation.");
    else if (score >= 45) vp.push("Market conditions are balanced; directional conviction is low.");
    else if (score >= 30) vp.push("Risk-off dynamics are emerging; defensiveness is warranted.");
    else                  vp.push("Markets are in a stressed regime; capital preservation takes priority.");
    if (niftyChg !== null) {
      if      (niftyChg > 1.0)  vp.push("NIFTY is gaining " + Math.abs(niftyChg).toFixed(2) + "%, confirming the bullish bias.");
      else if (niftyChg > 0)    vp.push("NIFTY is modestly positive at +" + niftyChg.toFixed(2) + "%, but lacks strong conviction.");
      else if (niftyChg > -1.0) vp.push("NIFTY is under mild pressure at " + niftyChg.toFixed(2) + "%, consistent with the cautious regime.");
      else                      vp.push("NIFTY is declining " + Math.abs(niftyChg).toFixed(2) + "%, reinforcing risk-off posture.");
    }

    // SIGNALS
    const sp = [];
    if (rsiSig && rsiSig.value !== null && rsiSig.value !== undefined) {
      const rv = Number(rsiSig.value);
      if      (rv < 30) sp.push("RSI at " + rv.toFixed(1) + " indicates oversold conditions — mean reversion potential is elevated.");
      else if (rv < 45) sp.push("RSI at " + rv.toFixed(1) + " is recovering from oversold territory; momentum is tentative.");
      else if (rv < 55) sp.push("RSI at " + rv.toFixed(1) + " sits in neutral territory; no directional edge.");
      else if (rv < 70) sp.push("RSI at " + rv.toFixed(1) + " shows healthy momentum, not yet extended.");
      else              sp.push("RSI at " + rv.toFixed(1) + " is overbought — near-term reversal risk is elevated.");
    }
    if (sma50Sig && sma200Sig) {
      if      (sma50Sig.signal === "BUY"  && sma200Sig.signal === "BUY")
        sp.push("Price is above both the 50DMA and 200DMA — trend structure is intact.");
      else if (sma50Sig.signal === "SELL" && sma200Sig.signal === "SELL")
        sp.push("Price is below both moving averages — trend structure is broken; bearish posture is appropriate.");
      else
        sp.push("Price is between key moving averages — a transitional phase; await resolution.");
    }

    // SECTORS
    const secp = [];
    if (topSector && bottomSec) secp.push(topSector + " is the current cycle leader while " + bottomSec + " remains the laggard.");
    if (rotPhase) {
      if      (rotPhase === "LEADING")   secp.push("Growth sectors are in the leadership phase — consistent with risk-on rotation.");
      else if (rotPhase === "IMPROVING") secp.push("Sector breadth is improving; rotation is broadening from leadership to wider participation.");
      else if (rotPhase === "WEAKENING") secp.push("Sector leadership is narrowing; rotation into defensives is underway.");
      else if (rotPhase === "LAGGING")   secp.push("Defensive sectors dominate; breadth is contracting, indicating late-cycle dynamics.");
    }

    // GLOBAL
    const gp = [];
    if (crudeSig && crudeSig.value !== null && crudeSig.value !== undefined) {
      const cv = Number(crudeSig.value);
      if      (cv > 90) gp.push("Brent crude at $" + cv.toFixed(1) + " is elevated — inflationary pressure on India current account is a headwind.");
      else if (cv > 75) gp.push("Brent crude at $" + cv.toFixed(1) + " is range-bound — a neutral to mild tailwind for India.");
      else              gp.push("Brent crude at $" + cv.toFixed(1) + " is supportive — lower oil benefits India macro position.");
    }
    if (dxySig && dxySig.value !== null && dxySig.value !== undefined) {
      const dv = Number(dxySig.value);
      if      (dv > 106) gp.push("A strong DXY at " + dv.toFixed(1) + " signals dollar strength — EM headwind and FII outflow pressure.");
      else if (dv > 102) gp.push("DXY at " + dv.toFixed(1) + " is moderately elevated — watch for dollar momentum acceleration.");
      else               gp.push("DXY at " + dv.toFixed(1) + " is contained — constructive for EM and rupee stability.");
    }
    if (us10ySig && us10ySig.value !== null && us10ySig.value !== undefined) {
      const yv = Number(us10ySig.value);
      if (yv > 4.5) gp.push("US 10Y at " + yv.toFixed(2) + "% remains elevated — global cost of capital is high; valuation compression risk persists.");
      else          gp.push("US 10Y at " + yv.toFixed(2) + "% has moderated — supportive for global risk appetite.");
    }
    if (fedPolicy.stance) gp.push("Fed policy stance: " + fedPolicy.stance + ".");

    // RISKS
    const rp = [];
    if (vix !== null && vix !== undefined) {
      const vv = Number(vix);
      if      (vv > 20) rp.push("India VIX at " + vv.toFixed(1) + " is elevated — options pricing reflects significant uncertainty.");
      else if (vv > 15) rp.push("India VIX at " + vv.toFixed(1) + " is moderate — complacency has not set in.");
      else              rp.push("India VIX at " + vv.toFixed(1) + " is low — markets are pricing calm, which itself is a risk if disruption occurs.");
    }
    if (fiiNet !== null && fiiNet !== undefined) {
      if      (fiiNet < -1000) rp.push("FII flows are significantly negative at Rs." + Math.abs(fiiNet).toFixed(0) + " Cr — institutional selling is a primary risk.");
      else if (fiiNet > 1000)  rp.push("FII inflows are strong — but reversal risk exists if global rates re-accelerate.");
      else if (fiiNet < 0)     rp.push("FII flows are mildly negative — monitor for acceleration.");
    }
    if (realRate !== null && realRate !== undefined && Number(realRate) < 0)
      rp.push("Real rates are negative — inflationary risk is not fully priced into debt markets.");
    if (rp.length === 0)
      rp.push("No acute systemic risk signals detected; monitor VIX and FII flows for early warning.");

    // ACTION
    let action;
    if      (score >= 70) action = "Overweight equities; tilt toward cyclicals and growth sectors. Reduce cash. Gold as portfolio hedge, not primary position.";
    else if (score >= 55) action = "Moderate overweight equities. Focus on quality and earnings visibility. Maintain some cash optionality.";
    else if (score >= 45) action = "Balanced allocation. Equities at benchmark weight. Await regime confirmation before adding risk. Short-duration debt for liquidity.";
    else if (score >= 30) action = "Underweight equities. Increase allocation to high-quality debt and gold. Avoid cyclical and high-beta names.";
    else                  action = "Defensive posture. Minimize equity exposure. Prioritize capital preservation via short-duration sovereign debt and gold.";

    return {
      verdict: vp.join(" ")   || "Market regime is being assessed — await signal confirmation.",
      signals: sp.join(" ")   || "Technical signals are inconclusive; await clearer directional setup.",
      sectors: secp.join(" ") || "Sector rotation data is updating; broad index signals apply.",
      global:  gp.join(" ")   || "Global macro data is updating; last known readings apply.",
      risks:   rp.join(" "),
      action,
    };
  }
}

const narrativeEngine = new NarrativeEngine(DSSCache, regimeEngine, logger);


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

		app.get("/api/v1/overview", (req, res) =>
  safeExecuteAsync(async () => {
    // FSD 11.3: Phase 7 — overview reads brain:latest for intelligence layer
    const cached = DSSCache.get("overview:compiled");
    const payload = cached || overviewEngine.build();
    const _brainLatest = DSSCache.get("brain:latest") || null;
    const _brainTs     = DSSCache.get("brain:ts")     || null;
    const _intelligence = _brainLatest ? {
      compositeScore:    _brainLatest.compositeScore,
      regime:            _brainLatest.regime,
      regimeLabel:       _brainLatest.regimeLabel,
      actionBias:        _brainLatest.actionBias,
      macroModifier:     _brainLatest.macroModifier     ?? null,
      compositeScoreRaw: _brainLatest.compositeScoreRaw ?? null,
      macroModifierLog:  _brainLatest.macroModifierLog  ?? [],
      activeWeightSum:   _brainLatest.activeWeightSum   ?? null,
      scheduledAt:       _brainLatest.scheduledAt       ?? null,
      source:            "brain-scheduled",
      freshnessMs:       _brainTs ? Date.now() - _brainTs : null,
      durabilityScore:   _brainLatest.durabilityScore   ?? null,
      durabilityClass:   _brainLatest.durabilityClass   ?? null,
      cyclesSinceChange: _brainLatest.cyclesSinceChange ?? null,
      // v9 Sprint 2: Conviction
      convictionScore:      _brainLatest.convictionScore      ?? null,
      convictionClass:      _brainLatest.convictionClass      ?? null,
      convictionComponents: _brainLatest.convictionComponents ?? null,
      convictionTrajectory: _brainLatest.convictionTrajectory ?? null,
    } : null;
    // Priority 9: validate overview payload before serving
    const _ovValidation = validateOverviewResponse({ compositeScore: payload.compositeScore, confidence: payload.confidence });
    if (!_ovValidation.valid) {
      logger.warn({ violations: _ovValidation.violations }, "Overview payload validation failed — serving last-good cache");
    }
    return res.json({
      status:     "OK",
      timestamp:  Date.now(),
      dataStatus: payload.dataStatus,
      data:       { ...payload, intelligence: _intelligence },
      _validation: { valid: _ovValidation.valid, violations: _ovValidation.violations },
    });
  }, null)
);

app.get("/api/v1/narrative", (req, res) =>
  safeExecuteAsync(async () => {
    const cached = DSSCache.get("narrative:compiled");
    const payload = cached || narrativeEngine.synthesize();
    return res.json({
      status:     "OK",
      timestamp:  Date.now(),
      dataStatus: payload.dataStatus,
      data:       payload,
    });
  }, null)

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
          regime:    vixRegimeLabel,
          vix:       indiaVix,
          zone:      indiaVix===null?null:indiaVix<12?0:indiaVix<18?1:indiaVix<25?2:3,
          zoneLabel: indiaVix===null?"UNAVAILABLE":indiaVix<12?"LOW FEAR":indiaVix<18?"MODERATE FEAR":indiaVix<25?"HIGH FEAR":"PANIC / CRISIS",
          strategy:  indiaVix===null?null:indiaVix<12?"Trend following · Momentum long · Buy dips · Low hedging needed":indiaVix<18?"Staggered entry · SIP preferred · Hedge 30-40% portfolio · Avoid leverage":indiaVix<25?"Contrarian buy zone · Lumpsum deployment · Quality stocks · Cover shorts":"Aggressive lumpsum · Multi-year opportunity · Maximum deployment zone",
        },
        oiLevels:        oiLevels,
        signals:         signals,
        derivativesScore: scoreDeriv.score != null ? scoreDeriv.score : null,
      },
    });
  }, res)
);


// ===============================
// SECTION-26: GET /api/v1/global
// Cache-read-only. Reads: equity:global, score:global, signals:global
// Exposes: kpis (dxy, us10Y, crude, fedPolicy), signals, score, provenance
// dataStatus: live (>=2 live quotes), stale (1 quote), unavailable (0)
// ===============================
app.get("/api/v1/global", (req, res) =>
  safeExecuteAsync(async () => {
    const raw        = DSSCache.get("equity:global")   || {};
    const scoreGlob  = DSSCache.get("score:global")    || { score: null, confidence: 0 };
    const sigGlob    = DSSCache.get("signals:global")  || {};
    const _fredGR    = DSSCache.get("macro:fred")      || {};

    const dxy      = raw.dxy      != null ? raw.dxy      : (sigGlob.dxyProxy    != null ? sigGlob.dxyProxy    : null);
    const us10Y    = _fredGR.us10YYield != null ? _fredGR.us10YYield : raw.us10Y    != null ? raw.us10Y    : (sigGlob.us10YYield  != null ? sigGlob.us10YYield  : null);
    const crude    = raw.crudeOil != null ? raw.crudeOil : (sigGlob.crudeBrent  != null ? sigGlob.crudeBrent  : null);
    const fedPolicy = raw.fedPolicy || sigGlob.fedPolicy || null;

    const liveCount = [dxy, us10Y, crude].filter(v => v !== null).length;
    const dataStatus = liveCount >= 2 ? "live" : liveCount === 1 ? "stale" : "unavailable";

    const transmission = [];
    if (crude !== null) {
      const crudeImpact = crude > 90 ? "HEADWIND" : crude < 75 ? "TAILWIND" : "NEUTRAL";
      transmission.push({ factor: "Crude Oil (Brent)", value: crude, impact: crudeImpact, reason: crude > 90 ? "High crude elevates India import bill and CPI" : crude < 75 ? "Low crude supports CAD and reduces inflationary pressure" : "Crude within neutral band — limited macro transmission" });
    }
    if (dxy !== null) {
      const dxyImpact = dxy > 106 ? "HEADWIND" : dxy < 102 ? "TAILWIND" : "NEUTRAL";
      transmission.push({ factor: "DXY (Dollar Index)", value: dxy, impact: dxyImpact, reason: dxy > 106 ? "Strong dollar pressures EM — FII outflow risk elevated" : dxy < 102 ? "Weak dollar supports EM inflows and INR stability" : "Dollar in range — neutral EM transmission" });
    }
    if (us10Y !== null) {
      const yieldImpact = us10Y > 4.5 ? "HEADWIND" : us10Y < 4.0 ? "TAILWIND" : "NEUTRAL";
      transmission.push({ factor: "US 10Y Yield", value: us10Y, impact: yieldImpact, reason: us10Y > 4.5 ? "Elevated US yields raise global risk-free rate — EM risk premium rises" : us10Y < 4.0 ? "Falling US yields supportive for EM valuations and debt flows" : "US yields in neutral range — limited direct transmission" });
    }

    const provenance = {
      sourceOrigin:   scoreGlob.sourceOrigin   || (_fredGR.us10YYield ? 'fred-partial' : liveCount > 0 ? 'yahoo-live' : 'unavailable'),
      fallbackActive: scoreGlob.fallbackActive != null ? scoreGlob.fallbackActive : (liveCount < 3),
      staleReason:    scoreGlob.staleReason    || null,
      fetchedAt:      scoreGlob.fetchedAt      || (raw.timestamp || null),
      score:          scoreGlob.score          != null ? scoreGlob.score : null,
      confidence:     scoreGlob.confidence     != null ? scoreGlob.confidence : 0,
    };

    return res.json({
      status:     "OK",
      timestamp:  Date.now(),
      dataStatus,
      data: {
        kpis: { dxy, us10YYield: us10Y, crudeBrent: crude, fedPolicy: fedPolicy || null },
        signals:      sigGlob.signals || [],
        transmission,
        globalScore:  scoreGlob.score != null ? scoreGlob.score : null,
        provenance,
      fredEnriched: _fredGR.us10YYield ? { us10Y:_fredGR.us10YYield, us2Y:_fredGR.us2YYield||null, yieldSpread:_fredGR.yieldSpread10_2||null, yieldCurve:_fredGR.yieldCurveSignal||null, fedFundsRate:_fredGR.fedFundsRate||null, fedStance:_fredGR.fedStance||null, unemployment:_fredGR.usUnemployment||null, source:"FRED", fetchedAt:_fredGR.fetchedAt||null } : null,
        dataStatus,
        timestamp:    Date.now(),
      },
    });
  }, res)
);


// ===============================
// SECTION-27: GET /api/v1/history
// Reads SQLite decisions table — Sprint 3 frontend charts
// ===============================
app.get("/api/v1/history", (req, res) =>
  safeExecuteAsync(async () => {
    const limit=Math.min(parseInt(req.query.limit||"200"),500);
    const bucket=req.query.bucket||"1h";
    return new Promise((resolve) => {
      db.all("SELECT regime, score, confidence, timestamp, overall_confidence, conf_class FROM decisions ORDER BY timestamp DESC LIMIT ?",[limit],(err,rows)=>{
        if(err||!rows){res.status(500).json({status:"ERROR",error:err?.message});return resolve();}
        rows.reverse();
        let bucketed=rows;
        if(bucket==="1h"||bucket==="1d"){
          const ms=bucket==="1h"?3600000:86400000;
          const map=new Map();
          for(const r of rows){const key=Math.floor(r.timestamp/ms)*ms;if(!map.has(key))map.set(key,[]);map.get(key).push(r);}
          bucketed=Array.from(map.entries()).map(([ts,g])=>({timestamp:ts,regime:g[g.length-1].regime,score:Math.round(g.reduce((s,r)=>s+r.score,0)/g.length*10)/10,confidence:Math.round(g.reduce((s,r)=>s+r.confidence,0)/g.length),overall_confidence:g.filter(r=>r.overall_confidence!=null).length?Math.round(g.filter(r=>r.overall_confidence!=null).reduce((s,r)=>s+(r.overall_confidence||0),0)/g.filter(r=>r.overall_confidence!=null).length*100)/100:null,conf_class:g[g.length-1].conf_class||null,count:g.length}));
        }
        const timeline=[];let prev=null;
        for(const r of bucketed){if(!prev||prev.regime!==r.regime){if(prev)prev.endTs=r.timestamp;timeline.push({regime:r.regime,startTs:r.timestamp,endTs:null,score:r.score});prev=timeline[timeline.length-1];}}
        if(prev)prev.endTs=Date.now();
        const scores=bucketed.map(r=>r.score).filter(Boolean);
        const stats=scores.length?{min:Math.min(...scores),max:Math.max(...scores),avg:Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*10)/10,last:scores[scores.length-1],trend:scores.length>=10?(scores.slice(-5).reduce((a,b)=>a+b,0)/5>scores.slice(-10,-5).reduce((a,b)=>a+b,0)/5?"UP":"DOWN"):"FLAT"}:{};
        res.json({status:"OK",timestamp:Date.now(),dataStatus:"live",data:{points:bucketed,timeline,stats,meta:{count:bucketed.length,bucket,from:bucketed[0]?.timestamp||null,to:bucketed[bucketed.length-1]?.timestamp||null}}});
        resolve();
      });
    });
  }, res)
);


// ===============================
// SPRINT 4A: POST /api/v1/narrative/generate
// On-demand LLM narrative — governed, circuit-broken, fallback-safe
// ===============================
app.post("/api/v1/narrative/generate", (req, res) =>
  safeExecuteAsync(async () => {
    const audience = (req.body && req.body.audience) || "IFA Advisory Pitch";
    const riskProfile = (req.body && req.body.riskProfile) || "Moderate";
    const VALID_RISK = ["Conservative","Moderate","Aggressive"];
    if (!VALID_RISK.includes(riskProfile)) return res.status(400).json({ status: "ERROR", error: "Invalid riskProfile" });
    const VALID = ["IFA Advisory Pitch","Wealth Manager Synthesis","Family Office Risk Brief","Private Banker Advisory","Advanced Investor Dashboard","Retail Investor","HNI Investor","Conservative Retiree","Aggressive Growth Investor","Institutional Strategy Desk"];
    if (!VALID.includes(audience)) {
      return res.status(400).json({ status: "ERROR", error: "Invalid audience. Valid: " + VALID.join(", ") });
    }
    const result = await generateNarrative(audience, riskProfile);
    return res.json({
      status: "OK",
      timestamp: Date.now(),
      dataStatus: result.narrativeMeta && result.narrativeMeta.fallbackUsed ? "fallback" : "live",
      data: result,
    });
  }, res)
);


// ===============================
// SPRINT 3: POST /api/v1/portfolio/context
// Stateless PCE — session-scoped, never persisted
// Constitutional: no allocation values in logs
// ===============================
app.post("/api/v1/portfolio/context", (req, res) =>
  safeExecuteAsync(async () => {
    const { equityPct, debtPct, goldPct, riskProfile } = req.body || {};
    if (typeof equityPct !== 'number' || typeof debtPct !== 'number' || !riskProfile) {
      return res.status(400).json({ status: "ERROR", error: "PCE_INVALID_INPUT", message: "equityPct, debtPct, riskProfile required" });
    }
    const _brainLatest = DSSCache.get("brain:latest") || {};
    const _regime = _brainLatest.regime || "NEUTRAL";
    const _durClass = _brainLatest.durabilityClass || "EMERGING";
    const _durScore = _brainLatest.durabilityScore || 0.15;
    const _conf = _brainLatest.confidence || 0.50;
    const pceResult = pceComputePortfolioContext(equityPct, debtPct, goldPct ?? null, riskProfile, _regime, _durClass);
    if (!pceResult.valid) {
      return res.status(400).json({ status: "ERROR", error: pceResult.error, reason: pceResult.reason || null });
    }
    // Compute conviction with live portfolioAlignmentScore
    const _convResult = (() => { try {
      const _c = computeConviction(_conf, _durScore, pceResult.portfolioAlignmentScore);
      return { convictionScore: _c.convictionScore, convictionClass: _c.convictionClass, convictionComponents: _c.convictionComponents };
    } catch(e) { return { convictionScore: null, convictionClass: null, convictionComponents: null }; } })();
    // Privacy: observability records mismatchClass only — never numeric allocation values
    logger.info({ job: "pce", regime: _regime, durabilityClass: _durClass, mismatchClass: pceResult.mismatchClass, mismatchDirection: pceResult.mismatchDirection }, "PCE computed");
    return res.json({
      status: "OK",
      timestamp: Date.now(),
      data: {
        portfolioContext: pceResult,
        conviction: _convResult,
        marketContext: { regime: _regime, durabilityClass: _durClass, durabilityScore: _durScore, confidence: _conf }
      }
    });
  }, res)
);


// ===============================
// SPRINT 4: POST /api/v1/advisory/posture
// ACL endpoint — requires portfolio context in request body
// Constitutional: no securities, no amounts, deterministic
// ===============================
app.post("/api/v1/advisory/posture", (req, res) =>
  safeExecuteAsync(async () => {
    const { equityPct, debtPct, goldPct, riskProfile } = req.body || {};
    if (typeof equityPct !== 'number' || typeof debtPct !== 'number' || !riskProfile) {
      return res.status(400).json({ status: 'ERROR', error: 'ACL_NO_PORTFOLIO_CONTEXT', aclEligibility: false, degradationStatus: 'NO_PORTFOLIO_CONTEXT' });
    }
    const _bl = DSSCache.get('brain:latest') || {};
    const _regime      = _bl.regime         || 'NEUTRAL';
    const _durClass    = _bl.durabilityClass || 'EMERGING';
    const _durScore    = _bl.durabilityScore || 0.15;
    const _conf        = _bl.confidence      || 0.50;
    const _convScore   = _bl.convictionScore  || null;
    const _convClass   = _bl.convictionClass  || null;
    const pce = pceComputePortfolioContext(equityPct, debtPct, goldPct ?? null, riskProfile, _regime, _durClass);
    if (!pce.valid) {
      return res.status(400).json({ status: 'ERROR', error: pce.error, reason: pce.reason || null });
    }
    const marketState = { regime: _regime, durabilityClass: _durClass, durabilityScore: _durScore, confidence: _conf };
    const acl = aclComputeAdvisoryPosture(marketState, pce, _convScore, _convClass);
    if (!acl.valid) {
      return res.status(400).json({ status: 'ERROR', error: acl.error, violations: acl.violations || null });
    }
    // Recompute conviction with portfolio alignment
    const _convFull = (() => { try {
      const _c = computeConviction(_conf, _durScore, pce.portfolioAlignmentScore);
      return { convictionScore: _c.convictionScore, convictionClass: _c.convictionClass, convictionComponents: _c.convictionComponents };
    } catch(e) { return { convictionScore: null, convictionClass: null, convictionComponents: null }; } })();
    // Privacy: log mismatchClass only
    logger.info({ job: 'acl', regime: _regime, durabilityClass: _durClass, scenario: acl.scenarioType, intensity: acl.adjustmentIntensity, mismatchClass: pce.mismatchClass }, 'ACL posture computed');
    return res.json({
      status: 'OK',
      timestamp: Date.now(),
      data: {
        advisoryPosture: acl,
        portfolioContext: pce,
        conviction: _convFull,
        marketContext: { regime: _regime, durabilityClass: _durClass, durabilityScore: _durScore, confidence: _conf }
      }
    });
  }, res)
);


// ===============================
// SPRINT 6: POST /api/v1/advisory/brief
// Full v9 pipeline: isRegimeReady → PCE → ACL → Conviction → Narrative → FGS
// Degrades cleanly to v8-equivalent when no portfolio context provided
// Constitutional: session-only portfolio context, never persisted
// ===============================
const ADVISORY_BRIEF_AUDIENCES = [
  'IFA Advisory Pitch','Wealth Manager Synthesis','Family Office Risk Brief',
  'Private Banker Advisory','Advanced Investor Dashboard','Retail Investor',
  'HNI Investor','Conservative Retiree','Aggressive Growth Investor','Institutional Strategy Desk'
];

app.post("/api/v1/advisory/brief", (req, res) =>
  safeExecuteAsync(async () => {
    const t0 = Date.now();
    const { audience, riskProfile, equityPct, debtPct, goldPct, sessionId } = req.body || {};

    // Input validation
    if (!audience || !ADVISORY_BRIEF_AUDIENCES.includes(audience)) {
      return res.status(400).json({ status: 'ERROR', error: 'INVALID_AUDIENCE',
        message: 'Valid audiences: ' + ADVISORY_BRIEF_AUDIENCES.join(', ') });
    }
    const VALID_PROFILES = ['Conservative','Moderate','Aggressive'];
    if (!riskProfile || !VALID_PROFILES.includes(riskProfile)) {
      return res.status(400).json({ status: 'ERROR', error: 'INVALID_RISK_PROFILE' });
    }
    const _hasPortfolio = typeof equityPct === 'number' && typeof debtPct === 'number';
    if (_hasPortfolio && (!isFinite(equityPct) || !isFinite(debtPct))) {
      return res.status(400).json({ status: 'ERROR', error: 'PCE_INVALID_INPUT', aclEligibility: false });
    }

    // Cold start guard
    if (!isRegimeReady(DSSCache)) {
      const _coldNarrative = await generateNarrative(audience, riskProfile);
      return res.json({ status: 'OK', timestamp: Date.now(),
        dataStatus: 'cold-start', data: { ..._coldNarrative,
          portfolioContext: null, advisoryPosture: null, conviction: null,
          marketContext: null, degradationStatus: { advisoryCognition: 'SKIPPED', portfolioContext: 'NOT_PROVIDED', reason: 'COLD_START' }
        }
      });
    }

    const _bl = DSSCache.get('brain:latest') || {};
    const _regime      = _bl.regime         || 'NEUTRAL';
    const _durClass    = _bl.durabilityClass || 'EMERGING';
    const _durScore    = _bl.durabilityScore || 0.15;
    const _conf        = _bl.confidence      || 0.50;
    const _convScore   = _bl.convictionScore  || null;
    const _convClass   = _bl.convictionClass  || null;

    // PCE — portfolio context (optional)
    let _pce = null;
    let _pceError = null;
    if (_hasPortfolio) {
      try {
        _pce = pceComputePortfolioContext(equityPct, debtPct, goldPct ?? null, riskProfile, _regime, _durClass);
        if (!_pce.valid) { _pceError = _pce.error; _pce = null; }
      } catch(e) { _pceError = 'PCE_ERROR'; _pce = null; }
    }

    // ACL — advisory posture (only if PCE valid)
    let _acl = null;
    let _aclError = null;
    if (_pce && _pce.valid) {
      try {
        const _marketState = { regime: _regime, durabilityClass: _durClass, durabilityScore: _durScore, confidence: _conf };
        _acl = aclComputeAdvisoryPosture(_marketState, _pce, _convScore, _convClass);
        if (!_acl.valid) { _aclError = _acl.error; _acl = null; }
      } catch(e) { _aclError = 'ACL_ERROR'; _acl = null; }
    }

    // Conviction — recomputed with portfolio alignment if available
    let _convFull = null;
    try {
      const _alignScore = _pce ? _pce.portfolioAlignmentScore : 0.50;
      const _cv = computeConviction(_conf, _durScore, _alignScore);
      _convFull = { convictionScore: _cv.convictionScore, convictionClass: _cv.convictionClass,
        convictionComponents: _cv.convictionComponents, convictionDataQuality: _cv.convictionDataQuality };
    } catch(e) { _convFull = null; }

    // Generate narrative (existing v8-compatible path)
    const _narrative = await generateNarrative(audience, riskProfile);

    // degradationStatus
    const _degradation = {
      marketIntelligence: _bl.compositeScore ? 'OK' : 'FALLBACK',
      portfolioContext:   _hasPortfolio ? (_pce ? 'OK' : 'INVALID_INPUT') : 'NOT_PROVIDED',
      advisoryCognition: _acl ? 'OK' : (_hasPortfolio && _pce ? 'ERROR' : 'SKIPPED'),
      convictionEngine:  _convFull ? 'OK' : 'FALLBACK',
      durabilityEngine:  _durScore > 0.20 ? 'OK' : _durScore >= 0.10 ? 'PARTIAL_DEGRADED' : 'FALLBACK'
    };

    // Privacy: log mismatchClass only, never allocation values
    logger.info({ job: 'advisory-brief', audience, riskProfile,
      regime: _regime, durabilityClass: _durClass,
      portfolioProvided: _hasPortfolio,
      mismatchClass: _pce ? _pce.mismatchClass : null,
      scenario: _acl ? _acl.scenarioType : null,
      latencyMs: Date.now() - t0
    }, 'Advisory brief generated');

    return res.json({
      status: 'OK',
      timestamp: Date.now(),
      dataStatus: _narrative.narrativeMeta && _narrative.narrativeMeta.fallbackUsed ? 'fallback' : 'live',
      data: {
        // Narrative (v8-compatible fields)
        summary:            _narrative.summary,
        marketTone:         _narrative.marketTone,
        keyDrivers:         _narrative.keyDrivers,
        riskFlags:          _narrative.riskFlags,
        tacticalView:       _narrative.tacticalView,
        macroContext:       _narrative.macroContext        || null,
        confidenceNote:     _narrative.confidenceNote     || null,
        // v9 portfolio fields
        portfolioPostureNote: _acl ? _acl.postureStatement : null,
        durabilityNote:     _durClass ? 'Regime durability: ' + _durClass + ' (' + (_bl.cyclesSinceChange || 0) + ' cycles)' : null,
        convictionQualifier: _convFull ? 'Advisory conviction: ' + _convFull.convictionClass + ' (' + _convFull.convictionScore + ')' : null,
        deploymentPacingNote: _acl && _acl.deploymentPacing ? _acl.deploymentPacing.tranches + ' tranches over ' + _acl.deploymentPacing.periodWeeks + ' weeks' : null,
        stressAwarenessNote: _acl ? _acl.stressAwarenessNote : null,
        advisoryIntensity:  _acl ? _acl.cappedIntensity : null,
        // Context objects
        portfolioContext:   _pce,
        advisoryPosture:    _acl,
        conviction:         _convFull,
        marketContext: { regime: _regime, durabilityClass: _durClass, durabilityScore: _durScore, confidence: _conf },
        degradationStatus:  _degradation,
        // Full observability
        narrativeMeta: {
          ..._narrative.narrativeMeta,
          portfolioContextProvided: _hasPortfolio,
          mismatchClass:     _pce ? _pce.mismatchClass     : null,
          mismatchDirection: _pce ? _pce.mismatchDirection : null,
          adjustmentIntensity: _acl ? _acl.cappedIntensity : null,
          scenarioType:      _acl ? _acl.scenarioType      : null,
          advisoryBasisTrace: _acl ? _acl.advisoryBasisTrace : null,
          degradationStatus: _degradation,
          sessionId:         sessionId || null
        },
        governanceApplied: true
      }
    });
  }, res)
);


// ===============================
// GET /api/v1/macro
// Unified macro intelligence endpoint — FRED + BLS
// ===============================
app.get("/api/v1/macro", (req, res) =>
  safeExecuteAsync(async () => {
    const fred   = DSSCache.get("macro:fred")   || {};
    const bls    = DSSCache.get("macro:bls")    || {};
    const fedrss = DSSCache.get("macro:fedrss") || {};
    const hasData = fred.fetchedAt || bls.fetchedAt;
    return res.json({
      status:    "OK",
      timestamp: Date.now(),
      dataStatus: hasData ? "live" : "unavailable",
      data: {
        fred: fred.fetchedAt ? {
          us10YYield:       fred.us10YYield,
          us2YYield:        fred.us2YYield,
          yieldSpread10_2:  fred.yieldSpread10_2,
          yieldCurveSignal: fred.yieldCurveSignal,
          fedFundsRate:     fred.fedFundsRate,
          fedStance:        fred.fedStance,
          usUnemployment:   fred.usUnemployment,
          usCpiIndex:       fred.usCpiIndex,
          dates:            fred.dates,
          source:           "FRED",
          fetchedAt:        fred.fetchedAt,
          staleDurationMin: Math.round((Date.now()-fred.fetchedAt)/60000),
        } : null,
        bls: bls.fetchedAt ? {
          usCpiIndex:       bls.usCpiIndex,
          usCoreCpi:        bls.usCoreCpi,
          usUnemployment:   bls.usUnemployment,
          usPayrolls:       bls.usPayrolls,
          usWages:          bls.usWages,
          laborSignal:      bls.laborSignal,
          payrollSignal:    bls.payrollSignal,
          dates:            bls.dates,
          source:           "BLS",
          fetchedAt:        bls.fetchedAt,
          staleDurationMin: Math.round((Date.now()-bls.fetchedAt)/60000),
        } : null,
        fedrss: fedrss.fetchedAt ? {
          overallTone:  fedrss.overallTone,
          latestTitle:  fedrss.latestTitle,
          latestDate:   fedrss.latestDate,
          fomcItems:    fedrss.fomcItems,
          topItems:     fedrss.items?.slice(0,3),
          source:       "FedRSS",
          fetchedAt:    fedrss.fetchedAt,
          staleDurationMin: Math.round((Date.now()-fedrss.fetchedAt)/60000),
        } : null,
        synthesis: {
          us10Y:        fred.us10YYield        || null,
          fedStance:    fred.fedStance         || null,
          yieldCurve:   fred.yieldCurveSignal  || null,
          unemployment: bls.usUnemployment     || fred.usUnemployment || null,
          laborSignal:  bls.laborSignal        || null,
          payrollSignal:bls.payrollSignal      || null,
          cpi:          bls.usCpiIndex         || fred.usCpiIndex || null,
          fedTone:      fedrss.overallTone     || null,
          latestFedNews:fedrss.latestTitle     || null,
        },
      },
    });
  }, res)
);

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
			  MOSPI: { keys: ["equity:fundamental"], ttl: 21600000 },
			  FRED: { keys: ["macro:fred"], ttl: 14400000 },
			  BLS:  { keys: ["macro:bls"],  ttl: 86400000 },
			  FedRSS:{ keys: ["macro:fedrss"],ttl: 14400000 }
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

			// Overall status — datasource hierarchy-aware severity governance
			// Primary: NSE, RBI, MOSPI, FRED, BLS, FedRSS (authoritative)
			// Secondary: Yahoo (fallback-grade — staleness does not escalate to DEGRADED)
			const PRIMARY_SOURCES = ['NSE','RBI','MOSPI','FRED','BLS','FedRSS'];
			const SECONDARY_SOURCES = ['Yahoo'];
			const sourceStatuses = Object.values(sources).map(s => s.status);
			const primarySourceStatuses = PRIMARY_SOURCES.map(n => (sources[n] && sources[n].status) || 'UNKNOWN');
			const secondarySourceStatuses = SECONDARY_SOURCES.map(n => (sources[n] && sources[n].status) || 'UNKNOWN');
			const primaryDown = primarySourceStatuses.filter(s => s === 'DOWN').length;
			const primaryStale = primarySourceStatuses.filter(s => s === 'STALE').length;
			const secondaryDegraded = secondarySourceStatuses.some(s => s === 'DOWN' || s === 'STALE');
			let overallStatus = "OK";
			if (primarySourceStatuses.every(s => s === "DOWN" || s === "UNKNOWN")) {
			  overallStatus = "DOWN";
			} else if (primaryDown >= 2 || (primaryDown >= 1 && primaryStale >= 1)) {
			  overallStatus = "DEGRADED";
			} else if (primaryDown === 1 || primaryStale >= 2) {
			  overallStatus = "PARTIAL_DEGRADED";
			} else if (primaryStale === 1 || secondaryDegraded) {
			  overallStatus = "HEALTHY_WITH_WARNINGS";
			}

			// Alerts — simple rule-based
			const alerts = [];
			for (const [sourceName, info] of Object.entries(sources)) {
			  if (info.status === "DOWN") {
				alerts.push({ code: "FETCH_FAILURE_REPEATED", severity: "CRITICAL", source: sourceName });
			  } else if (info.status === "STALE") {
				// RBI stale: LOW severity — governed policy fallback (monetary-policy.json) active
				// Audit confirmed: RBI stale has zero quantified impact on confidence/conviction/durability
				const GOVERNED_FALLBACK_SOURCES = ['RBI'];
				const _alertSev = SECONDARY_SOURCES.includes(sourceName) ? "LOW"
				  : GOVERNED_FALLBACK_SOURCES.includes(sourceName) ? "LOW"
				  : "HIGH";
				alerts.push({ code: "STALE_THRESHOLD_BREACH", severity: _alertSev, source: sourceName });
			  }
			}

                        const _enhSrc={};
                        for(const[_sn,_si]of Object.entries(sources)){
                          const _sm=_si.staleFor?Math.round(_si.staleFor/60000):null;
                          const _phr=(typeof ProviderHealthRegistry!=="undefined")?ProviderHealthRegistry.getSummary()[_sn]:null;
                          _enhSrc[_sn]={status:_si.status,dataStatus:_si.status==="OK"?"live":_si.status==="STALE"?"stale":_si.status==="DOWN"?"disconnected":"unavailable",lastFetch:_si.lastFetch,staleFor:_si.staleFor,staleDurationMin:_sm,staleLabel:_sm===null?"Never fetched":_sm<2?"Just updated":_sm<60?`${_sm}m ago`:`${Math.round(_sm/60)}h ago`,successRate:_phr?.successRate??null,avgLatencyMs:_phr?.avgLatencyMs??null,consecutiveFailures:_phr?.failureCount??null,fallbackActive:_si.status==="DOWN"||_si.status==="STALE"};
                        }
                        const _sc2=(typeof computeSystemConfidence!=="undefined")?computeSystemConfidence(DSSCache):null;
                        const _reg2=DSSCache.get("regime:composite")||{};
                        const _inc2=(_reg2.includedModules||[]).length;
                        const _st2=Object.values(_enhSrc).filter(s=>s.status==="STALE"||s.status==="DOWN").length;
                        return res.json({
                          status:overallStatus,version:VERSION,release:RELEASE_TAG,
                          smartapi:{
                            loginStatus: _aoObs.loginStatus,
                            jwtActive: !!(_aoSession.jwtToken && Date.now() < _aoSession.expiresAt),
                            jwtExpiresAt: _aoSession.expiresAt || null,
                            quoteStatus: _aoObs.quoteStatus,
                            optionChainStatus: _aoObs.optionChainStatus,
                            pcrStatus: _aoObs.pcrStatus,
                            india10yStatus: _aoObs.india10yStatus,
                            lastLoginAt: _aoObs.lastLoginAt,
                            lastLoginFailAt: _aoObs.lastLoginFailAt,
                            lastLoginFailReason: _aoObs.lastLoginFailReason,
                            loginAttempts: _aoObs.loginAttempts,
                          },
                          uptime:Math.round(process.uptime()),timestamp:now,
                          sources:_enhSrc,
                          confidence:_sc2?{overall:_sc2.overall,classification:_sc2.classification,fallbackModules:_sc2.fallbackModules,staleModules:_sc2.staleModules,drivers:_sc2.drivers}:null,
                          metrics:{modulesIncluded:_inc2,modulesTotal:6,modulesCoverage:Math.round((_inc2/6)*100),staleSources:_st2,compositeScore:_reg2.compositeScore||null,regime:_reg2.regime||null,activeWeightSum:_reg2.activeWeightSum||null,uptimeMin:Math.round(process.uptime()/60),overallConfidence:_sc2?.overall||null,confClassification:_sc2?.classification||null},
                          startupStatus: DSSCache.get("startup:status") || null,
                          monetaryPolicy: DSSCache.get("monetary:policy") ? { repoRate: DSSCache.get("monetary:policy").repoRate, stance: DSSCache.get("monetary:policy").stance, lastUpdated: DSSCache.get("monetary:policy").lastUpdated, isStale: DSSCache.get("monetary:policy").isStale, dataStatus: DSSCache.get("monetary:policy").dataStatus } : null,
                          deprecated_endpoints:[],alerts
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

			// ── SESSION 20C P3: /api/v1/signals reads RegimeEngine only ──
			const _rd3 = regimeEngine.read();
			const compositeScore = _rd3.compositeScore;
			const regime = _rd3.regime;
			const confidence = Math.round((_rd3.activeWeightSum || 0.6) * 100);
			const marketQuality = confidence >= 70 ? "STRONG" : confidence >= 50 ? "MODERATE" : "WEAK";
			const _nse3 = DSSCache.get("nse:index") || {};
			const _fl3  = DSSCache.get("equity:flows") || {};
			const signals = {
			  rates:    { value: "neutral",                                        score: 0,                      weight: 0.2,  reliability: 1, strength: "neutral" },
			  liquidity:{ value: (_fl3.fiiEquity||0)>0?"supportive":"tightening", score: (_fl3.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
			  crude:    { value: "neutral",                                        score: 0,                      weight: 0.15, reliability: 1, strength: "neutral" },
			  fii:      { value: (_fl3.fiiEquity||0)>0?"buying":"selling",        score: (_fl3.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
			  vix:      { value: (_nse3.vixValue||15)>20?"high":"low",            score: (_nse3.vixValue||15)>20?-1:1,weight:0.15,reliability:1,strength:"neutral" },
			  trend:    { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  momentum: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  strength: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  breadth:  { value: 0.5,       score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			};
			const intelligence = computeSignalIntelligence(signals);
			const response = buildSignalsResponse({ regime, compositeScore, confidence, marketQuality, signals, intelligence });
			// ── END SESSION 20C P3 ──
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

			// ── SESSION 20C P1: brain GET reads RegimeEngine only ──
			const _rd1 = regimeEngine.read();
			const compositeScore = _rd1.compositeScore;
			const regime = _rd1.regime;
			const confidence = Math.round((_rd1.activeWeightSum || 0.6) * 100);
			const marketQuality = confidence >= 70 ? "STRONG" : confidence >= 50 ? "MODERATE" : "WEAK";
			const _nse1 = DSSCache.get("nse:index") || {};
			const _fl1  = DSSCache.get("equity:flows") || {};
			const signals = {
			  rates:    { value: "neutral",                                          score: 0,                    weight: 0.2,  reliability: 1, strength: "neutral" },
			  liquidity:{ value: (_fl1.fiiEquity||0)>0?"supportive":"tightening",   score: (_fl1.fiiEquity||0)>0?1:-1, weight:0.2, reliability:1, strength:"neutral" },
			  crude:    { value: "neutral",                                          score: 0,                    weight: 0.15, reliability: 1, strength: "neutral" },
			  fii:      { value: (_fl1.fiiEquity||0)>0?"buying":"selling",          score: (_fl1.fiiEquity||0)>0?1:-1, weight:0.2, reliability:1, strength:"neutral" },
			  vix:      { value: (_nse1.vixValue||15)>20?"high":"low",              score: (_nse1.vixValue||15)>20?-1:1, weight:0.15,reliability:1,strength:"neutral" },
			  trend:    { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  momentum: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  strength: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			  breadth:  { value: 0.5,       score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
			};
			const intelligence = computeSignalIntelligence(signals);
			const risk = {
			  exposure: "50%",
			  riskLevel: compositeScore >= 55 ? "MEDIUM" : "LOW",
			  drawdown: riskState.currentDrawdown || 0,
			  killSwitch: riskState.killSwitch || false
			};
			// ── END SESSION 20C P1 ──

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
			  data: { ...brain, compositeScore: compositeScore, regime: regime, confidence: confidence, marketQuality: marketQuality }
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

		// ── SESSION 20C P2: brain-auto POST reads RegimeEngine only ──
		const _rd2 = regimeEngine.read();
		const compositeScore = _rd2.compositeScore;
		let regime = _rd2.regime;
		const _nse2 = DSSCache.get("nse:index") || {};
		const _fl2  = DSSCache.get("equity:flows") || {};
		const signals = {
		  rates:    { value: "neutral",                                        score: 0,                      weight: 0.2,  reliability: 1, strength: "neutral" },
		  liquidity:{ value: (_fl2.fiiEquity||0)>0?"supportive":"tightening", score: (_fl2.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
		  crude:    { value: "neutral",                                        score: 0,                      weight: 0.15, reliability: 1, strength: "neutral" },
		  fii:      { value: (_fl2.fiiEquity||0)>0?"buying":"selling",        score: (_fl2.fiiEquity||0)>0?1:-1, weight:0.2,reliability:1, strength:"neutral" },
		  vix:      { value: (_nse2.vixValue||15)>20?"high":"low",            score: (_nse2.vixValue||15)>20?-1:1,weight:0.15,reliability:1,strength:"neutral" },
		  trend:    { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
		  momentum: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
		  strength: { value: "neutral", score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
		  breadth:  { value: 0.5,       score: 0, weight: 0.1, reliability: 1, strength: "neutral" },
		};
		const intelligence = computeSignalIntelligence(signals);
		const prevConfidence2 = MEMORY.lastSnapshot?.confidence || 60;
		let confidence = smoothConfidence(prevConfidence2, Math.round((_rd2.activeWeightSum||0.6)*100));
		const marketQuality = confidence >= 70 ? "STRONG" : confidence >= 50 ? "MODERATE" : "WEAK";
		const sectorAllocation = getDynamicSectorAllocation(regime, signals, intelligence);
		// ── END SESSION 20C P2 ──
                // D27.1 NEUTRALIZED 2026-05-30: increment/reset relocated to runScheduledBrain()
                // cyclesSinceChange is now owned by the 60s brain scheduler
		// v9 Sprint 1 fix: compute durability here where cyclesSinceChange is live
		const _durabilityResult = (() => { try { return computeRegimeDurability(MEMORY, _rd2.moduleScores); } catch(e) { return { durabilityScore: 0.15, durabilityClass: 'EMERGING' }; } })();
		MEMORY._lastDurability = _durabilityResult;

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
		DSSCache.set('brain:compositeScore', compositeScore);
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
		  // v9 Sprint 1 fix: push fresh durability into brain:latest from POST cycle
		  try {
		    const _bl = DSSCache.get('brain:latest') || {};
		    const _cv = (() => { try { const _d = MEMORY._lastDurability ? MEMORY._lastDurability.durabilityScore : 0.15; const _c = computeConviction(_bl.confidence ?? 0.50, _d, 0.50); const _nowTs2 = Date.now(); if (_lastConvictionTs && (_nowTs2 - _lastConvictionTs) > 300000) { _lastConvictionScore = null; } const _s = smoothConviction(_lastConvictionScore, _c.convictionScore); _lastConvictionScore = _s; _lastConvictionTs = _nowTs2; const _t = updateConvictionTrajectory(_s); return { convictionScore: _s, convictionClass: _c.convictionClass, convictionTrajectory: _t }; } catch(e) { return { convictionScore: null, convictionClass: null, convictionTrajectory: null }; } })();
		    DSSCache.set('brain:latest', { ..._bl,
		      durabilityScore:   MEMORY._lastDurability?.durabilityScore   ?? 0.15,
		      durabilityClass:   MEMORY._lastDurability?.durabilityClass   ?? 'EMERGING',
		      cyclesSinceChange: MEMORY.cyclesSinceChange ?? 0,
		      convictionScore:   _cv.convictionScore,
		      convictionClass:   _cv.convictionClass,
		      convictionTrajectory: _cv.convictionTrajectory
		    });
		  } catch(e) { /* non-fatal */ }
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
                        `INSERT INTO decisions (regime, score, confidence, timestamp, module_coverage, fallback_count, stale_count, overall_confidence, conf_class)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        (() => { const _sc = (typeof computeSystemConfidence === "function") ? computeSystemConfidence(DSSCache) : {}; return [regime, compositeScore, confidence, timestamp, _sc.moduleCoverage||null, (_sc.fallbackModules||[]).length, (_sc.staleModules||[]).length, _sc.overall||null, _sc.classification||null]; })(),
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

// ══════════════════════════════════════════════════════════════════
// NARRATIVE RELIABILITY LAYER — Admin Endpoints (R2, R5, R6, R7)
// All admin endpoints require internal network or admin auth in prod
// ══════════════════════════════════════════════════════════════════

// R5: GET /api/v1/admin/narrative/regression — run regression tests
app.get("/api/v1/admin/narrative/regression", (req, res) => {
  try {
    const results = runNarrativeRegressionTests();
    return res.json({ status: "OK", timestamp: Date.now(), data: results });
  } catch(e) {
    return res.status(500).json({ status: "ERROR", error: e.message });
  }
});

// A1/A4: Provenance — SQLite persistent + in-memory fallback
app.get("/api/v1/admin/narrative/provenance", (req, res) => {
  const n = Math.min(parseInt(req.query.n||'20'), 100);
  if (req.query.source === 'memory') {
    const entries = PROVENANCE_LOG.getLast(n);
    return res.json({ status:"OK", timestamp:Date.now(), source:'memory', data:{ count:entries.length, entries } });
  }
  db.all(`SELECT * FROM narrative_provenance ORDER BY logged_at DESC LIMIT ?`, [n], (err, rows) => {
    if (err) return res.status(500).json({ status:"ERROR", error:err.message });
    const entries = (rows||[]).map(r => ({
      replayId:r.replay_id, audience:r.audience, riskProfile:r.risk_profile,
      provider:r.provider, model:r.model, promptVersion:r.prompt_version,
      regime:r.regime, confidenceClass:r.confidence_class,
      fallbackUsed:!!r.fallback_used, fallbackReason:r.fallback_reason,
      latencyMs:r.latency_ms, contradictionCount:r.contradiction_count,
      contradictionIds:(() => { try { return JSON.parse(r.contradiction_ids||'[]'); } catch(e) { return []; } })(),
      uncertaintyActive:!!r.uncertainty_active, reversalActive:!!r.reversal_active,
      fgsSanitizations:r.fgs_sanitizations, degradationActive:!!r.degradation_active,
      calibrationApplied:!!r.calibration_applied, loggedAt:r.logged_at,
    }));
    return res.json({ status:"OK", timestamp:Date.now(), source:'sqlite', data:{ count:entries.length, entries } });
  });
});

// A4: Provenance aggregate stats (last 24h)
app.get("/api/v1/admin/narrative/provenance/stats", (req, res) => {
  db.all(`SELECT COUNT(*) as total, SUM(fallback_used) as fallbacks,
    SUM(contradiction_count) as contradictions, SUM(calibration_applied) as calibrations,
    AVG(latency_ms) as avg_latency, MAX(latency_ms) as max_latency,
    SUM(fgs_sanitizations) as sanitizations, SUM(degradation_active) as degradations
    FROM narrative_provenance WHERE logged_at > ?`, [Date.now()-86400000], (err, rows) => {
    if (err) return res.status(500).json({ status:"ERROR", error:err.message });
    const s = rows[0]||{};
    const t = s.total||0;
    return res.json({ status:"OK", timestamp:Date.now(), data:{
      period:'24h', total:t,
      fallbackRate: t>0 ? +((s.fallbacks||0)/t).toFixed(3) : null,
      contradictionRate: t>0 ? +((s.contradictions||0)/t).toFixed(3) : null,
      calibrationRate: t>0 ? +((s.calibrations||0)/t).toFixed(3) : null,
      avgLatencyMs: s.avg_latency ? Math.round(s.avg_latency) : null,
      maxLatencyMs: s.max_latency||null,
      totalSanitizations: s.sanitizations||0,
      degradationRate: t>0 ? +((s.degradations||0)/t).toFixed(3) : null,
    }});
  });
});

// R2: GET /api/v1/admin/narrative/replay — list replay store entries
app.get("/api/v1/admin/narrative/replay", (req, res) => {
  try {
    const entries = REPLAY_STORE.getAll().map(e => ({
      replayId: e.replayId,
      storedAt: e.storedAt,
      audience: e.audience,
      riskProfile: e.riskProfile,
      provider: e.provider,
      regime: e.contextSnapshot.regime,
      confidence: e.contextSnapshot.confidence,
      marketTone: e.narrativeStructure.marketTone,
      contradictions: e.contradictions.length,
      calibrationApplied: e.calibrationApplied,
    }));
    return res.json({ status: "OK", timestamp: Date.now(), data: { count: entries.length, entries } });
  } catch(e) {
    return res.status(500).json({ status: "ERROR", error: e.message });
  }
});

// R2: GET /api/v1/admin/narrative/replay/:id — get full replay entry
app.get("/api/v1/admin/narrative/replay/:id", (req, res) => {
  try {
    const entry = REPLAY_STORE.getById(req.params.id);
    if (!entry) return res.status(404).json({ status: "NOT_FOUND", error: "Replay entry not found" });
    return res.json({ status: "OK", timestamp: Date.now(), data: entry });
  } catch(e) {
    return res.status(500).json({ status: "ERROR", error: e.message });
  }
});

// R6: POST /api/v1/admin/narrative/simulate-degradation — degradation harness
app.post("/api/v1/admin/narrative/simulate-degradation", (req, res) =>
  safeExecuteAsync(async () => {
    const scenario = (req.body && req.body.scenario) || "PARTIAL_FALLBACK";
    if (!DEGRADATION_SCENARIOS[scenario]) {
      return res.status(400).json({ status: "ERROR", error: "Unknown scenario. Valid: " + Object.keys(DEGRADATION_SCENARIOS).join(", ") });
    }
    const scenarioCfg = DEGRADATION_SCENARIOS[scenario];
    const audience = (req.body && req.body.audience) || "IFA Advisory Pitch";
    const riskProfile = (req.body && req.body.riskProfile) || "Moderate";

    // Simulate: if LLM timeout scenario, temporarily open circuit breaker
    const wasOpen = LLMCircuitBreaker.isOpen();
    if (scenarioCfg.simulateLLMTimeout) {
      // Force circuit breaker open for this generation only
      for (let i = 0; i < 4; i++) LLMCircuitBreaker.recordFailure();
    }

    const result = await generateNarrative(audience, riskProfile);

    // Report degradation behavior
    return res.json({
      status: "OK",
      timestamp: Date.now(),
      scenario,
      scenarioConfig: scenarioCfg,
      data: {
        provider: result.narrativeMeta?.provider,
        fallbackUsed: result.narrativeMeta?.fallbackUsed,
        fallbackReason: result.narrativeMeta?.fallbackReason,
        marketTone: result.marketTone,
        contradictions: result.narrativeMeta?.contradictions || [],
        calibrationApplied: result.narrativeMeta?._calibrationApplied || false,
        circuitBreakerState: LLMCircuitBreaker.getState(),
        replayId: result.narrativeMeta?.replayId,
        hasSummary: !!result.summary,
        hasConfidenceNote: !!result.confidenceNote,
        governanceViolations: result.narrativeMeta?.governanceViolations || [],
      }
    });
  }, res)
);


app.get("/founder-ops",(req,res)=>res.sendFile(require("path").join(__dirname,"public","ops.html")));
// PHASE-A: OPS ROUTES
const OPS_PWD = process.env.OPS_PASSWORD || "advisiq-ops-2026";
function opsAuth(req,res,next){
  const a=req.headers["x-ops-auth"]||req.query["ops_auth"];
  if(a!==OPS_PWD)return res.status(401).json({status:"UNAUTHORIZED"});
  return next();
}
app.get("/api/v1/ops/brief",opsAuth,(req,res)=>{
  const now=Date.now();
  const yd=new Date(now-86400000).toISOString().slice(0,10);
  db.get("SELECT COUNT(*) as c FROM comm_actions WHERE status=? AND due_at IS NOT NULL AND due_at<?",["PENDING",now],(e1,r1)=>{
    db.get("SELECT COUNT(*) as c FROM comm_ops_events WHERE delivered=0",[],(e2,r2)=>{
      db.get("SELECT COUNT(DISTINCT COALESCE(visitor_id,ip_hash)) as c FROM comm_visits WHERE visit_date=? AND (visitor_type IS NULL OR visitor_type!='FOUNDER')",[yd],(e3,r3)=>{
        const oc=(r1&&r1.c)||0,pe=(r2&&r2.c)||0,yv=(r3&&r3.c)||0;
        res.json({status:"OK",timestamp:now,data:{overdueCount:oc,pendingEvents:pe,yesterdayUniqueCount:yv,lines:[oc>0?String(oc)+" overdue":"No overdue",String(pe)+" events",yv>0?String(yv)+" visitors":"No visits","ops ready"],generatedAt:now}});
      });
    });
  });
});
app.get("/api/v1/ops/feed",opsAuth,(req,res)=>{
  const now=Date.now(),t0=new Date().setHours(0,0,0,0),t1=t0+86400000;
  db.all("SELECT a.*,p.name,p.role FROM comm_actions a LEFT JOIN comm_prospects p ON a.prospect_id=p.id WHERE a.status=? AND a.due_at IS NOT NULL AND a.due_at<? ORDER BY a.due_at ASC LIMIT 10",["PENDING",now],(e1,ov)=>{
    if(e1)ov=[];
    db.all("SELECT a.*,p.name,p.role FROM comm_actions a LEFT JOIN comm_prospects p ON a.prospect_id=p.id WHERE a.status=? AND a.due_at>=? AND a.due_at<? ORDER BY a.due_at ASC LIMIT 15",["PENDING",t0,t1],(e2,td)=>{
      if(e2)td=[];
      db.all("SELECT * FROM comm_ops_events WHERE delivered=0 ORDER BY triggered_at DESC LIMIT 5",[],( e3,ev)=>{
        if(e3)ev=[];
        db.all("SELECT a.*,p.name,p.role FROM comm_actions a LEFT JOIN comm_prospects p ON a.prospect_id=p.id WHERE a.status=? AND a.force_feed=1 AND a.due_at>=? ORDER BY a.logged_at DESC LIMIT 10",["PENDING",now],(e4,mf)=>{
          if(e4)mf=[];
          var ovIds=new Set((ov||[]).map(function(a){return a.prospect_id;}));
          mf=(mf||[]).filter(function(a){return !ovIds.has(a.prospect_id);});
          var om=(ov||[]).map(function(a){return{id:a.id,prospect_id:a.prospect_id,type:a.action_type,urgency:"OVERDUE",prospect:a.name||null,dueAt:a.due_at,overdueMs:now-a.due_at};});
          var mm=(mf||[]).map(function(a){return{id:a.id,prospect_id:a.prospect_id,type:a.action_type,urgency:"MANUAL",prospect:a.name||null,dueAt:a.due_at};});
          var tm=(td||[]).map(function(a){return{id:a.id,prospect_id:a.prospect_id,type:a.action_type,urgency:"TODAY",prospect:a.name||null,dueAt:a.due_at};});
          var em=(ev||[]).map(function(e){return{id:e.id,type:e.event_type,priority:e.priority,title:e.title,body:e.body};});
          res.json({status:"OK",timestamp:now,data:{overdue:om,manual:mm,today:tm,events:em,counts:{overdue:om.length,manual:mm.length,today:tm.length,events:em.length}}});
        });
      });
    });
  });
});
app.post("/api/v1/ops/feed/:id/act",opsAuth,(req,res)=>{
  const id=parseInt(req.params.id),act=(req.body&&req.body.action)||"COMPLETE",now=Date.now();
  if(["COMPLETE","SNOOZE_24H","DISMISS","SKIP"].indexOf(act)===-1)return res.status(400).json({status:"ERROR",error:"Invalid action"});
  db.get("SELECT * FROM comm_actions WHERE id=?",[id],(err,a)=>{
    if(err||!a)return res.status(404).json({status:"NOT_FOUND"});
    const ns=act==="COMPLETE"?"COMPLETED":act==="DISMISS"?"SKIPPED":"PENDING";
    const nd=act==="SNOOZE_24H"?now+86400000:null,ca=act==="COMPLETE"?now:null;
    db.run("UPDATE comm_actions SET status=?,completed_at=?,due_at=COALESCE(?,due_at) WHERE id=?",[ns,ca,nd,id],(e)=>{
      if(e)return res.status(500).json({status:"ERROR",error:e.message});
      if(act==="COMPLETE"&&a.prospect_id){var nx={CONNECTION_SENT:{t:"ACCEPTED_CHECK",d:259200000},MSG1_SENT:{t:"MSG2_FOLLOW",d:604800000},MSG2_SENT:{t:"MSG3_FINAL",d:604800000}};var n=nx[a.action_type];if(n)db.run("INSERT INTO comm_actions (prospect_id,action_type,status,due_at,logged_at) VALUES (?,?,?,?,?)",[a.prospect_id,n.t,"PENDING",now+n.d,now],function(){});}
      res.json({status:"OK",timestamp:now,action:act,itemId:id});
    });
  });
});
app.post("/api/v1/ops/send-to-feed/:prospect_id",opsAuth,(req,res)=>{
  const pid=parseInt(req.params.prospect_id),now=Date.now();
  if(!pid)return res.status(400).json({status:"ERROR",error:"Invalid prospect_id"});
  db.get("SELECT id FROM comm_actions WHERE prospect_id=? AND status='PENDING' ORDER BY due_at ASC LIMIT 1",[pid],(err,row)=>{
    if(err||!row)return res.status(404).json({status:"NOT_FOUND",error:"No pending action for prospect"});
    db.run("UPDATE comm_actions SET force_feed=1 WHERE id=?",[row.id],(e)=>{
      if(e)return res.status(500).json({status:"ERROR",error:e.message});
      res.json({status:"OK",prospect_id:pid,action_id:row.id});
    });
  });
});
app.delete("/api/v1/ops/send-to-feed/:prospect_id",opsAuth,(req,res)=>{
  const pid=parseInt(req.params.prospect_id);
  if(!pid)return res.status(400).json({status:"ERROR",error:"Invalid prospect_id"});
  db.run("UPDATE comm_actions SET force_feed=0 WHERE prospect_id=? AND force_feed=1 AND status='PENDING'",[pid],(e)=>{
    if(e)return res.status(500).json({status:"ERROR",error:e.message});
    res.json({status:"OK",prospect_id:pid});
  });
});
app.get("/api/v1/ops/prospects/pipeline",opsAuth,(req,res)=>{
  const now=Date.now();
  db.all("SELECT p.*, a.action_type as nextAction, a.due_at as nextDue FROM comm_prospects p LEFT JOIN comm_actions a ON a.id=(SELECT id FROM comm_actions WHERE prospect_id=p.id AND status='PENDING' ORDER BY due_at ASC LIMIT 1) WHERE p.status NOT IN ('CLOSED') ORDER BY p.score DESC, p.added_at ASC LIMIT 100",[],function(err,rows){
    if(err)return res.status(500).json({status:'ERROR',error:err.message});
    var q=(rows||[]).map(function(p){return{id:p.id,name:p.name,role:p.role,organisation:p.organisation,linkedin_url:p.linkedin_url,score:p.score,status:p.status,personalisationNote:p.personalisation_note,nextAction:p.nextAction,nextDue:p.nextDue};});
    res.json({status:'OK',timestamp:now,data:{queue:q,count:q.length}});
  });
});
app.get("/api/v1/ops/prospects/queue",opsAuth,(req,res)=>{
  const now=Date.now();
  db.all("SELECT p.*, a.action_type as nextAction, a.due_at as nextDue, a.force_feed as forceFeed FROM comm_prospects p LEFT JOIN comm_actions a ON a.id=(SELECT id FROM comm_actions WHERE prospect_id=p.id AND status='PENDING' ORDER BY due_at ASC LIMIT 1) WHERE p.status NOT IN ('CLOSED') ORDER BY p.score DESC, p.added_at ASC LIMIT 50",[],function(err,rows){
    if(err)return res.status(500).json({status:'ERROR',error:err.message});
    var all=(rows||[]).map(function(p){return{id:p.id,name:p.name,role:p.role,organisation:p.organisation,linkedin_url:p.linkedin_url,score:p.score,status:p.status,personalisationNote:p.personalisation_note,nextAction:p.nextAction,nextDue:p.nextDue,forceFeed:p.forceFeed||0,isOverdue:p.nextDue&&p.nextDue<now?1:0};});var DAY=86400000;var q=all.filter(function(p){return p.forceFeed===1||!p.nextDue||p.nextDue<=(now+DAY);});
    res.json({status:'OK',timestamp:now,data:{queue:q,count:q.length}});
  });
});
app.get("/api/v1/ops/traffic",opsAuth,(req,res)=>{
  const ago=new Date(Date.now()-604800000).toISOString().slice(0,10);
  db.all("SELECT visit_date,source,COUNT(DISTINCT COALESCE(visitor_id,ip_hash)) as u,SUM(is_revisit) as rv FROM comm_visits WHERE visit_date>=? AND (visitor_type IS NULL OR visitor_type!='FOUNDER') GROUP BY visit_date,source ORDER BY visit_date DESC",[ago],(err,rows)=>{
    if(err)return res.status(500).json({status:"ERROR",error:err.message});
    var tu=0,tr=0,sm={LINKEDIN:0,WHATSAPP:0,DIRECT:0,OTHER:0};
    (rows||[]).forEach(function(r){tu+=r.u;tr+=r.rv;if(sm[r.source]!==undefined)sm[r.source]+=r.u;else sm.OTHER+=r.u;});
    res.json({status:"OK",timestamp:Date.now(),data:{period:"7d",totalUnique:tu,totalRevisits:tr,revisitRate:tu>0?Math.round(tr/tu*100)/100:0,sources:sm}});
  });
});
app.post("/api/v1/ops/prospects",opsAuth,(req,res)=>{
  const b=req.body||{};
  if(!b.name||!b.linkedin_url)return res.status(400).json({status:"ERROR",error:"name and linkedin_url required"});
  const now=Date.now();
  db.run("INSERT OR IGNORE INTO comm_prospects (name,role,organisation,linkedin_url,score,source_string,last_post_observed,personalisation_note,status,added_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",[b.name,b.role||null,b.organisation||null,b.linkedin_url,b.score||2,b.source_string||"S1",b.last_post_observed||null,b.personalisation_note||null,"SOURCED",now,now],function(err){
    if(err)return res.status(500).json({status:"ERROR",error:err.message});
    if(this.changes===0)return res.json({status:"DUPLICATE"});
    const lid=this.lastID;
    db.run("INSERT INTO comm_actions (prospect_id,action_type,status,due_at,logged_at) VALUES (?,?,?,?,?)",[lid,"CONNECTION_READY","PENDING",now,now],function(){});
    res.json({status:"OK",timestamp:now,data:{id:lid,name:b.name}});
  });
});
app.post("/api/v1/ops/prospects/:id/action",opsAuth,(req,res)=>{
  const pid=parseInt(req.params.id),tr2=(req.body&&req.body.action)||null,now=Date.now();
  const VALID=["CONNECTION_SENT","ACCEPTED","MSG1_SENT","MSG2_SENT","MSG3_SENT","INTERESTED","NOT_INTERESTED","DEMO_SET","DEMO_DONE","BETA_INVITED","CLOSED"];
  if(VALID.indexOf(tr2)===-1)return res.status(400).json({status:"ERROR",error:"Invalid action"});
  var sm2={CONNECTION_SENT:"CONNECTION_SENT",ACCEPTED:"ACCEPTED",MSG1_SENT:"MSG1_SENT",MSG2_SENT:"MSG2_SENT",MSG3_SENT:"MSG3_SENT",INTERESTED:"DEMO_REQUESTED",NOT_INTERESTED:"CLOSED",DEMO_SET:"DEMO_SCHEDULED",DEMO_DONE:"DEMO_DONE",BETA_INVITED:"BETA_INVITED",CLOSED:"CLOSED"};
  db.run("UPDATE comm_prospects SET status=?,updated_at=? WHERE id=?",[sm2[tr2],now,pid],(err)=>{
    if(err)return res.status(500).json({status:"ERROR",error:err.message});
    var as2={CONNECTION_SENT:{t:"ACCEPTED_CHECK",d:259200000},ACCEPTED:{t:"MSG1_SEND",d:0},MSG1_SENT:{t:"MSG2_FOLLOW",d:604800000},MSG2_SENT:{t:"MSG3_FINAL",d:604800000},INTERESTED:{t:"DEMO_SCHEDULE",d:0},DEMO_DONE:{t:"BETA_EVALUATE",d:7200000}};
    db.run("UPDATE comm_actions SET status='COMPLETED',completed_at=? WHERE prospect_id=? AND status='PENDING' AND due_at<=?",[now,pid,now],function(){});var nx=as2[tr2];if(nx)db.run("INSERT INTO comm_actions (prospect_id,action_type,status,due_at,logged_at) VALUES (?,?,?,?,?)",[pid,nx.t,"PENDING",now+nx.d,now],function(){});
    res.json({status:"OK",timestamp:now,newStatus:sm2[tr2],nextScheduled:nx?nx.t:null});
  });
});
app.get("/api/v1/ops/events/pending",opsAuth,(req,res)=>{
  db.all("SELECT * FROM comm_ops_events WHERE delivered=0 ORDER BY triggered_at DESC LIMIT 20",[],( err,rows)=>{
    if(err)return res.status(500).json({status:"ERROR",error:err.message});
    res.json({status:"OK",timestamp:Date.now(),data:{events:rows||[],count:(rows||[]).length}});
  });
});
app.post("/api/v1/ops/events",opsAuth,(req,res)=>{
  const b=req.body||{};
  if(!b.event_type||!b.title||!b.body)return res.status(400).json({status:"ERROR",error:"event_type,title,body required"});
  const now=Date.now();
  db.run("INSERT INTO comm_ops_events (event_type,priority,title,body,prospect_ref,triggered_at) VALUES (?,?,?,?,?,?)",[b.event_type,b.priority||"MORNING",b.title,b.body,b.prospect_ref||null,now],function(err){
    if(err)return res.status(500).json({status:"ERROR",error:err.message});
    res.json({status:"OK",timestamp:now,data:{id:this.lastID}});
  });
});
(function(){function purge(){db.run("DELETE FROM comm_visits WHERE logged_at<?",[Date.now()-7776000000],function(e){if(!e&&this.changes>0)logger.info({job:"comm-telemetry-purge",deleted:this.changes},"Telemetry purge complete");});}setTimeout(purge,30000);setInterval(purge,86400000);})();
// R5: Run narrative regression tests on startup
try {
  const _regResult = runNarrativeRegressionTests();
  logger.info({ job: 'narrative-regression-startup', passed: _regResult.passed, total: _regResult.total, failed: _regResult.failed }, 'Narrative regression suite on startup');
} catch(e) {
  logger.warn({ job: 'narrative-regression-startup', err: e.message }, 'Narrative regression startup failed');
}

// A2: Restore circuit breaker state from SQLite on startup
LLMCircuitBreaker.restoreFromDB().then(() => {
  logger.info({ job:'startup', cbState:LLMCircuitBreaker.getState() }, 'CB state restored from DB');
}).catch(e => logger.warn({ err:e.message }, 'CB restore failed'));


// ── T2: SmartAPI credential startup validation ───────────────────
(function validateSmartAPICredentials() {
  // P0: Validate Groq API key on startup
  const groqKey = process.env.GROQ_API_KEY || '';
  if (!groqKey || groqKey.trim() === '') {
    logger.error({ job: 'startup-validation', severity: 'CRITICAL' },
      'CRITICAL: GROQ_API_KEY missing — narrative inference unavailable. Rulebased fallback will activate.');
  } else if (groqKey.length < 20) {
    logger.error({ job: 'startup-validation', severity: 'CRITICAL' },
      'CRITICAL: GROQ_API_KEY appears invalid (too short) — may be revoked or malformed. Rotate immediately.');
  } else {
    logger.info({ job: 'startup-validation', keyLen: groqKey.length }, 'Groq API key present and valid format');
  }

  const required = {
    AO_API_KEY:    process.env.AO_API_KEY,
    AO_CLIENT_ID:  process.env.AO_CLIENT_ID,
    AO_MPIN:       process.env.AO_MPIN,
    AO_TOTP_SECRET: process.env.AO_TOTP_SECRET,
  };
  const missing = Object.entries(required).filter(([k,v]) => !v || v.trim() === '').map(([k]) => k);
  if (missing.length > 0) {
    logger.error({ job: 'startup-validation', missing, severity: 'CRITICAL' },
      'CRITICAL: SmartAPI credentials missing — derivatives/PCR/options data will be unavailable. Set: ' + missing.join(', '));
  } else {
    // Governance validation: AO_API_KEY must be short web API key, NOT a UUID
    const apiKey = process.env.AO_API_KEY;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiKey);
    if (isUUID) {
      logger.error({ job: 'startup-validation', severity: 'CRITICAL' },
        'CRITICAL: AO_API_KEY appears to be a UUID — this is NOT a valid SmartAPI web API key. SmartAPI requires the short web API key (e.g. Wx8NxgDH), NOT the application UUID.');
    } else {
      logger.info({ job: 'startup-validation', keyLength: apiKey.length }, 'SmartAPI credentials present and valid format');
    }
  }
})();

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

	// A3: SIGTERM — PM2 restart alerting + CB state persist
process.on("SIGTERM", () => {
  logger.warn({ job:'process-lifecycle', event:'SIGTERM',
    cbState: LLMCircuitBreaker.getState() }, 'SIGTERM — PM2 restart. Persisting CB state.');
  persistCBState(LLMCircuitBreaker.getState().failures, LLMCircuitBreaker.isOpen());
  setTimeout(() => process.exit(0), 300);
});

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

		  // P7: Governed Monetary Policy Configuration Layer
		  // Loads monetary-policy.json at startup — authoritative source for India repo rate.
		  // No reliable zero-cost programmatic source exists from EC2 — governed config is correct architectural choice.
		  try {
		    const _mpRaw = require("fs").readFileSync("/home/ubuntu/dss-system/data/monetary-policy.json", "utf8");
		    const _mpParsed = JSON.parse(_mpRaw);
		    const _mpIndia = _mpParsed.india || {};
		    const _mpAgeDays = (Date.now() - new Date(_mpIndia.lastUpdated || "2026-01-01").getTime()) / 86400000;
		    const _mpIsStale = _mpAgeDays > (_mpIndia.staleAfterDays || 60);
		    const _mpConf = _mpIsStale ? 0.65 : (_mpIndia.confidence || 0.95);
		    const _mpPayload = {
		      repoRate:        _mpIndia.repoRate        || 6.0,
		      reverseRepoRate: _mpIndia.reverseRepoRate || 3.35,
		      crr:             _mpIndia.crr             || 4.0,
		      stance:          _mpIndia.stance          || "NEUTRAL",
		      rateDirection:   _mpIndia.rateDirection   || "UNKNOWN",
		      lastChanged:     _mpIndia.lastChanged     || null,
		      lastUpdated:     _mpIndia.lastUpdated     || null,
		      policyNote:      _mpIndia.policyNote      || null,
		      source:          _mpIndia.source          || "governed-config",
		      ageDays:         Math.round(_mpAgeDays),
		      isStale:         _mpIsStale,
		      confidence:      _mpConf,
		      dataStatus:      _mpIsStale ? "governed-config-stale" : "governed-config",
		    };
		    DSSCache.set("monetary:policy", _mpPayload);
		    logger.info({ repoRate: _mpPayload.repoRate, stance: _mpPayload.stance, ageDays: Math.round(_mpAgeDays), isStale: _mpIsStale }, "Monetary policy config loaded from governed-config");
		  } catch(e) {
		    logger.warn({ err: e.message }, "Monetary policy config load failed — hardcoded fallback 6.0");
		    DSSCache.set("monetary:policy", { repoRate: 6.0, stance: "NEUTRAL", confidence: 0.70, dataStatus: "hardcoded", source: "hardcoded-fallback" });
		  }


		  // P3-4: STARTUP_STATUS — tracks each startup step for observability
		  const STARTUP_STATUS = {
		    startedAt:   Date.now(),
		    version:     VERSION,
		    yahoo:       'pending',
		    fred:        'pending',
		    bls:         'pending',
		    fedrss:      'pending',
		    globalMacro: 'pending',
		    debt:        'pending',
		    regime:      'pending',
		    overview:    'pending',
		    narrative:   'pending',
		    repoRateSource: (() => { const mp = DSSCache.get('monetary:policy'); return mp ? mp.source : 'not-loaded'; })(),
		    repoRate:       (() => { const mp = DSSCache.get('monetary:policy'); return mp ? mp.repoRate : null; })(),
		    repoRateStale:  (() => { const mp = DSSCache.get('monetary:policy'); return mp ? mp.isStale : null; })(),
		    // P0: Debt/fallback audit observability
		    debtCacheStatus: (() => { const d=DSSCache.get('debt:live'); return d ? (d.dataStatus||'loaded') : 'not-loaded'; })(),
		    groqKeyPresent:  !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.length > 20),
		  };
		  DSSCache.set('startup:status', STARTUP_STATUS);
		  logger.info({ job: 'startup' }, 'STARTUP_STATUS initialised');

		  // Pre-establish Yahoo session cookie before scheduler jobs fire
		  try {
			await getYahooCookie();
			logger.info("Yahoo session cookie pre-established at startup");
		  STARTUP_STATUS.yahoo = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'yahoo' }, 'STARTUP_STATUS: yahoo complete');
                  // FRED: fetch immediately at startup
                  try {
                    if (typeof fetchFREDMacro === "function") {
                      await fetchFREDMacro();
                      logger.info("FRED macro fetched at startup");
		  STARTUP_STATUS.fred = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'fred' }, 'STARTUP_STATUS: fred complete');
                  // BLS: fetch at startup, then daily (monthly data)
                  try {
                    if (typeof fetchBLSMacro === "function") {
                      await fetchBLSMacro();
                      logger.info("BLS macro fetched at startup");
		  STARTUP_STATUS.bls = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'bls' }, 'STARTUP_STATUS: bls complete');
                  // FedRSS: fetch at startup
                  try {
                    if (typeof fetchFedRSS === "function") {
                      await fetchFedRSS();
                      logger.info("Fed RSS fetched at startup");
		  STARTUP_STATUS.fedrss = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'fedrss' }, 'STARTUP_STATUS: fedrss complete');
                  // Global macro: run at startup to populate DXY/crude with floor values
                  try {
                    if (typeof buildGlobalMacroPayload === "function") {
                      await buildGlobalMacroPayload();
                      logger.info("Global macro payload built at startup");
		  STARTUP_STATUS.globalMacro = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'globalMacro' }, 'STARTUP_STATUS: globalMacro complete');
                  // Debt cache: run at startup for immediate population
                  try {
                    if (typeof refreshDebtCache === "function") {
                      await refreshDebtCache();
                      logger.info("Debt cache built at startup");
		  STARTUP_STATUS.debt = 'complete'; DSSCache.set('startup:status', STARTUP_STATUS); logger.info({ job: 'startup', step: 'debt' }, 'STARTUP_STATUS: debt complete');
                    }
                  } catch(e) {
                    logger.warn({ err: e.message }, "Debt startup build failed");
                  }
                    }
                  } catch(e) {
                    logger.warn({ err: e.message }, "Global macro startup build failed");
                  }
                    }
                  } catch(e) {
                    logger.warn({ err: e.message }, "FedRSS startup fetch failed");
                  }
                    }
                  } catch(e) {
                    logger.warn({ err: e.message }, "BLS startup fetch failed");
                  }
                    }
                  } catch(e) {
                    logger.warn({ err: e.message }, "FRED startup fetch failed");
                  }
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
