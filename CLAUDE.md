## SECTION 25 — SMARTAPI CREDENTIAL GOVERNANCE (T1)

**Permanent doctrine — never revert:**

SmartAPI (`angelone.in`) requires the **web API key** in `X-PrivateKey`, NOT the application UUID.

| Credential type | Format | Valid for SmartAPI |
|---|---|---|
| Web API key | Short alphanumeric (e.g. `Wx8NxgDH`) | ✓ YES |
| Application UUID | `f70c433c-9d61-43d4-bfbd-7bad21d76526` | ✗ NO — AG8004 error |

**`AO_API_KEY` must be the short web API key. Any UUID value will fail authentication.**

Validated production value: `AO_API_KEY=Wx8NxgDH` (confirmed against AngelOne production endpoint).

**Credential rotation checklist — mandatory before deployment acceptance:**
1. `bash scripts/test-smartapi.sh` → all PASS
2. Verify: login endpoint succeeds
3. Verify: quote endpoint succeeds  
4. Verify: option chain endpoint succeeds (market hours only)
5. Never accept UUID format as `AO_API_KEY`

**Required env vars for SmartAPI (startup validation will warn if missing):**
- `AO_API_KEY` — short web API key
- `AO_CLIENT_ID` — client/user code
- `AO_MPIN` — login PIN
- `AO_TOTP_SECRET` — base32 TOTP secret

---

## SECTION 26 — DATASOURCE PRIORITY HIERARCHY (T7)

**Current hierarchy (post-hardening):**

PRIMARY (preferred, lowest fallback frequency):
- SmartAPI → PCR (Put-Call Ratio)
- SmartAPI → India 10Y yield
- FRED → US10Y, US2Y, yield curve, Fed funds rate

SECONDARY (fallback only — not preferred):
- Yahoo Finance → equity price fallback only
- Public macro feeds → fallback only

**Yahoo dependency reduction doctrine:** Yahoo is volatile (circuit breaker fires multiple times daily). Any new signal that can be sourced from SmartAPI or FRED should use those. Yahoo should never be the sole source for any critical signal.

---

## SECTION 27 — OCI MIGRATION GOVERNANCE (T8)

**Current infrastructure status:**
- **Primary:** OCI (Oracle Cloud Infrastructure) — production-operational
- **Standby:** AWS EC2 (`ubuntu@ip-172-31-33-117`) — hot standby, 72h retention minimum
- **DNS:** Pointed to OCI — cutover complete
- **SmartAPI:** Validated from OCI IP
- **PM2:** Persistence validated, reboot-safe on OCI

**72h AWS standby doctrine:** AWS EC2 must remain operational and current for minimum 72 hours after any major OCI change. Do not terminate AWS instance without explicit sign-off.

**Rollback governance:** If OCI instability detected, DNS cutback to AWS can be executed immediately. AWS server.js must stay in sync with OCI.

**OCI snapshot governance:** Take OCI snapshot before any major server.js patch. Retain last 3 snapshots minimum.

**Dual-env sync rule:** All server.js patches applied to primary (OCI) must be mirrored to AWS standby within 24 hours.

---

## SECTION 28 — REPO RATE GOVERNANCE (T6)

**Repo rate is a governed policy variable — not a live scraped value.**

Source: `/home/ubuntu/dss-system/data/monetary-policy.json`
Structure:
```json
{
  "india": {
    "repoRate": 6.50,
    "lastUpdated": "2026-04-08",
    "source": "RBI MPC",
    "mode": "manual-governed",
    "staleAfterDays": 60,
    "confidence": 0.95
  }
}
```

**Update protocol:** When RBI MPC announces a rate change, update `monetary-policy.json` manually. Do not implement automated scraping — no reliable zero-cost programmatic source exists for repo rate from EC2.

**Staleness threshold:** 60 days. After 60 days, confidence drops to 0.65 and `dataStatus` becomes `governed-config-stale`. Update the file.

---
