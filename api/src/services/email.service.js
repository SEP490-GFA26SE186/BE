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
  // Test tu dong: khong bao gio gui that (email gia @test.storyweaver.local -> bounce, ton quota Brevo).
  if (env.nodeEnv === 'test') return { mocked: true, to, subject };

  // 1. Brevo REST API
  const brevoConfigured = env.brevo.apiKey && !env.brevo.apiKey.includes('your-brevo-api-key');
  if (brevoConfigured) {
    try {
      return await sendViaBrevo({ to, toName, subject, text, html });
    } catch (err) {
      // Da cau hinh Brevo ma gui loi (vd sender chua xac thuc) -> bao loi that, khong gia vo da gui
      if (!smtpTransporter) throw err;
      console.error('Failed to send via Brevo, falling back to SMTP:', err.message);
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
 * Ma xac thuc email: nguoi dung dan ma vao trang xac thuc tren web (POST /auth/verify-email, hieu luc 24 gio).
 * @param {string} to
 * @param {string} token
 * @param {string} [username]
 */
export const sendVerificationEmail = async (to, token, username = 'bạn') => {
  const subject = 'StoryWeaver AI - Mã xác thực email';
  const text = `Xin chào ${username},\n\nMã xác thực email của bạn:\n${token}\n\nDán mã này vào ô "Xác thực email" trên StoryWeaver AI. Mã có hiệu lực trong 24 giờ.\nNếu bạn không đăng ký tài khoản, hãy bỏ qua email này.\n\nĐội ngũ StoryWeaver AI`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4F46E5; text-align: center;">StoryWeaver AI</h2>
      <p>Xin chào <strong>${username}</strong>,</p>
      <p>Cảm ơn bạn đã đăng ký tài khoản <strong>StoryWeaver AI</strong>. Mã xác thực email của bạn:</p>
      <p style="font-family: monospace; font-size: 18px; background: #f4f4f8; padding: 12px; border-radius: 6px; word-break: break-all; text-align: center;">${token}</p>
      <p>Dán mã này vào ô <strong>Xác thực email</strong> trên StoryWeaver AI. Mã có hiệu lực trong 24 giờ.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.</p>
    </div>
  `;

  await sendEmail({ to, toName: username, subject, text, html });
};

/**
 * Ma khoi phuc mat khau: nguoi dung dan ma vao hop thoai "Quen mat khau" tren web (hieu luc 1 gio).
 * @param {string} to
 * @param {string} token
 * @param {string} [username]
 */
export const sendPasswordResetEmail = async (to, token, username = 'bạn') => {
  const subject = 'StoryWeaver AI - Mã khôi phục mật khẩu';
  const text = `Xin chào ${username},\n\nMã khôi phục mật khẩu của bạn:\n${token}\n\nDán mã này vào hộp thoại "Quên mật khẩu" trên StoryWeaver AI. Mã có hiệu lực trong 1 giờ và chỉ dùng được một lần.\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu không thay đổi.\n\nĐội ngũ StoryWeaver AI`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4F46E5; text-align: center;">StoryWeaver AI</h2>
      <p>Xin chào <strong>${username}</strong>,</p>
      <p>Mã khôi phục mật khẩu của bạn:</p>
      <p style="font-family: monospace; font-size: 18px; background: #f4f4f8; padding: 12px; border-radius: 6px; word-break: break-all; text-align: center;">${token}</p>
      <p>Dán mã này vào hộp thoại <strong>Quên mật khẩu</strong> trên StoryWeaver AI. Mã có hiệu lực trong 1 giờ và chỉ dùng được một lần.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #999; text-align: center;">Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu không thay đổi.</p>
    </div>
  `;
  await sendEmail({ to, toName: username, subject, text, html });
};

export default {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
