/**
 * Email Templates for PhotoMarket
 * Returns HTML templates for different email types
 */

export const emailTemplates = {
  /**
   * Welcome email for new users
   */
  welcomeEmail: (username, userRole) => ({
    subject: `Welcome to PhotoMarket, ${username}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Welcome to PhotoMarket</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${username}</strong>,</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            Welcome to PhotoMarket! We're thrilled to have you join our community of amazing photographers and photo enthusiasts.
          </p>
          
          ${userRole === 'photographer' ? `
            <div style="background: #e8f4f8; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #667eea;">As a Photographer</h3>
              <ul style="color: #555; font-size: 13px; line-height: 1.8;">
                <li>Upload your best photos and videos</li>
                <li>Set your own prices</li>
                <li>Track earnings and downloads</li>
                <li>Manage your media gallery</li>
              </ul>
            </div>
          ` : `
            <div style="background: #e8f4f8; padding: 15px; border-left: 4px solid #667eea; margin: 15px 0; border-radius: 4px;">
              <h3 style="margin-top: 0; color: #667eea;">As a Buyer</h3>
              <ul style="color: #555; font-size: 13px; line-height: 1.8;">
                <li>Browse high-quality photos and videos</li>
                <li>Download and use media instantly</li>
                <li>Support talented photographers</li>
                <li>Build your library</li>
              </ul>
            </div>
          `}
          
          <p style="font-size: 14px; color: #555; margin-top: 20px;">
            If you have any questions or need help, feel free to contact our support team.
          </p>
          <p style="font-size: 14px; color: #555;">
            Happy creating,<br/>
            <strong>The PhotoMarket Team</strong>
          </p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #999;">
          <p>© 2026 PhotoMarket. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  /**
   * Payment receipt email for buyers
   */
  paymentReceiptEmail: (buyerName, mediaTitle, amount, mediaId, downloadUrl) => ({
    subject: `Payment Confirmation - ${mediaTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2ecc71; padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">✓ Payment Successful</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${buyerName}</strong>,</p>
          <p style="font-size: 14px; color: #555;">Your payment has been successfully processed!</p>
          
          <div style="background: white; padding: 15px; border: 1px solid #e0e0e0; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #667eea; font-size: 14px;">Order Details</h3>
            <table style="width: 100%; font-size: 13px; color: #555;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Media:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${mediaTitle}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Amount:</strong></td>
                <td style="padding: 8px 0; text-align: right;">KES ${amount}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Date:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 20px 0;">
            <a href="${downloadUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Download Now</a>
          </div>

          <p style="font-size: 13px; color: #999; text-align: center;">
            The download link will remain active for 7 days. You can also access your downloads from your account dashboard.
          </p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #999;">
          <p>© 2026 PhotoMarket. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  /**
   * Sales notification email for photographers
   */
  salesNotificationEmail: (photographerName, mediaTitle, buyerName, amount) => ({
    subject: `🎉 New Sale: ${mediaTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">🎉 You Made a Sale!</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${photographerName}</strong>,</p>
          <p style="font-size: 14px; color: #555;">Great news! Someone just purchased your media.</p>
          
          <div style="background: white; padding: 15px; border: 1px solid #e0e0e0; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #f5576c; font-size: 14px;">Sale Details</h3>
            <table style="width: 100%; font-size: 13px; color: #555;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Media:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${mediaTitle}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Buyer:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${buyerName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Earnings:</strong></td>
                <td style="padding: 8px 0; text-align: right;"><strong style="color: #2ecc71;">KES ${amount}</strong></td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Date:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #555; line-height: 1.6;">
            Your earnings will be transferred to your account soon. Track all your sales and earnings from your dashboard.
          </p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #999;">
          <p>© 2026 PhotoMarket. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  /**
   * Refund confirmation email
   */
  refundEmail: (buyerName, mediaTitle, amount, reason) => ({
    subject: `Refund Processed - ${mediaTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #3498db; padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Refund Processed</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${buyerName}</strong>,</p>
          <p style="font-size: 14px; color: #555;">Your refund has been successfully processed.</p>
          
          <div style="background: white; padding: 15px; border: 1px solid #e0e0e0; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #3498db; font-size: 14px;">Refund Details</h3>
            <table style="width: 100%; font-size: 13px; color: #555;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Media:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${mediaTitle}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Amount Refunded:</strong></td>
                <td style="padding: 8px 0; text-align: right;"><strong style="color: #2ecc71;">KES ${amount}</strong></td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;"><strong>Reason:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${reason}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;"><strong>Date:</strong></td>
                <td style="padding: 8px 0; text-align: right;">${new Date().toLocaleDateString()}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 13px; color: #555; line-height: 1.6;">
            The refund will appear in your account within 3-5 business days. If you have any questions, please contact our support team.
          </p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #999;">
          <p>© 2026 PhotoMarket. All rights reserved.</p>
        </div>
      </div>
    `
  }),

  /**
   * Password reset email
   */
  passwordResetEmail: (username, resetLink) => ({
    subject: 'Reset Your PhotoMarket Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #667eea; padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Password Reset Request</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">Hi <strong>${username}</strong>,</p>
          <p style="font-size: 14px; color: #555;">We received a request to reset your password. Click the button below to set a new password.</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
          </div>

          <p style="font-size: 13px; color: #999;">
            This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
          </p>
          <p style="font-size: 13px; color: #999;">
            Or copy and paste this link in your browser:<br/>
            <code style="background: #eee; padding: 5px 10px; border-radius: 3px; display: inline-block; margin-top: 5px; word-break: break-all;">${resetLink}</code>
          </p>
        </div>
        <div style="text-align: center; padding: 15px; font-size: 12px; color: #999;">
          <p>© 2026 PhotoMarket. All rights reserved.</p>
        </div>
      </div>
    `
  })
};
