const express = require("express");
const router = express.Router();
const { getEquitySignals } = require("../controllers/equity.controller");

router.get("/equity-signals", getEquitySignals);

module.exports = router;
