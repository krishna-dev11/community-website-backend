const { Resend } = require("resend");
require("dotenv").config();

let resendClient = null;

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!resendClient || resendClient.key !== apiKey) {
    resendClient = new Resend(apiKey);
    resendClient.key = apiKey;
  }
  return resendClient;
}

/**
 * Sends an email using Resend API.
 * @param {string|string[]} email - Recipient email address(es).
 * @param {string} title - Email subject.
 * @param {string} body - HTML email body.
 * @returns {Promise<{success: boolean, messageId?: string, reason?: string}>}
 */
exports.mailSender = async (email, title, body) => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(
      `[mailSender] RESEND_API_KEY is not configured in environment variables. Email to ${email} skipped.`
    );
    return { success: false, reason: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  const recipients = Array.isArray(email) ? email : [email];
  const fromAddress =
    process.env.RESEND_FROM ||
    process.env.EMAIL_FROM ||
    "Halba Halbi Samaj <onboarding@resend.dev>";

  try {
    const resend = getResendClient();
    console.log(
      `[mailSender] Sending email via Resend to: ${recipients.join(", ")} | Subject: "${title}" | From: "${fromAddress}"`
    );

    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject: title,
      html: body,
    });

    if (error) {
      console.error(`[mailSender] Resend error for ${recipients.join(", ")}:`, error);
      throw new Error(error.message || "Failed to send email via Resend");
    }

    console.log(
      `[mailSender] Email sent successfully via Resend to ${recipients.join(", ")}. Id: ${data?.id}`
    );
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error(
      `[mailSender] Error sending email via Resend to ${recipients.join(", ")}:`,
      error.message
    );
    throw error;
  }
};
