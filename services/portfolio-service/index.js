const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");

const app = express();
app.use(cors());
app.use(express.json());

const subscriber = new Redis();
const publisher = new Redis();
const redis = new Redis();

const POSITIONS_KEY = "portfolio:positions";
const TRADES_KEY = "portfolio:trades";
const PNL_KEY = "portfolio:realizedPnL";

let positions = {};
let trades = [];
let realizedPnL = 0;

// ===== SAFE LOAD =====
async function loadState() {
  try {
    const pos = await redis.get(POSITIONS_KEY);
    const tr = await redis.get(TRADES_KEY);
    const pnl = await redis.get(PNL_KEY);

    positions = pos ? JSON.parse(pos) : {};
    trades = tr ? JSON.parse(tr) : [];
    realizedPnL = pnl ? parseFloat(pnl) : 0;

    console.log("[Portfolio] State loaded");
  } catch (err) {
    console.log("[Portfolio] Redis load failed, starting fresh");
  }
}

// ===== SAFE SAVE =====
async function saveState() {
  try {
    await redis.set(POSITIONS_KEY, JSON.stringify(positions));
    await redis.set(TRADES_KEY, JSON.stringify(trades));
    await redis.set(PNL_KEY, realizedPnL);
  } catch (err) {
    console.log("[Portfolio] Redis save error");
  }
}

// Subscribe
subscriber.subscribe("ORDER");
subscriber.subscribe("TICK");

console.log("[Portfolio] Service starting...");

// ===== HANDLER =====
subscriber.on("message", async (channel, message) => {
  const data = JSON.parse(message);

  if (channel === "TICK") {
    const { symbol, price } = data;
    if (positions[symbol]) {
      positions[symbol].lastPrice = price;
    }
  }

  if (channel === "ORDER") {
    const { symbol, action, qty, price } = data;

    if (!positions[symbol]) {
      positions[symbol] = { qty: 0, avgPrice: 0, lastPrice: price };
    }

    const pos = positions[symbol];

    if (action === "BUY") {
      const totalCost = pos.avgPrice * pos.qty + price * qty;
      pos.qty += qty;
      pos.avgPrice = totalCost / pos.qty;
      pos.lastPrice = price;
    }

    if (action === "SELL") {
      const pnl = (price - pos.avgPrice) * qty;
      realizedPnL += pnl;

      pos.qty -= qty;
      pos.lastPrice = price;

      if (pos.qty <= 0) delete positions[symbol];
    }

    trades.push({
      time: Date.now(),
      symbol,
      action,
      qty,
      price,
    });

    await saveState();

    publisher.publish(
      "PORTFOLIO_UPDATE",
      JSON.stringify({
        symbol,
        qty: positions[symbol] ? positions[symbol].qty : 0,
        realizedPnL,
      })
    );

    console.log("[Portfolio] Updated:", symbol);
  }
});

// ===== API =====
app.get("/portfolio", (req, res) => {
  let unrealizedPnL = 0;

  Object.values(positions).forEach((pos) => {
    unrealizedPnL += (pos.lastPrice - pos.avgPrice) * pos.qty;
  });

  res.json({
    positions,
    trades,
    realizedPnL,
    unrealizedPnL,
  });
});

// RESET
app.post("/reset", async (req, res) => {
  positions = {};
  trades = [];
  realizedPnL = 0;

  await redis.del(POSITIONS_KEY);
  await redis.del(TRADES_KEY);
  await redis.del(PNL_KEY);

  res.json({ status: "reset" });
});

// ===== START (NO ASYNC BUG) =====
app.listen(4000, () => {
  console.log("[Portfolio API] running on 4000");
  loadState(); // 👈 safe async call
});
