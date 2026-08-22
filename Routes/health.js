const express = require("express");
const mongoose = require("mongoose");
const ApiResponse = require("../Utilities/ApiResponse");

const router = express.Router();

router.get("/", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];

  return res.status(200).json(
    new ApiResponse("Community platform API is healthy", {
      service: "samaj-community-platform",
      uptimeSeconds: Math.round(process.uptime()),
      database: states[mongoose.connection.readyState] || "unknown",
      timestamp: new Date().toISOString(),
    })
  );
});

module.exports = router;
