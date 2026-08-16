exports.courseEnrollmentEmail = (programName, name) => {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Program Registration Confirmation</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                background: linear-gradient(to right, #f2f4f8, #e8ebf0);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #2d3748;
            }
            .container {
                max-width: 650px;
                margin: 40px auto;
                background-color: #ffffff;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                border-radius: 12px;
                padding: 40px 50px;
                overflow: hidden;
            }
            .heading {
                font-size: 26px;
                font-weight: 700;
                color: #1a202c;
                text-align: center;
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 10px;
                margin-bottom: 25px;
            }
            .body {
                font-size: 17px;
                line-height: 1.6;
                text-align: left;
            }
            .highlight {
                font-weight: 600;
                color: #111111;
            }
            .cta {
                display: inline-block;
                background-color: #FFD60A;
                color: #000;
                text-decoration: none;
                padding: 14px 30px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: bold;
                margin-top: 30px;
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
            <div class="heading">Program Enrollment Successful</div>
            <div class="body">
                <p>Dear <span class="highlight">${name}</span>,</p>
                <p>Welcome to <span class="highlight">"${programName}"</span> at Vijayvargiya Spoken English / Bold Voice.</p>
                <p>Your coaching journey is now active. Visit your dashboard to view your batch, sessions, and learning updates.</p>
                <a class="cta" href="https://the-boldvoice.vercel.app/dashboard/my-profile">Go to Dashboard</a>
            </div>
            <div class="footer">
                Bold Voice supports your communication, confidence, and personality development journey.
            </div>
        </div>
    </body>
    </html>`;
};
