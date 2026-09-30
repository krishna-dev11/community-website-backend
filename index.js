// const express = require("express")
// const app = express();
// const dns = require("node:dns");
// require("dotenv").config();

// dns.setServers(["8.8.8.8", "1.1.1.1"]);
// if (dns.setDefaultResultOrder) {
//   dns.setDefaultResultOrder("ipv4first");
// }



// const userRoutes = require("./Routes/User")
// const profileRoutes = require("./Routes/Profile")
// const healthRoutes = require("./Routes/health")
// const familyRoutes = require("./Routes/Family")
// const adminRoutes = require("./Routes/Admin")
// const notificationRoutes = require("./Routes/Notification")
// const contentRoutes = require("./Routes/Content")
// const opportunityRoutes = require("./Routes/Opportunity")
// const paymentRoutes = require("./Routes/Payment")
// const communityRoutes = require("./Routes/Community")
// const matrimonialRoutes = require("./Routes/Matrimonial")
// const { razorpayWebhook } = require("./Controllers/Payment")
// // const aiRoutes = require("./Routes/aiRoutes");

// console.log("Mongo URI exists:", !!process.env.MONGODB_URI);

// const {dbconnect} = require('./config/Database')
// const requestContext = require("./Middlewares/requestContext")
// const { errorHandler, notFoundHandler } = require("./Middlewares/errorHandler")
// const cookieParser = require('cookie-parser')
// const cors = require('cors')
// const {cloudinaryConnect} = require('./config/Cloudinary')
// const fileUpload = require('express-fileupload')
// const { startScheduledJobs } = require("./Utilities/scheduledJobs")


// const PORT = process.env.PORT || 4000;

// dbconnect();

// app.use(requestContext);
// app.use(
//   "/api/v1/payments/webhooks/razorpay",
//   express.raw({ type: "application/json" }),
//   (req, res, next) => {
//     req.rawBody = req.body;
//     try {
//       req.body = JSON.parse(req.body.toString("utf8"));
//       next();
//     } catch (error) {
//       next(error);
//     }
//   },
//   razorpayWebhook
// );
// app.use(express.json());
// app.use(cookieParser());
// const allowedOrigins = ( "http://localhost:5173" || "https://halbahalbisamaj.vercel.app" ||  process.env.CORS_ORIGINS || process.env.FRONTEND_URL   )
//   .split(",")
//   .map((origin) => origin.trim())
//   .filter(Boolean);

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true,
//     exposedHeaders: ["Content-Disposition", "Content-Type", "Content-Length"],
//   })
// );

// app.use(fileUpload({
//     useTempFiles : true,
//     tempFileDir : process.env.FILE_UPLOAD_TEMP_DIR || '/tmp/'
// }));

// cloudinaryConnect();

// app.use("/api/v1/health" , healthRoutes);
// app.use("/api/v1/auth" , userRoutes);
// app.use("/api/v1/profile" , profileRoutes);
// app.use("/api/v1/families" , familyRoutes);
// app.use("/api/v1/admin" , adminRoutes);
// app.use("/api/v1/notifications" , notificationRoutes);
// app.use("/api/v1/content" , contentRoutes);
// app.use("/api/v1/opportunities" , opportunityRoutes);
// app.use("/api/v1/payments" , paymentRoutes);
// app.use("/api/v1/community" , communityRoutes);
// app.use("/api/v1/matrimonial" , matrimonialRoutes);
// // app.use("/api/v1/ai", aiRoutes);





// app.get('/' , async(req ,res)=>{
//     return res.json({
//         success:true,
//         message : 'Samaj Community Platform API is up and running'
//     })
// });

// app.use(notFoundHandler);
// app.use(errorHandler);

// app.listen(PORT , ()=>{
//     console.log(`Samaj Community Platform API listening on port ${PORT}`)
// });

// startScheduledJobs();












const express = require("express");
const app = express();

const dns = require("node:dns");
require("dotenv").config();

// --------------------------------------------------
// DNS CONFIG
// --------------------------------------------------

dns.setServers(["8.8.8.8", "1.1.1.1"]);

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

// --------------------------------------------------
// ROUTES
// --------------------------------------------------

const userRoutes = require("./Routes/User");
const profileRoutes = require("./Routes/Profile");
const healthRoutes = require("./Routes/health");
const familyRoutes = require("./Routes/Family");
const adminRoutes = require("./Routes/Admin");
const notificationRoutes = require("./Routes/Notification");
const contentRoutes = require("./Routes/Content");
const opportunityRoutes = require("./Routes/Opportunity");
const paymentRoutes = require("./Routes/Payment");
const communityRoutes = require("./Routes/Community");
const matrimonialRoutes = require("./Routes/Matrimonial");

// --------------------------------------------------
// CONTROLLERS
// --------------------------------------------------

const { razorpayWebhook } = require("./Controllers/Payment");

// const aiRoutes = require("./Routes/aiRoutes");

// --------------------------------------------------
// CONFIG / MIDDLEWARES
// --------------------------------------------------

const { dbconnect } = require("./config/Database");
const requestContext = require("./Middlewares/requestContext");
const {
  errorHandler,
  notFoundHandler,
} = require("./Middlewares/errorHandler");

const cookieParser = require("cookie-parser");
const cors = require("cors");
const { cloudinaryConnect } = require("./config/Cloudinary");
const fileUpload = require("express-fileupload");
const { startScheduledJobs } = require("./Utilities/scheduledJobs");

// --------------------------------------------------
// PORT
// --------------------------------------------------

const PORT = process.env.PORT || 4000;

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

console.log("Mongo URI exists:", !!process.env.MONGODB_URI);

dbconnect();

// --------------------------------------------------
// REQUEST CONTEXT
// --------------------------------------------------

app.use(requestContext);

// --------------------------------------------------
// RAZORPAY WEBHOOK
// IMPORTANT:
// Keep this BEFORE express.json()
// because Razorpay webhook requires raw body.
// --------------------------------------------------

app.use(
  "/api/v1/payments/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body;

    try {
      req.body = JSON.parse(req.body.toString("utf8"));
      next();
    } catch (error) {
      next(error);
    }
  },
  razorpayWebhook
);

// --------------------------------------------------
// BODY PARSERS
// --------------------------------------------------

app.use(express.json());
app.use(cookieParser());

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

// IMPORTANT:
// Do NOT use:
//
// ("http://localhost:5173" || "https://halbahalbisamaj.vercel.app")
//
// because JavaScript will always select the first
// non-empty string.
//
// Instead, create an actual array of allowed origins.

const allowedOrigins = [
  // Local development
  "http://localhost:5173",
  "http://localhost:3000",

  // Production frontend
  "https://halbahalbisamaj.vercel.app",

  // Additional origins from environment variables
  ...(process.env.CORS_ORIGINS || "").split(","),

  // Primary frontend URL from environment
  process.env.FRONTEND_URL || "",
]
  .map((origin) => origin.trim())
  .filter(Boolean);

// Remove duplicate origins
const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

console.log("Allowed CORS Origins:");
console.log(uniqueAllowedOrigins);

// --------------------------------------------------
// CORS OPTIONS
// --------------------------------------------------

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests without Origin header.
    // Useful for Postman, server-to-server requests,
    // health checks, etc.
    if (!origin) {
      return callback(null, true);
    }

    // Allow if origin exists in whitelist
    if (uniqueAllowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log("Blocked CORS Origin:", origin);

    return callback(
      new Error(`CORS blocked for origin: ${origin}`)
    );
  },

  // Required when using cookies / authentication
  credentials: true,

  // Headers exposed to frontend
  exposedHeaders: [
    "Content-Disposition",
    "Content-Type",
    "Content-Length",
  ],
};

// Apply CORS
app.use(cors(corsOptions));

// --------------------------------------------------
// FILE UPLOAD
// --------------------------------------------------

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir:
      process.env.FILE_UPLOAD_TEMP_DIR || "/tmp/",
  })
);

// --------------------------------------------------
// CLOUDINARY
// --------------------------------------------------

cloudinaryConnect();

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use("/api/v1/health", healthRoutes);

app.use("/api/v1/auth", userRoutes);

app.use("/api/v1/profile", profileRoutes);

app.use("/api/v1/families", familyRoutes);

app.use("/api/v1/admin", adminRoutes);

app.use("/api/v1/notifications", notificationRoutes);

app.use("/api/v1/content", contentRoutes);

app.use("/api/v1/opportunities", opportunityRoutes);

app.use("/api/v1/payments", paymentRoutes);

app.use("/api/v1/community", communityRoutes);

app.use("/api/v1/matrimonial", matrimonialRoutes);

// AI routes
// app.use("/api/v1/ai", aiRoutes);

// --------------------------------------------------
// ROOT ROUTE
// --------------------------------------------------

app.get("/", async (req, res) => {
  return res.json({
    success: true,
    message: "Samaj Community Platform API is up and running",
  });
});

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use(notFoundHandler);

// --------------------------------------------------
// GLOBAL ERROR HANDLER
// --------------------------------------------------

app.use(errorHandler);

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Samaj Community Platform API listening on port ${PORT}`
  );
});

// --------------------------------------------------
// SCHEDULED JOBS
// --------------------------------------------------

startScheduledJobs();