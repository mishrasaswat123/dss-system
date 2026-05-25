import sys

path = "/home/ubuntu/dss-system/server.js"
with open(path, "r") as f:
    content = f.read()

# Anchor using exact tab indentation from repr() output
anchor = (
    '\t\t\tif (niftyRow) {\n'
    '\t\t\tcurrent = Number(niftyRow.last) || null;\n'
    '\t\t\tchangePct = Number(niftyRow.percentChange) || null;\n'
    '\t\t\tlogger.info({ current, changePct }, "NSE LTP updated");\n'
    '\t\t  } else {\n'
    '\t\t\tthrow new Error("NIFTY 50 row not found in allIndices response");\n'
    '\t\t  }'
)

replacement = (
    '\t\t\tif (niftyRow) {\n'
    '\t\t\tcurrent = Number(niftyRow.last) || null;\n'
    '\t\t\tchangePct = Number(niftyRow.percentChange) || null;\n'
    '\t\t\tlogger.info({ current, changePct }, "NSE LTP updated");\n'
    '\t\t  } else {\n'
    '\t\t\tthrow new Error("NIFTY 50 row not found in allIndices response");\n'
    '\t\t  }\n'
    '\t\t\t// Session 20K: India VIX from allIndices (same feed, no Yahoo dependency)\n'
    '\t\t\tconst vixRow = nseIndexJson?.data?.find(x => x.index === "INDIA VIX");\n'
    '\t\t\tif (vixRow && vixRow.last) {\n'
    '\t\t\t\tmarketCache.vixValue = Number(vixRow.last);\n'
    '\t\t\t\tlogger.info({ indiaVix: marketCache.vixValue }, "India VIX updated from NSE allIndices");\n'
    '\t\t\t}\n'
    '\t\t\t// END India VIX'
)

if anchor not in content:
    print("ERROR: anchor still not found — dumping chars around NIFTY 50 row not found")
    idx = content.find('NIFTY 50 row not found')
    if idx >= 0:
        print(repr(content[idx-400:idx+200]))
    sys.exit(1)

count = content.count(anchor)
print(f"Anchor found {count} time(s)")

new_content = content.replace(anchor, replacement, 1)
with open(path, "w") as f:
    f.write(new_content)
print("PATCH 2 applied — India VIX from NSE allIndices")
print("Line count:", new_content.count("\n"))
