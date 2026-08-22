const express = require("express")
const router = express.Router();


const {forgotpasswordToken , forgotPassword} = require('../Controllers/resetPassword')
const {
  sendOTP,
  signUP,
  login,
  changePassword,
  refreshAccessToken,
  logout,
  listPendingRegistrations,
  reviewRegistration,
  resubmitRegistration,
  getRegistrationDocument,
} = require('../Controllers/Auth')


// Middleware
const {auth , authorize} = require("../Middlewares/auth")

// Forgot Password
router.post('/forgotpasswordToken' ,  forgotpasswordToken )
router.post('/forgotPassword' ,  forgotPassword)

// Auth Routes
router.post('/sendOTP' ,  sendOTP)
router.post('/signUP' , signUP)
router.post('/register' , signUP)
router.post('/login' , login)
router.post('/refresh-token' , refreshAccessToken)
router.post('/logout' , auth , logout)
router.post('/changePassword' , auth ,  changePassword)
router.put('/registration/resubmit' , resubmitRegistration)
router.get('/registrations/pending' , auth , authorize('member:verify') , listPendingRegistrations)
router.patch('/registrations/:userId/review' , auth , authorize('member:verify') , reviewRegistration)
router.get('/registrations/:userId/document' , auth , authorize('member:verify') , getRegistrationDocument)

module.exports = router
