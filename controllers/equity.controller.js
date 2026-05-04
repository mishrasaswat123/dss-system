const equityService = require("../services/equity.service");

exports.getEquitySignals = async (req, res) => {
  try {
    const data = await equityService.fetchEquitySignals();

    return res.json({
      status: "OK",
      timestamp: Date.now(),
      dataStatus: data?.dataStatus || "live",
      data: data.payload
    });

  } catch (err) {
    console.error("Equity Controller Error:", err);

    return res.status(500).json({
      status: "ERROR",
      timestamp: Date.now(),
      dataStatus: "unavailable",
      data: null
    });
  }
};
