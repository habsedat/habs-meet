# Email Deliverability Improvement Guide for Habs Meet

## Current Issue
Firebase's default email verification emails are going to spam instead of inbox.

## Solutions to Implement

### 1. Immediate Solutions (Quick Fixes)

#### A. Firebase Console Configuration
1. Go to [Firebase Console](https://console.firebase.google.com/project/habs-meet-dev/authentication/templates)
2. Navigate to Authentication → Templates
3. Click on "Email address verification"
4. Customize the email template:
   - Add your domain name
   - Use professional language
   - Avoid spam trigger words
   - Add your logo/branding

#### B. Custom Domain Setup
1. In Firebase Console → Authentication → Settings
2. Add your custom domain (e.g., `noreply@habsmeet.com`)
3. Configure DNS records (SPF, DKIM, DMARC)

### 2. Advanced Solutions (Recommended)

#### A. Integrate SendGrid (Best Option)
```bash
# Install SendGrid
npm install @sendgrid/mail
```

1. Sign up for SendGrid account
2. Get API key
3. Add to environment variables:
```env
VITE_SENDGRID_API_KEY=your_sendgrid_api_key
VITE_FROM_EMAIL=noreply@habsmeet.com
VITE_FROM_NAME=Habs Meet
```

#### B. Integrate Mailgun
```bash
# Install Mailgun
npm install mailgun-js
```

#### C. Use Firebase Extensions
1. Go to Firebase Console → Extensions
2. Install "Trigger Email" extension
3. Configure with better email templates

### 3. DNS Configuration (Critical)

#### SPF Record
Add to your domain's DNS:
```
TXT record: v=spf1 include:_spf.google.com include:sendgrid.net ~all
```

#### DKIM Record
Configure DKIM for your domain (provided by email service)

#### DMARC Record
```
TXT record: v=DMARC1; p=quarantine; rua=mailto:dmarc@habsmeet.com
```

### 4. Implementation Steps

#### Step 1: Update Environment Variables
Add to `apps/web/.env.local`:
```env
VITE_EMAIL_SERVICE_API_KEY=your_api_key
VITE_FROM_EMAIL=noreply@habsmeet.com
VITE_FROM_NAME=Habs Meet
```

#### Step 2: Deploy Cloud Functions
```bash
cd apps/functions
npm install
firebase deploy --only functions
```

#### Step 3: Test Email Deliverability
1. Send test emails to different providers (Gmail, Outlook, Yahoo)
2. Check spam scores using tools like Mail Tester
3. Monitor delivery rates

### 5. Quick Implementation (SendGrid)

#### A. Sign up for SendGrid
1. Go to https://sendgrid.com
2. Create free account (100 emails/day)
3. Get API key from Settings → API Keys

#### B. Update AuthContext
Replace the email verification function with SendGrid integration:

```typescript
import sgMail from '@sendgrid/mail';

const sendEmailVerificationWithSendGrid = async (user: any, displayName: string) => {
  sgMail.setApiKey(process.env.VITE_SENDGRID_API_KEY);
  
  const msg = {
    to: user.email,
    from: 'noreply@habsmeet.com',
    subject: 'Verify your Habs Meet account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0E3A8A, #6C63FF); color: white; padding: 30px; text-align: center;">
          <h1>Welcome to Habs Meet!</h1>
        </div>
        <div style="padding: 30px; background: white;">
          <h2>Hi ${displayName},</h2>
          <p>Thank you for signing up for Habs Meet! Please verify your email address.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${user.emailVerificationLink}" style="background: #0E3A8A; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px;">Verify Email</a>
          </div>
        </div>
      </div>
    `
  };
  
  await sgMail.send(msg);
};
```

### 6. Monitoring and Testing

#### A. Email Testing Tools
- Mail Tester: https://www.mail-tester.com
- GlockApps: https://glockapps.com
- SendGrid's Email Activity: Monitor delivery rates

#### B. Best Practices
1. Use professional email templates
2. Avoid spam trigger words
3. Include unsubscribe links
4. Monitor bounce rates
5. Keep sender reputation high

### 7. Expected Results

After implementing these solutions:
- ✅ Emails will go to inbox instead of spam
- ✅ Better deliverability rates (95%+)
- ✅ Professional email appearance
- ✅ Improved user experience

## Next Steps

1. **Immediate**: Configure Firebase email templates
2. **Short-term**: Set up SendGrid integration
3. **Long-term**: Configure custom domain with proper DNS records

Would you like me to help you implement any of these solutions?


