/**
 * Email Service for PhotoMarket
 * Handles all email sending functionality with Nodemailer
 */

import nodemailer from 'nodemailer';
import { emailTemplates } from './emailTemplates.js';

class EmailService {
  constructor() {
    this.transporter = null;
  }

  /**
   * Initialize email transporter with SMTP config
   */
  initializeTransporter() {
    try {
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || 587),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };

      // Validate SMTP credentials
      if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
        console.error('⚠️ SMTP credentials missing in environment variables');
        return false;
      }

      this.transporter = nodemailer.createTransport(smtpConfig);
      console.log('✅ Email transporter initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize email transporter:', error.message);
      return false;
    }
  }

  /**
   * Verify transporter connection
   */
  async verifyConnection() {
    try {
      if (!this.transporter) {
        this.initializeTransporter();
      }
      await this.transporter.verify();
      console.log('✅ Email service ready to send messages');
      return true;
    } catch (error) {
      console.error('❌ Email service verification failed:', error.message);
      return false;
    }
  }

  /**
   * Generic send email function
   */
  async sendEmail(to, subject, html) {
    try {
      if (!this.transporter) {
        if (!this.initializeTransporter()) {
          throw new Error('Email transporter not initialized');
        }
      }

      const mailOptions = {
        from: process.env.SMTP_USER,
        to,
        subject,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${to}: ${info.response}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email, username, userRole) {
    try {
      const template = emailTemplates.welcomeEmail(username, userRole);
      return await this.sendEmail(email, template.subject, template.html);
    } catch (error) {
      console.error('❌ Welcome email failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send payment receipt to buyer
   */
  async sendPaymentReceipt(email, buyerName, mediaTitle, amount, mediaId, downloadUrl) {
    try {
      const template = emailTemplates.paymentReceiptEmail(buyerName, mediaTitle, amount, mediaId, downloadUrl);
      return await this.sendEmail(email, template.subject, template.html);
    } catch (error) {
      console.error('❌ Payment receipt email failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send sales notification to photographer
   */
  async sendSalesNotification(email, photographerName, mediaTitle, buyerName, amount) {
    try {
      const template = emailTemplates.salesNotificationEmail(photographerName, mediaTitle, buyerName, amount);
      return await this.sendEmail(email, template.subject, template.html);
    } catch (error) {
      console.error('❌ Sales notification email failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send refund confirmation
   */
  async sendRefundEmail(email, buyerName, mediaTitle, amount, reason) {
    try {
      const template = emailTemplates.refundEmail(buyerName, mediaTitle, amount, reason);
      return await this.sendEmail(email, template.subject, template.html);
    } catch (error) {
      console.error('❌ Refund email failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, username, resetLink) {
    try {
      const template = emailTemplates.passwordResetEmail(username, resetLink);
      return await this.sendEmail(email, template.subject, template.html);
    } catch (error) {
      console.error('❌ Password reset email failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send generic notification email
   */
  async sendNotificationEmail(email, subject, html) {
    return await this.sendEmail(email, subject, html);
  }
}

// Export singleton instance
export default new EmailService();
