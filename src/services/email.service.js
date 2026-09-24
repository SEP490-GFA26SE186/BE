import nodemailer from 'nodemailer';
import { env } from '../config/index.js';

let smtpTransporter = null;
if (env.email.smtp.host && env.email.smtp.auth.user) {
  smtpTransporter = nodemailer.createTransport(env.email.smtp);
}

/**
 * Send transactional email via Brevo REST API v3
 * @param {Object} options
 * @param {string} options.to
 * @param {string} [options.toName]
 * @param {string} options.subject
 * @param {string} [options.text]
 * @param {string} [options.html]
 */
const sendViaBrevo = async ({ to, toName, subject, text, html }) => {
  const payload = {
    sender: {
      name: env.brevo.senderName,
      email: env.brevo.senderEmail,
    },
    to: [
      {
        email: to,
        name: toName || to,
      },
    ],
    subject,
    htmlContent: html,
    textContent: text,
  };

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': env.brevo.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('❌ Brevo API Error:', response.status, errorData);
    throw new Error(`Brevo API Error: ${errorData.message || response.statusText}`);
  }

  const data = await response.json();
  console.log(`✉️  Brevo email dispatched successfully to ${to} (MessageId: ${data.messageId})`);
  return data;
};

/**
 * Main dispatch function for sending emails
 * Priority: 1. Brevo REST API -> 2. SMTP -> 3. Dev Mock Logger
 */
export const sendEmail = async ({ to, toName, subject, text, html }) => {
  // 1. Brevo REST API
  if (env.brevo.apiKey && !env.brevo.apiKey.includes('your-brevo-api-key')) {
    try {
      return await sendViaBrevo({ to, toName, subject, text, html });
    } catch (err) {
      console.error('Failed to send via Brevo, falling back to mock logger:', err.message);
    }
  }

  // 2. SMTP fallback
  if (smtpTransporter) {
    const msg = {
      from: `"${env.brevo.senderName}" <${env.brevo.senderEmail}>`,
      to,
      subject,
      text,
      html,
    };
    return await smtpTransporter.sendMail(msg);
  }

  // 3. Fallback: Development logger
  console.log('\n=================== [MOCK EMAIL DISPATCH] ===================');
  console.log(`Provider: Brevo (API Key not set - using Mock mode)`);
  console.log(`To:       ${to} ${toName ? `(${toName})` : ''}`);
  console.log(`Subject:  ${subject}`);
  console.log(`Body:\n${text || html}`);
  console.log('=============================================================\n');
};

/**
 * Send email verification link
 * @param {string} to
 * @param {string} token
 * @param {string} [username]
 */
export const sendVerificationEmail = async (to, token, username = 'bạn') => {
  const verificationUrl = `${env.appUrl}/api/v1/auth/verify-email?token=${token}`;
  const subject = 'StoryWeaver AI - Xác thực địa chỉ email';
  const text = `Xin chào ${username},\n\nVui lòng nhấn vào đường link dưới đây để xác thực địa chỉ email của bạn:\n${verificationUrl}\n\nLiên kết này có hiệu lực trong vòng 24 giờ.\n\nTrân trọng,\nĐội ngũ StoryWeaver AI`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4F46E5; text-align: center;">StoryWeaver AI</h2>
      <p>Xin chào <strong>${username}</strong>,</p>
      <p>Cảm ơn bạn đã đăng ký tài khoản trên nền tảng giáo dục cảm xúc và sáng tác truyện tương tác <strong>StoryWeaver AI</strong>.</p>
      <p>Vui lòng nhấn vào nút bên dưới để hoàn tất xác thực địa chỉ email:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Xác thực Email ngay</a>
      </div>
      <p style="font-size: 13px; color: #666;">Nếu nút trên không hoạt động, bạn có thể sao chép và dán liên kết sau vào trình duyệt:</p>
      <p style="font-size: 12px; word-break: break-all; color: #4F46E5;"><a href="${verificationUrl}">${verificationUrl}</a></p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Liên kết này có hiệu lực trong 24 giờ. Nếu bạn không yêu cầu đăng ký này, vui lòng bỏ qua email.</p>
    </div>
  `;

  await sendEmail({ to, toName: username, subject, text, html });
};

export default {
  sendEmail,
  sendVerificationEmail,
};
