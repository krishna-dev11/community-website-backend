const jwt = require("jsonwebtoken");
require("dotenv").config();
// auth  check
exports.auth = async(req , res , next)=>{
    try{
        console.log( req.body , "authMiddleware")
        const token = req.body.token || req.cookies.token || req.header("Authorization").replace("Bearer " , "");
        if(!token){
            return res.status(401).json({
                success:false,
                message:"token is missing"
            })
        }
        
        try{
          
            const payload = jwt.verify(token , process.env.SECRET_KEY);
            // console.log(payload)
            req.user = payload;

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

// checked
// isstudent
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

        // console.log(req.body  , "inst")

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

