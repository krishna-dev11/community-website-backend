const express = require("express")
const app = express();
const dns = require("node:dns");
require("dotenv").config();

dns.setServers(["8.8.8.8", "1.1.1.1"]);
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}



const userRoutes = require("./Routes/User")
const profileRoutes = require("./Routes/Profile")
const healthRoutes = require("./Routes/health")
const familyRoutes = require("./Routes/Family")
const adminRoutes = require("./Routes/Admin")
const notificationRoutes = require("./Routes/Notification")
const contentRoutes = require("./Routes/Content")
const opportunityRoutes = require("./Routes/Opportunity")
const paymentRoutes = require("./Routes/Payment")
const communityRoutes = require("./Routes/Community")
const matrimonialRoutes = require("./Routes/Matrimonial")
const { razorpayWebhook } = require("./Controllers/Payment")
// const aiRoutes = require("./Routes/aiRoutes");

console.log("Mongo URI exists:", !!process.env.MONGODB_URI);

const {dbconnect} = require('./config/Database')
const requestContext = require("./Middlewares/requestContext")
const { errorHandler, notFoundHandler } = require("./Middlewares/errorHandler")
const cookieParser = require('cookie-parser')
const cors = require('cors')
const {cloudinaryConnect} = require('./config/Cloudinary')
const fileUpload = require('express-fileupload')
const { startScheduledJobs } = require("./Utilities/scheduledJobs")


const PORT = process.env.PORT || 4000;

dbconnect();

app.use(requestContext);
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
app.use(express.json());
app.use(cookieParser());
const allowedOrigins = ( "https://halbahalbisamaj.vercel.app" ||  process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173"  )
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(fileUpload({
    useTempFiles : true,
    tempFileDir : process.env.FILE_UPLOAD_TEMP_DIR || '/tmp/'
}));

cloudinaryConnect();

app.use("/api/v1/health" , healthRoutes);
app.use("/api/v1/auth" , userRoutes);
app.use("/api/v1/profile" , profileRoutes);
app.use("/api/v1/families" , familyRoutes);
app.use("/api/v1/admin" , adminRoutes);
app.use("/api/v1/notifications" , notificationRoutes);
app.use("/api/v1/content" , contentRoutes);
app.use("/api/v1/opportunities" , opportunityRoutes);
app.use("/api/v1/payments" , paymentRoutes);
app.use("/api/v1/community" , communityRoutes);
app.use("/api/v1/matrimonial" , matrimonialRoutes);
// app.use("/api/v1/ai", aiRoutes);





app.get('/' , async(req ,res)=>{
    return res.json({
        success:true,
        message : 'Samaj Community Platform API is up and running'
    })
});

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT , ()=>{
    console.log(`Samaj Community Platform API listening on port ${PORT}`)
});

startScheduledJobs();
