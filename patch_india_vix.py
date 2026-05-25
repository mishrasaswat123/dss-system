import sys

path = "/home/ubuntu/dss-system/server.js"
with open(path, "r") as f:
    content = f.read()

# Anchor: the niftyRow extraction block — unique and unambiguous
anchor = '''                  const niftyRow = nseIndexJson?.data?.find(x => x.index === "NIFTY 50");
                  if (niftyRow) {
                        current = Number(niftyRow.last) || null;
                        changePct = Number(niftyRow.percentChange) || null;
                        logger.info({ current, changePct }, "NSE LTP updated");
                  } else {
                        throw new Error("NIFTY 50 row not found in allIndices response");
                  }'''

replacement = '''                  const niftyRow = nseIndexJson?.data?.find(x => x.index === "NIFTY 50");
                  if (niftyRow) {
                        current = Number(niftyRow.last) || null;
                        changePct = Number(niftyRow.percentChange) || null;
                        logger.info({ current, changePct }, "NSE LTP updated");
                  } else {
                        throw new Error("NIFTY 50 row not found in allIndices response");
                  }
                  // ── Session 20K: India VIX from allIndices (same feed, no Yahoo dependency) ──
                  const vixRow = nseIndexJson?.data?.find(x => x.index === "INDIA VIX");
                  if (vixRow && vixRow.last) {
                        marketCache.vixValue = Number(vixRow.last);
                        logger.info({ indiaVix: marketCache.vixValue }, "India VIX updated from NSE allIndices");
                  }
                  // ── END India VIX ──'''

if anchor not in content:
    print("ERROR: anchor not found")
    # Diagnostic
    idx = content.find('NIFTY 50 row not found')
    if idx >= 0:
        print("Found nearby text at char:", idx)
        print(repr(content[idx-200:idx+100]))
    sys.exit(1)

new_content = content.replace(anchor, replacement, 1)
with open(path, "w") as f:
    f.write(new_content)
print("PATCH 2 applied — India VIX now read from NSE allIndices every 15s")
print("Line count:", new_content.count("\n"))
