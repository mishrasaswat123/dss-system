const { subscribe, publish } = require('../../shared/bus');

console.log('[Risk Engine] Starting...');

// ===== CONFIG =====
const TOTAL_CAPITAL = 100000;
const RISK_PER_TRADE = 0.1;
const MIN_SIGNAL_STRENGTH = 60;
const SELL_THRESHOLD = 55;

// ===== STATE =====
let availableCapital = TOTAL_CAPITAL;
const positions = {};

// ===== HELPERS =====
function calculateQty(price) {
    const capitalToUse = TOTAL_CAPITAL * RISK_PER_TRADE;
    return Math.floor(capitalToUse / price);
}

// ===== MAIN =====
subscribe('ENRICHED_SIGNAL', (signal) => {
    console.log('[Risk Engine] Evaluating signal:', signal);

    const { symbol, price, strength } = signal;

    let decision = {
        ...signal,
        approved: false,
        action: null,
        qty: 0
    };

    const hasPosition = positions[symbol];

    // 🔥 DEBUG LOG (IMPORTANT)
    console.log('[Risk Debug] hasPosition:', hasPosition, 'strength:', strength);

    // =====================================================
    // 🔴 SELL FIRST (MUST COME FIRST)
    // =====================================================
    if (hasPosition && strength < SELL_THRESHOLD) {
        decision.approved = true;
        decision.action = 'SELL';
        decision.qty = hasPosition.qty;

        availableCapital += hasPosition.qty * price;

        console.log('[Risk] SELL approved:', decision);

        delete positions[symbol];

        return publish('PORTFOLIO_DECISION', decision);
    }

    // =====================================================
    // 🟡 REJECT WEAK SIGNAL (ONLY FOR BUY)
    // =====================================================
    if (strength < MIN_SIGNAL_STRENGTH) {
        console.log('[Risk] Rejected: Weak signal');
        return publish('PORTFOLIO_DECISION', decision);
    }

    // =====================================================
    // 🟢 BUY
    // =====================================================
    if (!hasPosition) {
        const qty = calculateQty(price);

        if (qty <= 0) {
            console.log('[Risk] Rejected: Not enough capital');
            return publish('PORTFOLIO_DECISION', decision);
        }

        decision.approved = true;
        decision.action = 'BUY';
        decision.qty = qty;

        availableCapital -= qty * price;

        positions[symbol] = {
            qty,
            avgPrice: price
        };

        console.log('[Risk] BUY approved:', decision);
        return publish('PORTFOLIO_DECISION', decision);
    }

    // =====================================================
    // 🔵 HOLD
    // =====================================================
    console.log('[Risk] HOLD - No action');

    publish('PORTFOLIO_DECISION', decision);
});
