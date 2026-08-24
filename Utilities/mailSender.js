const nodemailer = require("nodemailer");
const dns = require("node:dns");
require("dotenv").config();

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

exports.mailSender = async (email, title, body) => {
  const host = process.env.EMAIL_HOST || process.env.MAIL_HOST || "smtp.gmail.com";
  const user = process.env.EMAIL_USER || process.env.MAIL_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.MAIL_PASS;
  const port = Number(process.env.EMAIL_PORT || process.env.MAIL_PORT) || (host.includes("gmail") ? 465 : 587);
  const secure = port === 465;

  if (!user || !pass) {
    console.warn(`[mailSender] SMTP credentials (MAIL_USER / MAIL_PASS) are not configured in environment variables. Email to ${email} skipped.`);
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    console.log(`[mailSender] Sending email to: ${email} | Subject: "${title}" via ${host.includes("gmail") ? "Gmail Service" : `${host}:${port}`} (secure: ${secure})`);

    const transportOptions = {
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      family: 4,
    };

    if (host.includes("gmail")) {
      transportOptions.service = "gmail";
    } else {
      transportOptions.host = host;
      transportOptions.port = port;
      transportOptions.secure = secure;
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Samaj Community Portal" <${user}>`,
      to: `${email}`,
      subject: `${title}`,
      html: `${body}`,
    });

    console.log(`[mailSender] Email sent successfully to ${email}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[mailSender] Error sending email to ${email}:`, error.message);
    throw error;
  }
};
