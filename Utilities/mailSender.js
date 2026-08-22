const nodemailer = require("nodemailer");
require("dotenv").config();

exports.mailSender = async(email , title , body)=>{

  try{

    let transporter = nodemailer.createTransport({
        host:process.env.EMAIL_HOST || process.env.MAIL_HOST,
        port:process.env.EMAIL_PORT || process.env.MAIL_PORT,
        auth:{
            user:process.env.EMAIL_USER || process.env.MAIL_USER,
            pass:process.env.EMAIL_PASSWORD || process.env.MAIL_PASS
        }
    })

    let mailsended = await transporter.sendMail({
        from:process.env.EMAIL_FROM || 'Samaj Community Platform',
        to:`${email}`,
        subject:`${title}`,
        html:`${body}`
    })

    // console.log(mailsended);
    return mailsended;

  }catch(error){
    console.error(error)
  }

}

