const jwt = require("jsonwebtoken");
const ApiError = require("../Utilities/ApiError");
const { hasPermission } = require("../constants/permissions");
const User = require("../Models/user");
require("dotenv").config();
// auth  check
exports.auth = async(req , res , next)=>{
    try{
        const authHeader = req.header("Authorization") || "";
        const token = req.body.token || req.cookies.token || authHeader.replace("Bearer " , "");
        if(!token){
            return res.status(401).json({
                success:false,
                message:"token is missing"
            })
        }
        
        try{
          
            const payload = jwt.verify(token , process.env.JWT_ACCESS_SECRET || process.env.SECRET_KEY);
            const user = await User.findById(payload.userId || payload.id).select("roles accountType accountStatus active tokenVersion");

            if (!user) {
                return res.status(401).json({
                    success:false,
                    message:"user no longer exists",
                })
            }

            if (!user.active || ["SUSPENDED", "DEACTIVATED"].includes(user.accountStatus)) {
                return res.status(403).json({
                    success:false,
                    message:"account is not active",
                })
            }

            if (typeof payload.tokenVersion === "number" && payload.tokenVersion !== user.tokenVersion) {
                return res.status(401).json({
                    success:false,
                    message:"token is no longer valid",
                })
            }

            req.user = {
                ...payload,
                id: String(user._id),
                userId: String(user._id),
                roles: user.roles,
                accountType: user.accountType,
                accountStatus: user.accountStatus,
            };

            // console.log(req.body)

        }catch(error){
            
            return res.status(401).json({
                success:false,
                message:"token is Invalid",
            }) 

        }
       
        next();
        

    }catch(error){
       
        return res.status(500).json({
            success:false,
            message:"there would be some error in fetching the token"
        })

    }
}

exports.authorize = (permission) => {
    return (req, res, next) => {
        const roles = req.user?.roles || req.user?.accountType || [];

        if (!hasPermission(roles, permission)) {
            return next(new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action"));
        }

        next();
    };
};

// checked
// isStudent
exports.isStudent = async(req , res , next)=>{
    try{

        if(req.user.accountType !== "Student"){
            return res.status(401).json({
                success:false,
                message:"these is a protected route for student"
            })
        }

        next();

    }catch(error){

        return res.status(500).json({
            success:false,
            message:"there would be some error in fetching th accountType of user"
        })

    }
}

// checked 
// isInstructor
exports.isInstructor = async(req , res , next)=>{
    try{

        if(req.user.accountType !== "Instructor"){
            return res.status(401).json({
                success:false,
                message:"these is a protected route for instructor"
            })
        }

        next();

    }catch(error){

        return res.status(500).json({
            success:false,
            message:"there would be some error in fetching the accountType of user"
        })

    }
}

// checked
// isAdmin  
exports.isAdmin = async(req , res , next)=>{
    try{

        if(req.user.accountType !== "Admin"){
            return res.status(401).json({
                success:false,
                message:"these is a protected route for Admin"
            })
        }

        next();

    }catch(error){

        return res.status(500).json({
            success:false,
            message:"there would be some error in fetching th accountType of user"
        })

    }
}

exports.optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization") || "";
        const token = req.body?.token || req.cookies?.token || authHeader.replace("Bearer ", "");
        if (!token) {
            return next();
        }

        try {
            const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || process.env.SECRET_KEY);
            const user = await User.findById(payload.userId || payload.id).select("roles accountType accountStatus active tokenVersion");

            if (user && user.active && !["SUSPENDED", "DEACTIVATED"].includes(user.accountStatus)) {
                req.user = {
                    ...payload,
                    id: String(user._id),
                    userId: String(user._id),
                    roles: user.roles,
                    accountType: user.accountType,
                    accountStatus: user.accountStatus,
                };
            }
        } catch (ignored) {
            // Unauthenticated guest request
        }
        next();
    } catch (error) {
        next();
    }
};
