const express = require("express")
const router = express.Router();

const {updateProfile , getAllUserDetails , updateDisplayPicture , deleteAccount} = require('../Controllers/Profile')
// Middleware
const {auth , isStudent , isInstructor , isAdmin} = require("../Middlewares/auth")


router.put('/updateProfile' , auth ,  updateProfile)
router.get('/getAllUserDetails' , auth ,  getAllUserDetails)
router.put('/updateDisplayPicture' , auth ,  updateDisplayPicture)
router.delete('/deleteAccount' , auth ,  deleteAccount)



module.exports = router