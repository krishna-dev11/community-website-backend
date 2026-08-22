const Razorpay = require("razorpay");
require("dotenv").config()

exports.instance = new Razorpay({
    key_id : process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
    key_secret : process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET

}) ;


