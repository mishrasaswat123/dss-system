const { subscribe, publish } = require('../../shared/bus');

console.log('[Signal Engine] Starting...');

subscribe('RAW_TICK', (data) => {
    console.log('🔥 RAW_TICK RECEIVED:', data);

    const { symbol, price, timestamp } = data;

    // 🔥 FORCE strong signal for testing
    let strength = price > 2500 ? 80 : 40;

    const enriched = {
        symbol,
        price,
        strength,
        timestamp
    };

    console.log('🚀 Publishing ENRICHED_SIGNAL:', enriched);

    publish('ENRICHED_SIGNAL', enriched);
});
