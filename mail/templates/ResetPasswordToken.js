exports.ResetPasswordLink = (email, resetUrl) => {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Reset Your Password</title>
        <style>
            body {
                background-color: #f7fafc;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                color: #2d3748;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                padding: 40px 30px;
                border-radius: 12px;
                box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
                text-align: center;
            }
            .heading {
                font-size: 22px;
                font-weight: 700;
                color: #1a202c;
                margin-bottom: 15px;
            }
            .body {
                font-size: 16px;
                text-align: left;
                line-height: 1.7;
                color: #4a5568;
            }
            .highlight {
                font-weight: bold;
                color: #e53e3e;
            }
            .button {
                display: inline-block;
                margin: 30px 0;
                padding: 12px 24px;
                font-size: 16px;
                color: #ffffff;
                background-color: #3182ce;
                border-radius: 6px;
                text-decoration: none;
            }
            .support {
                font-size: 14px;
                margin-top: 35px;
                color: #718096;
            }
            a {
                color: #2b6cb0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="heading">Reset Your Password</div>
            <div class="body">
                <p>Hello,</p>
                <p>We noticed a request to change the password for your Bold Voice account associated with <span class="highlight">${email}</span>.</p>
                <p>If this was you, please click the button below to reset your password securely:</p>
                <a href="${resetUrl}" class="button">Reset Password</a>
                <p>If you did not request this, no action is needed. Your password remains secure.</p>
                <p>Always keep your credentials private and secure.</p>
            </div>
            <div class="support">
                Need help? Contact the Bold Voice support team.
            </div>
        </div>
    </body>
    </html>`;
};
