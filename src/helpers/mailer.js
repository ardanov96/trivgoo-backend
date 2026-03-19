const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send forgot password email
 * @param {string} toEmail
 * @param {string} recipientName
 * @param {string} resetToken
 * @param {'user'|'agent'} role
 */
async function send_reset_password_email(toEmail, recipientName, resetToken, role = 'user') {
  const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetLink = `${BASE_URL}/reset-password?token=${resetToken}`;

  const roleLabel = role === 'agent' ? 'Agent' : 'Traveler';
  const brandColor = '#E05845';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:${brandColor};padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                Trivgoo
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                ${roleLabel} Account
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                Hi, ${recipientName} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                We received a request to reset the password for your Trivgoo account. 
                Click the button below to set a new password.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${resetLink}"
                      style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;
                             font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;
                             letter-spacing:0.3px;box-shadow:0 4px 12px rgba(224,88,69,0.35);">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fff7f6;border:1px solid #fde8e4;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#c34134;font-weight:600;">
                      ⏰ This link will expire in <strong>1 hour</strong>.
                    </p>
                    <p style="margin:6px 0 0;font-size:13px;color:#9ca3af;">
                      If you didn't request a password reset, you can safely ignore this email.
                      Your password will remain unchanged.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Manual Link -->
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:12px;color:${brandColor};word-break:break-all;">
                ${resetLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Trivgoo · All rights reserved
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#d1d5db;">
                You're receiving this because a password reset was requested for your account.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Trivgoo" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: '🔐 Reset Your Trivgoo Password',
    html,
  });
}

/**
 * Send account activation email
 * @param {string} toEmail
 * @param {string} recipientName
 * @param {string} activationToken
 * @param {'user'|'agent'} role
 */
async function send_activation_email(toEmail, recipientName, activationToken, role = 'user') {
  const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const activationLink = `${BASE_URL}/verify-email?token=${activationToken}`;

  const roleLabel = role === 'agent' ? 'Agent' : 'Traveler';
  const brandColor = '#E05845'; // Warna Trivgoo

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Activate Your Account</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:${brandColor};padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                Trivgoo
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                Welcome ${roleLabel}!
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                Hi, ${recipientName} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Thank you for signing up with Trivgoo. Please verify your email address to activate your account and access all our features.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${activationLink}"
                      style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;
                             font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;
                             letter-spacing:0.3px;box-shadow:0 4px 12px rgba(224,88,69,0.35);">
                      Activate My Account
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#fff7f6;border:1px solid #fde8e4;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;font-size:13px;color:#c34134;font-weight:600;">
                      ⏰ This link will expire in <strong>20 minutes</strong>.
                    </p>
                    <p style="margin:6px 0 0;font-size:13px;color:#9ca3af;">
                      If you didn't sign up for this account, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Manual Link -->
              <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:12px;color:${brandColor};word-break:break-all;">
                ${activationLink}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Trivgoo · All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Trivgoo" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: '✨ Verify Your Trivgoo Account',
    html,
  });
}

/**
 * Send payment success email
 * @param {string} toEmail
 * @param {string} recipientName
 * @param {string} invoiceNumber
 * @param {string} productName
 * @param {string} amount
 */
async function send_payment_success_email(toEmail, recipientName, invoiceNumber, productName, amount) {
  const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const myBookingsLink = `${BASE_URL}/my-bookings`;
  const brandColor = '#E05845';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Payment Successful</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:#10b981;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                Payment Successful!
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                Booking Confirmed
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                Hi, ${recipientName} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Great news! We have successfully received your payment. Your booking for <strong>${productName}</strong> is now confirmed.
              </p>

              <!-- Transaction Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Invoice Number</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:700;">${invoiceNumber}</p>
                    
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Amount Paid</p>
                    <p style="margin:0;font-size:18px;color:#10b981;font-weight:bold;">Rp ${parseInt(amount).toLocaleString('id-ID')}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${myBookingsLink}"
                      style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;
                             font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;
                             letter-spacing:0.3px;box-shadow:0 4px 12px rgba(224,88,69,0.35);">
                      View My Bookings
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Trivgoo · All rights reserved
              </p>
              <p style="margin:6px 0 0;font-size:12px;color:#d1d5db;">
                Thank you for choosing Trivgoo!
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Trivgoo" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: '✅ Payment Successful - Trivgoo',
    html,
  });
}

/**
 * Send new booking notification email to AGENT
 * @param {string} agentEmail
 * @param {string} agentName
 * @param {object} booking - { external_id, product_name, user_name, total_price, date, quantity }
 */
async function send_new_booking_notification_email(agentEmail, agentName, booking) {
  const BASE_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  const dashboardLink = `${BASE_URL}/agent/bookings`;
  const brandColor = '#E05845';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Booking Received</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background:${brandColor};padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">
                🎉 New Booking!
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:2px;text-transform:uppercase;">
                Payment Confirmed
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                Hi, ${agentName} 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Great news! A customer just paid for one of your products. Here are the details:
              </p>

              <!-- Booking Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:10px;margin-bottom:24px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Invoice Number</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:700;">${booking.external_id}</p>
                    
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Product</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:700;">${booking.product_name}</p>
                    
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Customer</p>
                    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:700;">${booking.user_name} (${booking.quantity || 1} guest${(booking.quantity || 1) > 1 ? 's' : ''})</p>
                    
                    <p style="margin:0 0 10px;font-size:13px;color:#6b7280;">Amount</p>
                    <p style="margin:0;font-size:18px;color:#10b981;font-weight:bold;">Rp ${parseInt(booking.total_price).toLocaleString('id-ID')}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${dashboardLink}"
                      style="display:inline-block;background:${brandColor};color:#ffffff;text-decoration:none;
                             font-size:15px;font-weight:700;padding:14px 40px;border-radius:12px;
                             letter-spacing:0.3px;box-shadow:0 4px 12px rgba(224,88,69,0.35);">
                      View Bookings Dashboard
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} Trivgoo · All rights reserved
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  await transporter.sendMail({
    from: `"Trivgoo" <${process.env.SMTP_USER}>`,
    to: agentEmail,
    subject: `🎉 New Booking: ${booking.product_name} — Rp ${parseInt(booking.total_price).toLocaleString('id-ID')}`,
    html,
  });
}

module.exports = { send_reset_password_email, send_activation_email, send_payment_success_email, send_new_booking_notification_email };