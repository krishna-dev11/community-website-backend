const express = require("express")
const router = express.Router();


const {forgotpasswordToken , forgotPassword} = require('../Controllers/resetPassword')
const {sendOTP , signUP , login , changePassword} = require('../Controllers/Auth')
const {googleLogin} = require('../Controllers/googleAuth')


// Middleware
const {auth , isStudent , isInstructor , isAdmin} = require("../Middlewares/auth")

// Forgot Password
router.post('/forgotpasswordToken' ,  forgotpasswordToken )
router.post('/forgotPassword' ,  forgotPassword)

// Auth Routes
router.post('/sendOTP' ,  sendOTP)
router.post('/signUP' , signUP)
router.post('/login' , login)
router.post('/changePassword' , auth ,  changePassword)

//google auth
router.post('/google-login' ,  googleLogin)

module.exports = router