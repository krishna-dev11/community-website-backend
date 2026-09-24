function adminInviteEmail({ email, roles, url }) {
  const safeEmail = String(email || "").replace(/[<>&"]/g, "");
  const safeRoles = Array.isArray(roles)
    ? roles
        .map((role) => String(role).replace(/[<>&"]/g, ""))
        .join(" • ")
    : "Community Administration";

  const safeUrl = String(url || "#");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />

  <title>Administrative Invitation | Adivasi Halba/Halbi Samaj</title>

  <style>
    @media only screen and (max-width: 620px) {
      .email-container {
        width: 100% !important;
      }

      .mobile-padding {
        padding-left: 20px !important;
        padding-right: 20px !important;
      }

      .hero-title {
        font-size: 25px !important;
        line-height: 32px !important;
      }

      .hero-subtitle {
        font-size: 14px !important;
      }

      .button {
        width: 100% !important;
      }

      .button a {
        display: block !important;
      }
    }
  </style>
</head>

<body
  style="
    margin:0;
    padding:0;
    background-color:#f3f6f1;
    font-family:Arial, Helvetica, sans-serif;
    color:#26352b;
  "
>

<!-- PREHEADER -->
<div
  style="
    display:none;
    max-height:0;
    overflow:hidden;
    opacity:0;
    color:transparent;
    mso-hide:all;
  "
>
  You have been invited to join the administrative team of Adivasi Halba/Halbi Samaj Kalyan Samiti, Ujjain.
</div>

<table
  role="presentation"
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="background-color:#f3f6f1;"
>
  <tr>
    <td align="center" style="padding:32px 12px;">

      <!-- MAIN CONTAINER -->
      <table
        role="presentation"
        width="600"
        cellpadding="0"
        cellspacing="0"
        border="0"
        class="email-container"
        style="
          width:600px;
          max-width:600px;
          background-color:#ffffff;
          border-radius:18px;
          overflow:hidden;
          border:1px solid #dfe7df;
          box-shadow:0 10px 35px rgba(30,70,45,0.10);
        "
      >

        <!-- ===================================================== -->
        <!-- TOP BRAND BAR -->
        <!-- ===================================================== -->

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

        <!-- ===================================================== -->
        <!-- BRAND HEADER -->
        <!-- ===================================================== -->

        <tr>
          <td
            align="center"
            style="
              padding:30px 28px 22px;
              background-color:#ffffff;
            "
          >

            <!-- Emblem -->
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
                    width:68px;
                    height:68px;
                    background-color:#edf5ee;
                    border:1px solid #cfe0d1;
                    border-radius:50%;
                    color:#1f5d3a;
                    font-size:28px;
                    font-weight:bold;
                  "
                >
                  AH
                </td>
              </tr>
            </table>

            <div
              style="
                height:16px;
                line-height:16px;
                font-size:16px;
              "
            >
              &nbsp;
            </div>

            <!-- Organization Name -->
            <div
              style="
                font-size:13px;
                line-height:20px;
                font-weight:bold;
                letter-spacing:0.8px;
                text-transform:uppercase;
                color:#1f5d3a;
              "
            >
              ADIVASI HALBA/HALBI SAMAJ
            </div>

            <div
              style="
                font-size:13px;
                line-height:20px;
                font-weight:bold;
                letter-spacing:0.8px;
                text-transform:uppercase;
                color:#1f5d3a;
              "
            >
              KALYAN SAMITI, UJJAIN
            </div>

            <div
              style="
                margin-top:8px;
                font-size:11px;
                color:#8a6b25;
                letter-spacing:1.1px;
                font-weight:bold;
              "
            >
              OFFICIAL COMMUNITY ADMINISTRATION
            </div>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- HERO -->
        <!-- ===================================================== -->

        <tr>
          <td
            class="mobile-padding"
            style="
              padding:38px 42px 34px;
              background-color:#1f5d3a;
              text-align:center;
            "
          >

            <div
              style="
                font-size:11px;
                line-height:18px;
                color:#dbeadd;
                letter-spacing:1.8px;
                font-weight:bold;
                text-transform:uppercase;
                margin-bottom:14px;
              "
            >
              ADMINISTRATIVE INVITATION
            </div>

            <h1
              class="hero-title"
              style="
                margin:0;
                padding:0;
                color:#ffffff;
                font-size:30px;
                line-height:38px;
                font-weight:700;
              "
            >
              Welcome to the<br />
              Samaj Administration
            </h1>

            <p
              class="hero-subtitle"
              style="
                margin:16px 0 0;
                padding:0;
                color:#e5f0e7;
                font-size:15px;
                line-height:25px;
              "
            >
              You have been officially invited to participate
              in the digital administration of our community platform.
            </p>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- INVITATION CONTENT -->
        <!-- ===================================================== -->

        <tr>
          <td
            class="mobile-padding"
            style="
              padding:34px 42px 10px;
              background-color:#ffffff;
            "
          >

            <p
              style="
                margin:0 0 16px;
                font-size:16px;
                line-height:27px;
                color:#35443a;
              "
            >
              Namaskar,
            </p>

            <p
              style="
                margin:0 0 18px;
                font-size:15px;
                line-height:26px;
                color:#536158;
              "
            >
              An administrative account has been created for
              <strong style="color:#1f5d3a;">
                ${safeEmail}
              </strong>
              on the official digital platform of
              <strong style="color:#1f5d3a;">
                Adivasi Halba/Halbi Samaj Kalyan Samiti, Ujjain.
              </strong>
            </p>

            <p
              style="
                margin:0 0 22px;
                font-size:15px;
                line-height:26px;
                color:#536158;
              "
            >
              This invitation gives you access to the administrative
              responsibilities assigned to your account. Please complete
              your account setup using the secure invitation link below.
            </p>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- ROLE CARD -->
        <!-- ===================================================== -->

        <tr>
          <td
            class="mobile-padding"
            style="
              padding:8px 42px 28px;
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
                border:1px solid #dfe8df;
                border-radius:12px;
                background-color:#f7faf7;
              "
            >

              <tr>
                <td
                  style="
                    padding:18px 20px 8px;
                    font-size:11px;
                    line-height:18px;
                    color:#7b887e;
                    font-weight:bold;
                    letter-spacing:1px;
                    text-transform:uppercase;
                  "
                >
                  Assigned Administrative Role(s)
                </td>
              </tr>

              <tr>
                <td
                  style="
                    padding:4px 20px 19px;
                    font-size:16px;
                    line-height:25px;
                    color:#1f5d3a;
                    font-weight:bold;
                  "
                >
                  ${safeRoles}
                </td>
              </tr>

            </table>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- CTA -->
        <!-- ===================================================== -->

        <tr>
          <td
            align="center"
            class="mobile-padding"
            style="
              padding:8px 42px 34px;
              background-color:#ffffff;
            "
          >

            <table
              role="presentation"
              cellpadding="0"
              cellspacing="0"
              border="0"
              class="button"
            >
              <tr>
                <td
                  align="center"
                  style="
                    border-radius:10px;
                    background-color:#b88928;
                    box-shadow:0 5px 14px rgba(184,137,40,0.20);
                  "
                >
                  <a
                    href="${safeUrl}"
                    target="_blank"
                    rel="noopener noreferrer"
                    style="
                      display:inline-block;
                      padding:15px 30px;
                      min-width:190px;
                      font-family:Arial, Helvetica, sans-serif;
                      font-size:15px;
                      line-height:22px;
                      font-weight:bold;
                      color:#ffffff;
                      text-decoration:none;
                      border-radius:10px;
                    "
                  >
                    ACTIVATE ADMIN ACCOUNT
                  </a>
                </td>
              </tr>
            </table>

            <p
              style="
                margin:16px 0 0;
                font-size:12px;
                line-height:20px;
                color:#8a948d;
              "
            >
              Use the button above to securely complete your
              administrative account setup.
            </p>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- SECURITY NOTICE -->
        <!-- ===================================================== -->

        <tr>
          <td
            class="mobile-padding"
            style="
              padding:26px 42px;
              background-color:#f8faf8;
              border-top:1px solid #e4ebe5;
              border-bottom:1px solid #e4ebe5;
            "
          >

            <table
              role="presentation"
              width="100%"
              cellpadding="0"
              cellspacing="0"
              border="0"
            >
              <tr>

                <td
                  valign="top"
                  style="
                    width:34px;
                    font-size:20px;
                    line-height:25px;
                    color:#1f5d3a;
                  "
                >
                  🔐
                </td>

                <td
                  valign="top"
                  style="padding-left:8px;"
                >

                  <div
                    style="
                      margin:0 0 7px;
                      font-size:14px;
                      line-height:20px;
                      font-weight:bold;
                      color:#26352b;
                    "
                  >
                    Security & Account Protection
                  </div>

                  <div
                    style="
                      font-size:13px;
                      line-height:22px;
                      color:#68746b;
                    "
                  >
                    This invitation is intended only for the
                    invited administrator. Do not forward the
                    activation link to another person.
                    If you were not expecting this invitation,
                    please ignore this email and contact the
                    Samaj administration.
                  </div>

                </td>

              </tr>
            </table>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- COMMUNITY MESSAGE -->
        <!-- ===================================================== -->

        <tr>
          <td
            class="mobile-padding"
            style="
              padding:30px 42px 26px;
              background-color:#ffffff;
              text-align:center;
            "
          >

            <div
              style="
                font-size:13px;
                line-height:22px;
                color:#7c6a39;
                font-style:italic;
              "
            >
              “GARV SE KAHO HUM ADIVASI HAI,<br />
              BHARAT KE MUL NIWASI HAI”
            </div>

            <div
              style="
                margin-top:13px;
                font-size:12px;
                line-height:19px;
                color:#89928b;
              "
            >
              Serving the community through transparency,
              participation and digital empowerment.
            </div>

          </td>
        </tr>

        <!-- ===================================================== -->
        <!-- FOOTER -->
        <!-- ===================================================== -->

        <tr>
          <td
            style="
              padding:24px 30px;
              background-color:#173f29;
              text-align:center;
            "
          >

            <div
              style="
                font-size:12px;
                line-height:20px;
                font-weight:bold;
                color:#ffffff;
              "
            >
              ADIVASI HALBA/HALBI SAMAJ KALYAN SAMITI, UJJAIN
            </div>

            <div
              style="
                margin-top:7px;
                font-size:11px;
                line-height:18px;
                color:#c7d8cb;
              "
            >
              Official Community Digital Platform
            </div>

            <div
              style="
                margin-top:14px;
                height:1px;
                background-color:#315a42;
                font-size:0;
                line-height:0;
              "
            >
              &nbsp;
            </div>

            <div
              style="
                margin-top:14px;
                font-size:11px;
                line-height:18px;
                color:#aebfb2;
              "
            >
              Ujjain, Madhya Pradesh
              &nbsp; • &nbsp;
              9926018058
            </div>

            <div
              style="
                margin-top:8px;
                font-size:10px;
                line-height:17px;
                color:#829a88;
              "
            >
              This is an automated administrative communication.
              Please do not reply directly to this email.
            </div>

          </td>
        </tr>

      </table>

      <!-- OUTSIDE FOOTER -->

      <div
        style="
          max-width:600px;
          margin-top:18px;
          font-family:Arial, Helvetica, sans-serif;
          font-size:10px;
          line-height:17px;
          color:#8a958d;
          text-align:center;
        "
      >
        © ${new Date().getFullYear()}
        Adivasi Halba/Halbi Samaj Kalyan Samiti, Ujjain.
        All rights reserved.
      </div>

    </td>
  </tr>
</table>

</body>
</html>
  `;
}

module.exports = adminInviteEmail;