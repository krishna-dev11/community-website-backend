const dns = require("dns");
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch (e) {}
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

    // Safe index adjustment for shared family email and memberId
    try {
      const userCollection = mongoose.connection.collection("users");
      const indexes = await userCollection.indexes();
      const emailIndex = indexes.find((idx) => idx.name === "email_1");
      if (emailIndex && emailIndex.unique) {
        console.log("ℹ️ Migrating legacy unique email index to support shared family contact...");
        await userCollection.dropIndex("email_1");
        await userCollection.createIndex({ email: 1 });
        console.log("✅ Converted email_1 to non-unique index");
      }
    } catch (indexErr) {
      // Ignore if index doesn't exist or already migrated
    }
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    console.error("\n👉 Tip: If you see 'ETIMEDOUT', please ensure:");
    console.error("1. Your IP address is whitelisted in MongoDB Atlas (Network Access -> Add 0.0.0.0/0)");
    console.error("2. Your internet / hotspot / Wi-Fi is active and allows port 27017\n");
  }
};
