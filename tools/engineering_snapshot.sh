#!/usr/bin/env bash
# engineering_snapshot.sh — ADVISIQ DSS read-only engineering context snapshot
# Zero side effects. Safe in production.
# Usage: bash tools/engineering_snapshot.sh

SERVER="/home/ubuntu/dss-system/server.js"
MEMORY="/home/ubuntu/dss-system/memory.json"

echo "════════════════════════════════════════════════════"
echo " ADVISIQ DSS — Engineering Context Snapshot"
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════════════"

echo ""
echo "── 1. Git commit ──"
git -C /home/ubuntu/dss-system log --oneline -3 2>/dev/null || echo "git unavailable"

echo ""
echo "── 2. PM2 status ──"
pm2 list 2>/dev/null | grep -E "dss|name|─" || echo "pm2 unavailable"

echo ""
echo "── 3. Disk usage ──"
df -h /home/ubuntu | tail -1

echo ""
echo "── 4. cyclesSinceChange references (active paths) ──"
grep -n "cyclesSinceChange" "$SERVER" | grep -v "^\s*//" | grep -E "\+= 1|\+ 1|= 0|RELOCATED|NEUTRALIZED|typeof|saveMemory|lastSnapshot" | head -20

echo ""
echo "── 5. lastSnapshot write paths ──"
grep -n "MEMORY\.lastSnapshot\s*=" "$SERVER" | grep -v "^\s*//" | head -10

echo ""
echo "── 6. runScheduledBrain location ──"
grep -n "runScheduledBrain\|brain-auto scheduler" "$SERVER" | grep -v "^\s*//" | head -8

echo ""
echo "── 7. app.post brain-auto location ──"
grep -n "app\.post.*brain-auto" "$SERVER" | grep -v "^\s*//" | head -5

echo ""
echo "── 8. computeRegimeDurability location ──"
grep -n "^function computeRegimeDurability" "$SERVER" | head -3

echo ""
echo "── 9. Live regime durability values ──"
curl -sf https://advisiq.in/api/v1/overview 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    csc = ds = dc = reg = None
    for obj in [d, d.get('regime',{}), d.get('durability',{}), d.get('brain',{}), d.get('compositeScore',{})]:
        if not isinstance(obj, dict): continue
        if csc is None and obj.get('cyclesSinceChange') is not None: csc = obj['cyclesSinceChange']
        if ds  is None and obj.get('durabilityScore')   is not None: ds  = obj['durabilityScore']
        if dc  is None and obj.get('durabilityClass')   is not None: dc  = obj['durabilityClass']
        if reg is None and obj.get('regime')            is not None: reg = obj['regime']
    print(f'  regime            : {reg}')
    print(f'  cyclesSinceChange : {csc}')
    print(f'  durabilityScore   : {ds}')
    print(f'  durabilityClass   : {dc}')
except Exception as e:
    print(f'  parse error: {e}')
" 2>/dev/null || echo "  endpoint unavailable"

echo ""
echo "── 10. memory.json status ──"
if [ -f "$MEMORY" ]; then
    SIZE=$(wc -c < "$MEMORY")
    MTIME=$(stat -c '%y' "$MEMORY" 2>/dev/null)
    echo "  exists | size: ${SIZE} bytes | modified: ${MTIME}"
    python3 -c "
import json
with open('$MEMORY') as f:
    m = json.load(f)
print(f'  cyclesSinceChange  : {m.get(\"cyclesSinceChange\", \"MISSING\")}')
print(f'  lastRegimeChangeTs : {m.get(\"lastRegimeChangeTs\", \"MISSING\")}')
print(f'  signalsHistory len : {len(m.get(\"signalsHistory\", []))}')
print(f'  lastSnapshot.regime: {(m.get(\"lastSnapshot\") or {}).get(\"regime\", \"null\")}')
" 2>/dev/null
else
    echo "  memory.json NOT FOUND"
fi

echo ""
echo "── Backup files ──"
ls -lh /home/ubuntu/dss-system/server.js.pre-* 2>/dev/null || echo "  none"

echo ""
echo "════════════════════════════════════════════════════"
echo " Snapshot complete — zero writes performed"
echo "════════════════════════════════════════════════════"
