const express = require("express");
const router = express.Router();

const { getNiftyTechnical } = require("../engines/technicalEngine");

router.get("/nifty", async (req, res) => {
  try {
    const data = await getNiftyTechnical();
    res.json(data);
  } catch (err) {
    console.error("ROUTE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
