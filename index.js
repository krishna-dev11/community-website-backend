const express = require("express")
const app = express();
const dns = require("node:dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);



const userRoutes = require("./Routes/User")
const profileRoutes = require("./Routes/Profile")
// const aiRoutes = require("./Routes/aiRoutes");



const {dbconnect} = require('./config/Database')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const {cloudinaryConnect} = require('./config/Cloudinary')
const fileUpload = require('express-fileupload')
require("dotenv").config();


const PORT = process.env.PORT || 4000;

dbconnect();

app.use(express.json());
app.use(cookieParser());
const allowedOrigins = [
  "http://localhost:5173",
  "https://the-boldvoice.vercel.app"
];

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
    tempFileDir : '/tmp/'
}));

cloudinaryConnect();

app.use("/api/v1/auth" , userRoutes);
app.use("/api/v1/profile" , profileRoutes);
// app.use("/api/v1/ai", aiRoutes);





app.get('/' , async(req ,res)=>{
    return res.json({
        success:true,
        message : 'Bold Voice CRM server is up and running'
    })
});


app.listen(PORT , ()=>{
    console.log(`Bold Voice CRM server listening on port ${PORT}`)
});
