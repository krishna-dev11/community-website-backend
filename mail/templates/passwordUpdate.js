const passwordUpdated = (email, name) => {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Password Updated</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                background: linear-gradient(to right, #f8fafc, #e2e8f0);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #2d3748;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                border-radius: 12px;
                padding: 40px 50px;
                text-align: center;
            }
            .heading {
                font-size: 24px;
                font-weight: 700;
                color: #1a202c;
                margin-bottom: 25px;
            }
            .body {
                font-size: 16px;
                line-height: 1.7;
                text-align: left;
                color: #4a5568;
            }
            .highlight {
                font-weight: bold;
                color: #2b6cb0;
            }
            .footer {
                font-size: 14px;
                color: #718096;
                text-align: center;
                margin-top: 40px;
                line-height: 1.5;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="heading">Password Successfully Updated</div>
            <div class="body">
                <p>Hi ${name},</p>
                <p>This confirms that the password for your Bold Voice account associated with <span class="highlight">${email}</span> has been changed.</p>
                <p>If you did not make this change, please contact the Bold Voice support team immediately.</p>
                <p>For your safety, do not share your credentials with anyone.</p>
            </div>
            <div class="footer">
                Vijayvargiya Spoken English / Bold Voice
            </div>
        </div>
    </body>
    </html>`;
};

module.exports = passwordUpdated;
