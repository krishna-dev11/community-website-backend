const express = require("express")
const router = express.Router();

const {updateProfile , getAllUserDetails , updateDisplayPicture , deleteAccount, searchMemberDirectory} = require('../Controllers/Profile')
const { auth } = require("../Middlewares/auth");


router.put('/updateProfile' , auth ,  updateProfile)
router.patch('/updateProfile' , auth ,  updateProfile)
router.get('/getAllUserDetails' , auth ,  getAllUserDetails)
router.get('/directory' , auth ,  searchMemberDirectory)
router.put('/updateDisplayPicture' , auth ,  updateDisplayPicture)
router.delete('/deleteAccount' , auth ,  deleteAccount)



module.exports = router
