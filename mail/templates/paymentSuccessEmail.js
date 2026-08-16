exports.paymentSuccessEmail = (name, amount, orderId, paymentId) => {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>Payment Success</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                background: linear-gradient(to right, #f4f7f9, #e9ecf0);
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #2c3e50;
            }
            .container {
                max-width: 650px;
                margin: 40px auto;
                background: #ffffff;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
                border-radius: 12px;
                overflow: hidden;
                padding: 30px 40px;
            }
            .heading {
                font-size: 24px;
                font-weight: 700;
                color: #1a1a1a;
                text-align: center;
                margin-bottom: 25px;
                border-bottom: 1px solid #e0e0e0;
                padding-bottom: 10px;
            }
            .message {
                font-size: 18px;
                line-height: 1.6;
                margin-bottom: 25px;
            }
            .highlight-box {
                background-color: #f9f9f9;
                border-left: 4px solid #FFD60A;
                padding: 15px 20px;
                margin: 20px 0;
                border-radius: 6px;
            }
            .highlight-box p {
                margin: 8px 0;
                font-size: 16px;
            }
            .bold {
                font-weight: 600;
                color: #000;
            }
            .cta {
                display: inline-block;
                margin-top: 30px;
                padding: 12px 30px;
                background-color: #FFD60A;
                color: #000000;
                text-decoration: none;
                font-size: 16px;
                font-weight: bold;
                border-radius: 8px;
            }
            .footer {
                margin-top: 40px;
                font-size: 14px;
                color: #888;
                text-align: center;
                line-height: 1.5;
            }
            a {
                color: #1e88e5;
                text-decoration: none;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="heading">Payment Confirmation</div>
            <div class="message">
                Dear <span class="bold">${name}</span>,<br><br>
                Thank you for joining Bold Voice. Your payment has been received successfully.
            </div>
            <div class="highlight-box">
                <p><span class="bold">Amount Paid:</span> Rs. ${amount}</p>
                <p><span class="bold">Payment ID:</span> ${paymentId}</p>
                <p><span class="bold">Order ID:</span> ${orderId}</p>
            </div>
            <a class="cta" href="https://the-boldvoice.vercel.app">Go to Dashboard</a>
            <div class="footer">
                Vijayvargiya Spoken English / Bold Voice<br>
                We are here to support your communication and confidence journey.
            </div>
        </div>
    </body>
    </html>`;
}
