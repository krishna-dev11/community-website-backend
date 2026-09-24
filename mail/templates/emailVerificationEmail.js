const emailTemplate = (otp) => {
  const safeOtp = String(otp ?? "").replace(/[<>&"]/g, "");

  return `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">

  <title>Account Verification | Adivasi Halba/Halbi Samaj</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    width:100%;
    background-color:#eef3ee;
    font-family:Arial, Helvetica, sans-serif;
    color:#26352b;
  "
>

  <!-- ========================================================= -->
  <!-- OUTER WRAPPER -->
  <!-- ========================================================= -->

  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      width:100%;
      background-color:#eef3ee;
    "
  >

    <tr>
      <td
        align="center"
        style="
          padding:35px 14px;
        "
      >

        <!-- =================================================== -->
        <!-- MAIN EMAIL CARD -->
        <!-- =================================================== -->

        <table
          role="presentation"
          width="600"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:600px;
            background-color:#ffffff;
            border:1px solid #dce6dd;
            border-radius:18px;
            overflow:hidden;
          "
        >

          <!-- ================================================= -->
          <!-- TOP BRAND STRIP -->
          <!-- ================================================= -->

          <tr>
            <td
              style="
                height:6px;
                background-color:#1f5d3a;
                font-size:0;
                line-height:0;
              "
            >
              &nbsp;
            </td>
          </tr>


          <!-- ================================================= -->
          <!-- BRAND HEADER -->
          <!-- ================================================= -->

          <tr>
            <td
              align="center"
              style="
                padding:30px 25px 27px;
                background-color:#ffffff;
              "
            >

              <!-- Community Emblem -->
              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>

                  <td
                    align="center"
                    valign="middle"
                    style="
                      width:64px;
                      height:64px;
                      border-radius:50%;
                      background-color:#edf5ee;
                      border:1px solid #cddfcf;
                      color:#1f5d3a;
                      font-size:23px;
                      line-height:64px;
                      font-weight:bold;
                    "
                  >
                    AH
                  </td>

                </tr>
              </table>


              <!-- Organization Name -->

              <div
                style="
                  margin-top:15px;
                  font-size:15px;
                  line-height:22px;
                  font-weight:bold;
                  letter-spacing:0.5px;
                  color:#1f5d3a;
                  text-transform:uppercase;
                "
              >
                ADIVASI HALBA/HALBI SAMAJ
              </div>

              <div
                style="
                  margin-top:2px;
                  font-size:13px;
                  line-height:20px;
                  font-weight:bold;
                  color:#315b42;
                "
              >
                KALYAN SAMITI, UJJAIN
              </div>


              <!-- Gold Divider -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin-top:14px;
                "
              >
                <tr>
                  <td
                    style="
                      width:55px;
                      height:3px;
                      background-color:#b88928;
                      font-size:0;
                      line-height:0;
                    "
                  >
                    &nbsp;
                  </td>
                </tr>
              </table>


              <div
                style="
                  margin-top:11px;
                  font-size:10px;
                  line-height:16px;
                  letter-spacing:1.4px;
                  font-weight:bold;
                  color:#8a6b25;
                "
              >
                OFFICIAL COMMUNITY DIGITAL PLATFORM
              </div>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- HERO -->
          <!-- ================================================= -->

          <tr>
            <td
              align="center"
              style="
                padding:34px 30px 32px;
                background-color:#1f5d3a;
              "
            >

              <div
                style="
                  font-size:10px;
                  line-height:17px;
                  letter-spacing:1.8px;
                  font-weight:bold;
                  color:#cfe1d2;
                "
              >
                ACCOUNT SECURITY
              </div>


              <div
                style="
                  margin-top:10px;
                  font-size:27px;
                  line-height:36px;
                  font-weight:bold;
                  color:#ffffff;
                "
              >
                Verify Your Account
              </div>


              <div
                style="
                  margin-top:10px;
                  font-size:14px;
                  line-height:23px;
                  color:#e2eee5;
                "
              >
                आपके खाते की पहचान सत्यापित करने के लिए
                एक One-Time Password जारी किया गया है।
              </div>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- MAIN CONTENT -->
          <!-- ================================================= -->

          <tr>
            <td
              style="
                padding:34px 38px 10px;
                background-color:#ffffff;
              "
            >

              <div
                style="
                  font-size:16px;
                  line-height:26px;
                  font-weight:bold;
                  color:#26352b;
                "
              >
                नमस्कार 🙏
              </div>


              <p
                style="
                  margin:13px 0 0;
                  font-size:14px;
                  line-height:25px;
                  color:#56635a;
                "
              >
                आदिवासी हल्बा/हल्बी समाज कल्याण समिति, उज्जैन
                के डिजिटल प्लेटफॉर्म पर आपके खाते की सुरक्षा और
                पहचान सत्यापित करने के लिए यह One-Time Password
                भेजा गया है।
              </p>


              <p
                style="
                  margin:12px 0 0;
                  font-size:14px;
                  line-height:25px;
                  color:#56635a;
                "
              >
                कृपया नीचे दिए गए OTP को वेबसाइट के verification
                page पर दर्ज करें।
              </p>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- OTP SECTION -->
          <!-- ================================================= -->

          <tr>
            <td
              align="center"
              style="
                padding:28px 38px 30px;
                background-color:#ffffff;
              "
            >

              <div
                style="
                  font-size:10px;
                  line-height:16px;
                  letter-spacing:1.7px;
                  font-weight:bold;
                  color:#7b887e;
                  text-transform:uppercase;
                  margin-bottom:13px;
                "
              >
                YOUR VERIFICATION CODE
              </div>


              <!-- OTP BOX -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >
                <tr>

                  <td
                    align="center"
                    valign="middle"
                    style="
                      background-color:#f3f8f3;
                      border:2px solid #1f5d3a;
                      border-radius:13px;
                      padding:17px 30px;
                    "
                  >

                    <div
                      style="
                        font-size:32px;
                        line-height:38px;
                        font-weight:bold;
                        letter-spacing:8px;
                        color:#1f5d3a;
                        white-space:nowrap;
                      "
                    >
                      ${safeOtp}
                    </div>

                  </td>

                </tr>
              </table>


              <!-- Validity -->

              <div
                style="
                  margin-top:14px;
                  font-size:13px;
                  line-height:21px;
                  color:#68746b;
                "
              >
                यह verification code
                <strong style="color:#1f5d3a;">
                  10 मिनट
                </strong>
                तक मान्य रहेगा।
              </div>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- SECURITY CARD -->
          <!-- ================================================= -->

          <tr>
            <td
              style="
                padding:0 38px 30px;
                background-color:#ffffff;
              "
            >

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  width:100%;
                  background-color:#fffaf0;
                  border:1px solid #ead9aa;
                  border-radius:12px;
                "
              >

                <tr>

                  <td
                    valign="top"
                    style="
                      width:38px;
                      padding:18px 0 18px 18px;
                      font-size:20px;
                      line-height:25px;
                    "
                  >
                    🔐
                  </td>


                  <td
                    valign="top"
                    style="
                      padding:17px 18px 17px 8px;
                    "
                  >

                    <div
                      style="
                        font-size:14px;
                        line-height:20px;
                        font-weight:bold;
                        color:#6f531b;
                        margin-bottom:6px;
                      "
                    >
                      सुरक्षा सूचना
                    </div>


                    <div
                      style="
                        font-size:12px;
                        line-height:21px;
                        color:#806d43;
                      "
                    >
                      इस OTP को किसी अन्य व्यक्ति के साथ साझा न करें।
                      Samaj की टीम आपसे कभी भी आपका OTP,
                      password या verification code ईमेल/फोन पर
                      नहीं मांगेगी।
                    </div>

                  </td>

                </tr>

              </table>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- DIDN'T REQUEST -->
          <!-- ================================================= -->

          <tr>
            <td
              style="
                padding:0 38px 30px;
                background-color:#ffffff;
              "
            >

              <p
                style="
                  margin:0;
                  font-size:12px;
                  line-height:21px;
                  color:#7b857d;
                "
              >
                <strong style="color:#4d5a51;">
                  यह OTP आपने request नहीं किया?
                </strong>
                तब किसी भी link पर जाने या OTP साझा करने की
                आवश्यकता नहीं है। इस ईमेल को सुरक्षित रूप से
                अनदेखा कर सकते हैं।
              </p>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- COMMUNITY IDENTITY -->
          <!-- ================================================= -->

          <tr>
            <td
              align="center"
              style="
                padding:28px 30px;
                background-color:#f7faf7;
                border-top:1px solid #e1e9e2;
                border-bottom:1px solid #e1e9e2;
              "
            >

              <div
                style="
                  font-size:12px;
                  line-height:20px;
                  color:#7c6a39;
                  font-style:italic;
                "
              >
                “गर्व से कहो हम आदिवासी हैं,<br>
                भारत के मूल निवासी हैं”
              </div>


              <div
                style="
                  margin-top:11px;
                  font-size:11px;
                  line-height:18px;
                  color:#8a948c;
                "
              >
                Community • Identity • Unity • Digital Empowerment
              </div>

            </td>
          </tr>


          <!-- ================================================= -->
          <!-- FOOTER -->
          <!-- ================================================= -->

          <tr>
            <td
              align="center"
              style="
                padding:27px 25px;
                background-color:#173f29;
              "
            >

              <div
                style="
                  font-size:13px;
                  line-height:21px;
                  font-weight:bold;
                  color:#ffffff;
                "
              >
                ADIVASI HALBA/HALBI SAMAJ
              </div>


              <div
                style="
                  margin-top:2px;
                  font-size:12px;
                  line-height:19px;
                  color:#d3e2d6;
                "
              >
                KALYAN SAMITI, UJJAIN
              </div>


              <div
                style="
                  margin-top:13px;
                  font-size:11px;
                  line-height:18px;
                  color:#a9bcae;
                "
              >
                उज्जैन, मध्य प्रदेश
                &nbsp; • &nbsp;
                9926018058
              </div>


              <div
                style="
                  margin-top:13px;
                  padding-top:13px;
                  border-top:1px solid #315a42;
                  font-size:10px;
                  line-height:17px;
                  color:#829a88;
                "
              >
                यह एक स्वचालित सुरक्षा ईमेल है। कृपया इस ईमेल का
                सीधे उत्तर न दें।
              </div>


              <div
                style="
                  margin-top:9px;
                  font-size:10px;
                  line-height:16px;
                  color:#6f8a77;
                "
              >
                © ${new Date().getFullYear()}
                Adivasi Halba/Halbi Samaj Kalyan Samiti, Ujjain
              </div>

            </td>
          </tr>

        </table>

      </td>
    </tr>

  </table>

</body>
</html>`;
};

module.exports = emailTemplate;