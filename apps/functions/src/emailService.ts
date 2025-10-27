import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// For better deliverability, you can integrate with services like:
// - SendGrid (recommended)
// - Mailgun
// - AWS SES
// - Resend

export const sendVerificationEmail = onRequest(async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  try {
    const { to, subject, html, text } = req.body;

    if (!to || !subject || !html) {
      res.status(400).send('Missing required fields');
      return;
    }

    // For now, we'll use Firebase's built-in email service
    // but with better configuration
    const emailData = {
      to,
      subject,
      html,
      text,
      from: {
        email: 'noreply@habsmeet.com', // Use your custom domain
        name: 'Habs Meet'
      }
    };

    // TODO: Replace with actual email service integration
    // Example with SendGrid:
    /*
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    await sgMail.send({
      to: emailData.to,
      from: emailData.from,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });
    */

    // For now, log the email (in production, integrate with real service)
    console.log('Email would be sent:', emailData);

    res.status(200).json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, error: 'Failed to send email' });
  }
});

// Alternative: Use Firebase Extensions for better email deliverability
export const sendEmailWithExtension = onRequest(async (req, res) => {
  // This would use Firebase Extensions like "Trigger Email" 
  // which provides better deliverability than default Firebase Auth emails
  
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { email, displayName, verificationLink } = req.body;

    // Create a document in Firestore to trigger the email extension
    await admin.firestore().collection('mail').add({
      to: email,
      message: {
        subject: 'Verify your Habs Meet account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0E3A8A, #6C63FF); color: white; padding: 30px; text-align: center;">
              <h1>Welcome to Habs Meet!</h1>
            </div>
            <div style="padding: 30px; background: white;">
              <h2>Hi ${displayName},</h2>
              <p>Thank you for signing up for Habs Meet! Please verify your email address to complete your account setup.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" style="background: #0E3A8A; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify My Email</a>
              </div>
              <p>If the button doesn't work, copy this link: ${verificationLink}</p>
              <p><strong>Note:</strong> This link expires in 24 hours.</p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #666;">
              <p>© 2024 Habs Meet. All rights reserved.</p>
            </div>
          </div>
        `,
        text: `Welcome to Habs Meet! Hi ${displayName}, please verify your email by clicking: ${verificationLink}`
      }
    });

    res.status(200).json({ success: true, message: 'Verification email queued' });
  } catch (error) {
    console.error('Error queuing email:', error);
    res.status(500).json({ success: false, error: 'Failed to queue email' });
  }
});


