const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

const subscriber = new Redis();
const publisher = new Redis();

// ===== RISK CONFIG =====
const MAX_QTY_PER_TRADE = 3;
const MAX_POSITION_PER_SYMBOL = 6;
const MAX_DAILY_LOSS = -500;

// ===== STATE =====
let dailyPnL = 0;
const positions = {};

// Subscribe
subscriber.subscribe("PORTFOLIO_UPDATE");
subscriber.subscribe("SIGNAL");

console.log("[Execution] Risk Engine Active...");

// ===== LISTENER =====
subscriber.on("message", (channel, message) => {
  const data = JSON.parse(message);

  if (channel === "PORTFOLIO_UPDATE") {
    const { symbol, qty, realizedPnL } = data;

    if (symbol) positions[symbol] = qty;
    if (realizedPnL !== undefined) dailyPnL = realizedPnL;
  }

  if (channel === "SIGNAL") {
    const { symbol, action, price } = data;

    let approved = true;
    let reason = "";

    const currentQty = positions[symbol] || 0;

    if (dailyPnL <= MAX_DAILY_LOSS) {
      approved = false;
      reason = "Daily loss limit hit";
    }

    if (action === "BUY" && currentQty + MAX_QTY_PER_TRADE > MAX_POSITION_PER_SYMBOL) {
      approved = false;
      reason = "Max position exceeded";
    }

    if (!approved) {
      console.log(`[Risk] BLOCKED: ${reason}`);
      return;
    }

    const order = {
      symbol,
      action,
      qty: MAX_QTY_PER_TRADE,
      price,
    };

    console.log("[Execution] Approved:", order);

    publisher.publish("ORDER", JSON.stringify(order));
  }
});

// ===== API =====
app.post("/tick", (req, res) => {
  const { symbol, price } = req.body;

  let action = null;

  if (price <= 2600) action = "BUY";
  else if (price >= 2700) action = "SELL";

  if (!action) {
    return res.json({ status: "NO_ACTION" });
  }

  const signal = {
    symbol,
    action,
    price,
  };

  publisher.publish("SIGNAL", JSON.stringify(signal));

  res.json({ status: action });
});

// ===== START =====
app.listen(3456, () => {
  console.log("[Execution API] running on 3456");
});
