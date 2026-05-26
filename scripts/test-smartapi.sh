#!/bin/bash
# ADVISIQ DSS — SmartAPI Validation Script (T3)
# Usage: bash scripts/test-smartapi.sh
# Purpose: validate SmartAPI credentials, JWT, quote, option chain
# Run before deployment or after credential rotation

set -e

echo "════════════════════════════════════════"
echo "ADVISIQ DSS — SmartAPI Validation"
echo "════════════════════════════════════════"

# Load env
if [ -f /home/ubuntu/dss-system/.env ]; then
  export $(grep -v '^#' /home/ubuntu/dss-system/.env | xargs)
fi

API_KEY="${AO_API_KEY:-}"
CLIENT_ID="${AO_CLIENT_ID:-}"
MPIN="${AO_MPIN:-}"
TOTP_SECRET="${AO_TOTP_SECRET:-}"
BASE="https://apiconnect.angelone.in"
PUBLIC_IP="${SERVER_PUBLIC_IP:-$(curl -s https://checkip.amazonaws.com || echo '0.0.0.0')}"

PASS=0
FAIL=0

check() {
  if [ "$1" = "PASS" ]; then
    echo "✓ PASS: $2"
    PASS=$((PASS+1))
  else
    echo "✗ FAIL: $2"
    FAIL=$((FAIL+1))
  fi
}

# Step 1: Credential presence
echo ""
echo "── Step 1: Credential Presence ─────────"
[ -n "$API_KEY" ] && check PASS "AO_API_KEY present (len:${#API_KEY})" || check FAIL "AO_API_KEY MISSING"
[ -n "$CLIENT_ID" ] && check PASS "AO_CLIENT_ID present" || check FAIL "AO_CLIENT_ID MISSING"
[ -n "$MPIN" ] && check PASS "AO_MPIN present" || check FAIL "AO_MPIN MISSING"
[ -n "$TOTP_SECRET" ] && check PASS "AO_TOTP_SECRET present" || check FAIL "AO_TOTP_SECRET MISSING"

# Governance check: API key must not be a UUID
UUID_PATTERN='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if echo "$API_KEY" | grep -qiE "$UUID_PATTERN"; then
  check FAIL "AO_API_KEY is a UUID — SmartAPI requires web API key not application UUID"
  echo "  GOVERNANCE: Set AO_API_KEY to short web API key (e.g. Wx8NxgDH)"
  exit 1
else
  check PASS "AO_API_KEY format: not UUID (governance correct)"
fi

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "ABORT: Credential issues must be resolved before authentication test"
  exit 1
fi

# Step 2: Generate TOTP
echo ""
echo "── Step 2: TOTP Generation ──────────────"
TOTP=$(node -e "const s=require('speakeasy'); console.log(s.totp({secret:'$TOTP_SECRET',encoding:'base32'}))" 2>/dev/null)
if [ -n "$TOTP" ] && [ ${#TOTP} -eq 6 ]; then
  check PASS "TOTP generated: $TOTP"
else
  check FAIL "TOTP generation failed"
  exit 1
fi

# Step 3: Login
echo ""
echo "── Step 3: SmartAPI Login ───────────────"
LOGIN_RESP=$(curl -s -m 10 -X POST \
  "${BASE}/rest/auth/angelbroking/user/v1/loginByPassword" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-UserType: USER" \
  -H "X-SourceID: WEB" \
  -H "X-ClientLocalIP: 127.0.0.1" \
  -H "X-ClientPublicIP: ${PUBLIC_IP}" \
  -H "X-MACAddress: 00:00:00:00:00:00" \
  -H "X-PrivateKey: ${API_KEY}" \
  -d "{\"clientcode\":\"${CLIENT_ID}\",\"password\":\"${MPIN}\",\"totp\":\"${TOTP}\"}" 2>/dev/null)

LOGIN_STATUS=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','false'))" 2>/dev/null)
JWT=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('jwtToken','') or '')" 2>/dev/null)

if [ "$LOGIN_STATUS" = "True" ] || [ "$LOGIN_STATUS" = "true" ]; then
  check PASS "Login: SUCCESS"
  check PASS "JWT issued (len:${#JWT})"
else
  ERR=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null)
  check FAIL "Login FAILED: $ERR"
  echo "  RAW: $LOGIN_RESP"
  exit 1
fi

# Step 4: Quote endpoint
echo ""
echo "── Step 4: Quote Endpoint ───────────────"
QUOTE_RESP=$(curl -s -m 10 -X POST \
  "${BASE}/rest/secure/angelbroking/market/v1/quote/" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-UserType: USER" \
  -H "X-SourceID: WEB" \
  -H "X-ClientLocalIP: 127.0.0.1" \
  -H "X-ClientPublicIP: ${PUBLIC_IP}" \
  -H "X-MACAddress: 00:00:00:00:00:00" \
  -H "X-PrivateKey: ${API_KEY}" \
  -d '{"mode":"FULL","exchangeTokens":{"NSE":["26000"]}}' 2>/dev/null)

QUOTE_STATUS=$(echo "$QUOTE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','false'))" 2>/dev/null)
if [ "$QUOTE_STATUS" = "True" ] || [ "$QUOTE_STATUS" = "true" ]; then
  check PASS "Quote endpoint: SUCCESS (Nifty50 data)"
else
  ERR=$(echo "$QUOTE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null)
  check FAIL "Quote endpoint FAILED: $ERR"
fi

# Step 5: Option chain endpoint
echo ""
echo "── Step 5: Option Chain Endpoint ────────"
OC_RESP=$(curl -s -m 10 -X GET \
  "${BASE}/rest/secure/angelbroking/market/v1/option-chain?name=NIFTY&expirydate=$(date -d 'next thursday' '+%Y-%m-%d' 2>/dev/null || date -v+4d '+%Y-%m-%d')&strikecount=5" \
  -H "Authorization: Bearer ${JWT}" \
  -H "Content-Type: application/json" \
  -H "X-UserType: USER" \
  -H "X-SourceID: WEB" \
  -H "X-ClientLocalIP: 127.0.0.1" \
  -H "X-ClientPublicIP: ${PUBLIC_IP}" \
  -H "X-MACAddress: 00:00:00:00:00:00" \
  -H "X-PrivateKey: ${API_KEY}" 2>/dev/null)

OC_STATUS=$(echo "$OC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','false'))" 2>/dev/null)
if [ "$OC_STATUS" = "True" ] || [ "$OC_STATUS" = "true" ]; then
  check PASS "Option chain endpoint: SUCCESS"
else
  ERR=$(echo "$OC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null)
  check FAIL "Option chain: $ERR (may be outside market hours — acceptable)"
fi

# Summary
echo ""
echo "════════════════════════════════════════"
echo "RESULT: ${PASS} PASS | ${FAIL} FAIL"
if [ $FAIL -eq 0 ]; then
  echo "STATUS: SmartAPI VALIDATED — safe to deploy"
else
  echo "STATUS: VALIDATION ISSUES — review before deployment"
fi
echo "════════════════════════════════════════"
exit $FAIL
