from flask import Flask, request, jsonify
import yfinance as yf
import time

app = Flask(__name__)

# -----------------------------
# CONFIG
# -----------------------------
CACHE_TTL = 5  # seconds

# -----------------------------
# CACHE STORE
# -----------------------------
cache = {}

# -----------------------------
# SYMBOL MAPPING
# -----------------------------
def map_symbol(symbol):
    symbol = symbol.upper()

    mapping = {
        "RELIANCE": "RELIANCE.NS",
        "ICICIBANK": "ICICIBANK.NS",
        "INFY": "INFY.NS",
        "TCS": "TCS.NS",
        "HDFCBANK": "HDFCBANK.NS",
        "SBIN": "SBIN.NS",
        "NIFTY": "^NSEI",
        "BANKNIFTY": "^NSEBANK"
    }

    return mapping.get(symbol, symbol + ".NS")


# -----------------------------
# FETCH SINGLE PRICE
# -----------------------------
def fetch_price(symbol):
    yf_symbol = map_symbol(symbol)

    # ---- CACHE CHECK ----
    if yf_symbol in cache:
        cached = cache[yf_symbol]
        if time.time() - cached["timestamp"] < CACHE_TTL:
            return cached["data"]

    try:
        ticker = yf.Ticker(yf_symbol)
        data = ticker.history(period="1d")

        if data.empty:
            return {"error": "No data", "symbol": yf_symbol}

        latest = data.iloc[-1]

        result = {
            "symbol": yf_symbol,
            "ltp": float(latest["Close"]),
            "open": float(latest["Open"]),
            "high": float(latest["High"]),
            "low": float(latest["Low"])
        }

        # ---- SAVE CACHE ----
        cache[yf_symbol] = {
            "data": result,
            "timestamp": time.time()
        }

        return result

    except Exception as e:
        return {
            "error": "fetch_failed",
            "symbol": yf_symbol,
            "details": str(e)
        }


# -----------------------------
# HEALTH
# -----------------------------
@app.route("/health")
def health():
    return {"status": "ok"}


# -----------------------------
# SINGLE PRICE
# -----------------------------
@app.route("/price")
def price():
    symbol = request.args.get("symbol")

    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    result = fetch_price(symbol)
    return jsonify(result)


# -----------------------------
# MULTI PRICE (IMPORTANT)
# -----------------------------
@app.route("/prices")
def prices():
    symbols = request.args.get("symbols")

    if not symbols:
        return jsonify({"error": "symbols required"}), 400

    symbol_list = [s.strip().upper() for s in symbols.split(",")]

    results = {}

    for sym in symbol_list:
        results[sym] = fetch_price(sym)

    return jsonify(results)


# -----------------------------
# RUN
# -----------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
