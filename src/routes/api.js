const express = require("express");
const sheetsController = require("../controllers/sheets");
const router = express.Router();

router.get("/data", async (req, res) => {
  try {
    const data = await sheetsController.getData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
