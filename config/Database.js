const mongoose = require("mongoose");
require("dotenv").config();

exports.dbconnect = async () => {
  if (!process.env.MONGODB_URL) {
    console.error("❌ MONGODB_URL is missing in .env file.");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log("✅ MongoDB connection established successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    console.error("\n👉 Tip: If you see 'ETIMEDOUT', please ensure:");
    console.error("1. Your IP address is whitelisted in MongoDB Atlas (Network Access -> Add 0.0.0.0/0)");
    console.error("2. Your internet / hotspot / Wi-Fi is active and allows port 27017\n");
  }
};
