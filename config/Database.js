const mongoose = require("mongoose");
require("dotenv").config();

exports.dbconnect = async () => {
  if (!process.env.MONGODB_URL) {
    console.error("MONGODB_URL is missing. Add it to .env before starting the API.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("MongoDB connection established");
  } catch (error) {
    console.error("MongoDB connection failed");
    console.error(error);
    process.exit(1);
  }
};
