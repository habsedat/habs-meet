import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const TermsOfServicePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Terms of Service" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Terms of Service
        </h1>
        
        <p className="legal-page-last-updated">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">1. Introduction</h2>
          <p className="legal-paragraph">
            Welcome to Habs Meet ("we," "our," or "us"). These Terms of Service ("Terms") govern your access to and use of the Habs Meet video conferencing platform, including our website, mobile applications, and related services (collectively, the "Service"). By accessing or using the Service, you agree to be bound by these Terms.
          </p>
          <p className="legal-paragraph">
            If you do not agree to these Terms, you may not access or use the Service. These Terms constitute a legally binding agreement between you and Habs Technologies Group.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">2. Eligibility</h2>
          <p className="legal-paragraph">
            You must be at least 16 years old to use the Service. By using the Service, you represent and warrant that:
          </p>
          <ul className="legal-list">
            <li>You are at least 16 years of age</li>
            <li>You have the legal capacity to enter into these Terms</li>
            <li>You will comply with all applicable local, state, national, and international laws and regulations</li>
            <li>You will not use the Service in any way that violates any applicable law or regulation</li>
          </ul>
          <p className="legal-paragraph">
            If you are using the Service on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">3. Accounts and Security</h2>
          <p className="legal-paragraph">
            To access certain features of the Service, you must create an account. You agree to:
          </p>
          <ul className="legal-list">
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain and promptly update your account information</li>
            <li>Maintain the security of your password and account credentials</li>
            <li>Accept responsibility for all activities that occur under your account</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
          </ul>
          <p className="legal-paragraph">
            You are responsible for safeguarding your account credentials. We are not liable for any loss or damage arising from your failure to protect your account information. You may not share your account credentials with any third party or use another user's account without permission.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">4. Use of the Service</h2>
          
          <h3 className="legal-subsection-title">4.1 Permitted Use</h3>
          <p className="legal-paragraph">
            You may use the Service for lawful business and personal purposes, including:
          </p>
          <ul className="legal-list">
            <li>Conducting video meetings and conferences</li>
            <li>Sharing screens and presentations</li>
            <li>Communicating with colleagues, clients, and partners</li>
            <li>Recording meetings (subject to applicable subscription tier)</li>
          </ul>

          <h3 className="legal-subsection-title">4.2 Prohibited Use</h3>
          <p className="legal-paragraph">
            You agree not to use the Service to:
          </p>
          <ul className="legal-list">
            <li>Violate any applicable law, regulation, or third-party right</li>
            <li>Transmit any content that is illegal, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
            <li>Infringe upon intellectual property rights of others</li>
            <li>Distribute malware, viruses, or other harmful code</li>
            <li>Engage in any form of spam, phishing, or fraudulent activity</li>
            <li>Interfere with or disrupt the Service or servers connected to the Service</li>
            <li>Attempt to gain unauthorized access to any portion of the Service</li>
            <li>Use automated systems to access the Service without permission</li>
            <li>Resell, sublicense, or otherwise commercialize the Service without authorization</li>
          </ul>

          <h3 className="legal-subsection-title">4.3 Fair Usage</h3>
          <p className="legal-paragraph">
            Your use of the Service is subject to fair usage policies. Excessive use that degrades service quality for other users may result in temporary or permanent restrictions on your account.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">5. Meeting Rules and Conduct</h2>
          <p className="legal-paragraph">
            As a user of the Service, you agree to:
          </p>
          <ul className="legal-list">
            <li>Conduct yourself in a professional and respectful manner during meetings</li>
            <li>Respect the privacy and confidentiality of other participants</li>
            <li>Obtain consent before recording meetings or sharing meeting content</li>
            <li>Comply with all applicable privacy laws and regulations</li>
            <li>Not share meeting links or access credentials with unauthorized parties</li>
          </ul>
          <p className="legal-paragraph">
            You are solely responsible for the content you share during meetings. We do not monitor or control the content of meetings, but we reserve the right to investigate and take action against violations of these Terms.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">6. Subscriptions and Payments</h2>
          
          <h3 className="legal-subsection-title">6.1 Subscription Plans</h3>
          <p className="legal-paragraph">
            The Service offers various subscription plans, including Free, Pro, Business, and Enterprise tiers. Subscription fees, features, and limitations are detailed on our pricing page and may be updated from time to time.
          </p>

          <h3 className="legal-subsection-title">6.2 Billing and Renewals</h3>
          <p className="legal-paragraph">
            Paid subscriptions are billed in advance on a monthly or annual basis, as selected. Subscriptions automatically renew unless cancelled before the renewal date. You authorize us to charge your payment method for all subscription fees.
          </p>

          <h3 className="legal-subsection-title">6.3 Cancellations and Refunds</h3>
          <p className="legal-paragraph">
            You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing period. Refunds are provided in accordance with applicable law and our refund policy, which may vary by jurisdiction.
          </p>

          <h3 className="legal-subsection-title">6.4 Price Changes</h3>
          <p className="legal-paragraph">
            We reserve the right to modify subscription prices. Price changes will be communicated in advance, and you may cancel your subscription if you do not agree to the new pricing.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">7. Free Tier Limitations</h2>
          <p className="legal-paragraph">
            The Free tier of the Service is subject to limitations, including but not limited to:
          </p>
          <ul className="legal-list">
            <li>Meeting duration limits</li>
            <li>Maximum number of participants per meeting</li>
            <li>Limited recording and storage capabilities</li>
            <li>Restricted access to advanced features</li>
          </ul>
          <p className="legal-paragraph">
            These limitations are subject to change. Current limitations are detailed on our pricing page.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">8. Host Responsibilities</h2>
          <p className="legal-paragraph">
            Meeting hosts are responsible for:
          </p>
          <ul className="legal-list">
            <li>Managing meeting participants and access controls</li>
            <li>Obtaining necessary consent before recording meetings</li>
            <li>Ensuring compliance with applicable privacy laws</li>
            <li>Maintaining the security and confidentiality of meeting content</li>
            <li>Enforcing appropriate conduct standards during meetings</li>
          </ul>
          <p className="legal-paragraph">
            Hosts are responsible for all content shared and activities conducted in meetings they create or manage.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">9. Service Availability</h2>
          <p className="legal-paragraph">
            We strive to provide reliable service availability, but we do not guarantee uninterrupted or error-free operation. The Service may be temporarily unavailable due to:
          </p>
          <ul className="legal-list">
            <li>Scheduled maintenance</li>
            <li>Unscheduled maintenance or repairs</li>
            <li>Technical failures or system overload</li>
            <li>Force majeure events</li>
          </ul>
          <p className="legal-paragraph">
            We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">10. Intellectual Property</h2>
          <p className="legal-paragraph">
            The Service, including its design, features, functionality, and content, is owned by Habs Technologies Group and protected by international copyright, trademark, and other intellectual property laws.
          </p>
          <p className="legal-paragraph">
            You may not:
          </p>
          <ul className="legal-list">
            <li>Copy, modify, or create derivative works of the Service</li>
            <li>Use our trademarks, logos, or brand elements without permission</li>
            <li>Reverse engineer, decompile, or disassemble any portion of the Service</li>
            <li>Remove or alter any copyright, trademark, or proprietary notices</li>
          </ul>
          <p className="legal-paragraph">
            You retain ownership of content you create or upload to the Service, but you grant us a license to use, store, and process such content as necessary to provide the Service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">11. Termination</h2>
          <p className="legal-paragraph">
            We may suspend or terminate your account and access to the Service immediately, without prior notice, if you:
          </p>
          <ul className="legal-list">
            <li>Violate these Terms or any applicable law</li>
            <li>Engage in fraudulent, abusive, or illegal activity</li>
            <li>Fail to pay subscription fees when due</li>
            <li>Use the Service in a manner that harms us or other users</li>
          </ul>
          <p className="legal-paragraph">
            You may terminate your account at any time by contacting us or using account deletion features. Upon termination, your right to use the Service will cease immediately.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">12. Limitation of Liability</h2>
          <p className="legal-paragraph">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, HABS TECHNOLOGIES GROUP AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, RESULTING FROM YOUR USE OR INABILITY TO USE THE SERVICE.
          </p>
          <p className="legal-paragraph">
            OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE USE OF OR ANY INABILITY TO USE THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRIOR TO THE EVENT GIVING RISE TO THE LIABILITY, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
          </p>
          <p className="legal-paragraph">
            Some jurisdictions do not allow the exclusion or limitation of certain damages, so the above limitations may not apply to you.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">13. Governing Law</h2>
          <p className="legal-paragraph">
            These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which Habs Technologies Group operates, without regard to its conflict of law provisions. Any disputes arising from these Terms or the Service shall be subject to the exclusive jurisdiction of the courts in that jurisdiction.
          </p>
          <p className="legal-paragraph">
            If you are located in the European Union, you may have additional rights under applicable EU law. These Terms are designed to comply with international legal standards and may be supplemented by local laws as applicable.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">14. Changes to Terms</h2>
          <p className="legal-paragraph">
            We reserve the right to modify these Terms at any time. Material changes will be communicated through the Service or via email. Your continued use of the Service after such changes constitutes acceptance of the modified Terms.
          </p>
          <p className="legal-paragraph">
            If you do not agree to the modified Terms, you must stop using the Service and may terminate your account.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">15. Contact Information</h2>
          <p className="legal-paragraph">
            If you have questions about these Terms, please contact us at:
          </p>
          <p className="legal-paragraph">
            <span className="legal-strong">Habs Technologies Group</span><br />
            Email: <a href="mailto:legal@habsmeet.com" className="legal-link">legal@habsmeet.com</a><br />
            Website: <a href="https://habs-meet-prod.web.app" className="legal-link" target="_blank" rel="noopener noreferrer">https://habs-meet-prod.web.app</a>
          </p>
        </section>

        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 24px',
              backgroundColor: '#6C63FF',
              color: '#FFFFFF',
              fontWeight: 600,
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5B52E5'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#6C63FF'}
          >
            ← Back
          </button>
        </div>
      </main>
    </div>
  );
};

export default TermsOfServicePage;
