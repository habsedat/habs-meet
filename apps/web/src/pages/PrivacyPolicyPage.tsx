import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const PrivacyPolicyPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Privacy Policy" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Privacy Policy
        </h1>
        
        <p className="legal-page-last-updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {/* Introduction */}
          <section className="legal-section">
            <h2 className="legal-section-title">1. Introduction</h2>
            <p className="legal-paragraph">
              At Habs Technologies Group ("we," "our," or "us"), we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Habs Meet video conferencing platform and related services (the "Service").
            </p>
            <p className="legal-paragraph">
              By using the Service, you agree to the collection and use of information in accordance with this Privacy Policy. This policy is designed to comply with international privacy standards, including the General Data Protection Regulation (GDPR) and other applicable data protection laws.
            </p>
          </section>

          {/* Information We Collect */}
          <section className="legal-section">
            <h2 className="legal-section-title">2. Information We Collect</h2>
            
            <h3 className="legal-subsection-title">2.1 Account Data</h3>
            <p className="legal-paragraph">
              When you create an account, we collect:
            </p>
            <ul className="legal-list">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Date of birth (for age verification)</li>
              <li>Password (stored in encrypted form)</li>
              <li>Profile picture (if uploaded)</li>
            </ul>

            <h3 className="legal-subsection-title">2.2 Meeting Metadata</h3>
            <p className="legal-paragraph">
              We collect information about your meetings, including:
            </p>
            <ul className="legal-list">
              <li>Meeting titles and descriptions</li>
              <li>Meeting schedules and durations</li>
              <li>Participant lists and attendance records</li>
              <li>Meeting settings and preferences</li>
            </ul>

            <h3 className="legal-subsection-title">2.3 Device and Usage Data</h3>
            <p className="legal-paragraph">
              We automatically collect technical information, including:
            </p>
            <ul className="legal-list">
              <li>Device type, operating system, and browser information</li>
              <li>IP address and approximate geographic location</li>
              <li>Connection quality and bandwidth metrics</li>
              <li>Feature usage and interaction patterns</li>
              <li>Error logs and performance data</li>
            </ul>

            <h3 className="legal-subsection-title">2.4 Optional Data</h3>
            <p className="legal-paragraph">
              You may choose to provide additional information, including:
            </p>
            <ul className="legal-list">
              <li>Meeting recordings (if enabled)</li>
              <li>Virtual background images or videos</li>
              <li>Uploaded files and documents</li>
              <li>Chat messages and communications</li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section className="legal-section">
            <h2 className="legal-section-title">3. How We Use Your Information</h2>
            
            <h3 className="legal-subsection-title">3.1 Service Provision</h3>
            <p className="legal-paragraph">
              We use your information to:
            </p>
            <ul className="legal-list">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process your account registration and authentication</li>
              <li>Enable video meetings and related features</li>
              <li>Manage your subscriptions and billing</li>
              <li>Send service-related notifications and updates</li>
            </ul>

            <h3 className="legal-subsection-title">3.2 Security and Safety</h3>
            <p className="legal-paragraph">
              We use your information to:
            </p>
            <ul className="legal-list">
              <li>Detect and prevent fraud, abuse, and security threats</li>
              <li>Enforce our Terms of Service and policies</li>
              <li>Investigate violations and protect user safety</li>
              <li>Comply with legal obligations and law enforcement requests</li>
            </ul>

            <h3 className="legal-subsection-title">3.3 Analytics and Improvement</h3>
            <p className="legal-paragraph">
              We use aggregated, anonymized data to:
            </p>
            <ul className="legal-list">
              <li>Analyze service usage patterns and trends</li>
              <li>Improve service performance and reliability</li>
              <li>Develop new features and functionality</li>
              <li>Conduct research and analytics</li>
            </ul>

            <h3 className="legal-subsection-title">3.4 Communication</h3>
            <p className="legal-paragraph">
              We may use your contact information to:
            </p>
            <ul className="legal-list">
              <li>Send important service updates and announcements</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Provide customer service and technical support</li>
              <li>Send marketing communications (with your consent, where required)</li>
            </ul>
          </section>

          {/* How We Do NOT Use Data */}
          <section className="legal-section">
            <h2 className="legal-section-title">4. How We Do NOT Use Your Data</h2>
            <p className="legal-paragraph">
              We are committed to protecting your privacy. We do NOT:
            </p>
            <ul className="legal-list">
              <li><span className="legal-strong">Sell your personal data</span> to third parties for marketing or advertising purposes</li>
              <li>Share your meeting content with unauthorized parties</li>
              <li>Use your data to build advertising profiles without your consent</li>
              <li>Access your meeting recordings unless you explicitly enable recording</li>
              <li>Monitor the content of your meetings for advertising purposes</li>
            </ul>
            <p className="legal-paragraph">
              Your meeting content and communications are private and are only accessible to authorized meeting participants.
            </p>
          </section>

          {/* How Meetings Work Internally */}
          <section className="legal-section">
            <h2 className="legal-section-title">5. How Meetings Work Internally</h2>
            
            <h3 className="legal-subsection-title">5.1 Secure Token System</h3>
            <p className="legal-paragraph">
              Habs Meet uses a secure token-based authentication system. Meeting access is controlled through HMAC-signed invite tokens that:
            </p>
            <ul className="legal-list">
              <li>Verify participant identity and permissions</li>
              <li>Control meeting access and roles (host, speaker, viewer)</li>
              <li>Expire after use or after a specified time period</li>
              <li>Prevent unauthorized access to meetings</li>
            </ul>

            <h3 className="legal-subsection-title">5.2 Real-Time Processing</h3>
            <p className="legal-paragraph">
              Video and audio streams are processed in real time using LiveKit technology. We do not store video or audio content during meetings unless:
            </p>
            <ul className="legal-list">
              <li>You explicitly enable meeting recording</li>
              <li>Recording is required for legal or compliance purposes</li>
            </ul>

            <h3 className="legal-subsection-title">5.3 No Unauthorized Storage</h3>
            <p className="legal-paragraph">
              Meeting content is not stored on our servers unless you choose to record meetings. Chat messages and shared files are stored only as necessary to provide the Service and are subject to your retention preferences.
            </p>
          </section>

          {/* Recordings & Files */}
          <section className="legal-section">
            <h2 className="legal-section-title">6. Recordings and Files</h2>
            
            <h3 className="legal-subsection-title">6.1 Meeting Recordings</h3>
            <p className="legal-paragraph">
              Meeting recordings are created only when you explicitly enable recording. Recordings are:
            </p>
            <ul className="legal-list">
              <li>Stored securely in encrypted format</li>
              <li>Accessible only to authorized users (typically the meeting host)</li>
              <li>Subject to your subscription tier's storage limits</li>
              <li>Retained according to your account settings</li>
            </ul>

            <h3 className="legal-subsection-title">6.2 Ownership</h3>
            <p className="legal-paragraph">
              You own the content of your meeting recordings. We act as a service provider and do not claim ownership of your recordings or files. You are responsible for:
            </p>
            <ul className="legal-list">
              <li>Obtaining necessary consent from participants before recording</li>
              <li>Complying with applicable laws regarding recording and privacy</li>
              <li>Managing access to and deletion of recordings</li>
            </ul>

            <h3 className="legal-subsection-title">6.3 File Storage</h3>
            <p className="legal-paragraph">
              Files uploaded to the Service are stored securely and are accessible only to authorized users. Storage limits vary by subscription tier.
            </p>
          </section>

          {/* Data Storage & Security */}
          <section className="legal-section">
            <h2 className="legal-section-title">7. Data Storage and Security</h2>
            
            <h3 className="legal-subsection-title">7.1 Encryption</h3>
            <p className="legal-paragraph">
              We use industry-standard encryption to protect your data:
            </p>
            <ul className="legal-list">
              <li><span className="legal-strong">In transit:</span> All data transmitted between your device and our servers is encrypted using TLS/SSL</li>
              <li><span className="legal-strong">At rest:</span> Sensitive data stored on our servers is encrypted using AES-256 encryption</li>
              <li><span className="legal-strong">Video streams:</span> Video and audio streams are encrypted end-to-end during transmission</li>
            </ul>

            <h3 className="legal-subsection-title">7.2 Token Security</h3>
            <p className="legal-paragraph">
              Access tokens are:
            </p>
            <ul className="legal-list">
              <li>Cryptographically signed using HMAC</li>
              <li>Time-limited and expire after use or after a specified period</li>
              <li>Unique to each meeting and participant</li>
              <li>Not reusable after expiration or revocation</li>
            </ul>

            <h3 className="legal-subsection-title">7.3 Cloud Infrastructure</h3>
            <p className="legal-paragraph">
              The Service is hosted on Google Cloud Platform (Firebase) and LiveKit Cloud, which provide:
            </p>
            <ul className="legal-list">
              <li>Enterprise-grade security and compliance certifications</li>
              <li>Redundant data storage and backup systems</li>
              <li>Regular security audits and monitoring</li>
              <li>Compliance with international data protection standards</li>
            </ul>

            <h3 className="legal-subsection-title">7.4 Security Measures</h3>
            <p className="legal-paragraph">
              We implement additional security measures, including:
            </p>
            <ul className="legal-list">
              <li>Regular security assessments and penetration testing</li>
              <li>Access controls and authentication mechanisms</li>
              <li>Monitoring and logging of security events</li>
              <li>Incident response procedures</li>
            </ul>
          </section>

          {/* Your Rights */}
          <section className="legal-section">
            <h2 className="legal-section-title">8. Your Rights</h2>
            <p className="legal-paragraph">
              Depending on your location, you may have the following rights regarding your personal data:
            </p>
            
            <h3 className="legal-subsection-title">8.1 Access</h3>
            <p className="legal-paragraph">
              You have the right to access the personal data we hold about you. You can view and download your account data through your account settings.
            </p>

            <h3 className="legal-subsection-title">8.2 Deletion</h3>
            <p className="legal-paragraph">
              You have the right to request deletion of your personal data. You can delete your account and associated data through your account settings, subject to legal retention requirements.
            </p>

            <h3 className="legal-subsection-title">8.3 Correction</h3>
            <p className="legal-paragraph">
              You have the right to correct inaccurate or incomplete personal data. You can update your account information at any time through your account settings.
            </p>

            <h3 className="legal-subsection-title">8.4 Portability</h3>
            <p className="legal-paragraph">
              You have the right to receive your personal data in a structured, commonly used, and machine-readable format. You can export your data through your account settings.
            </p>

            <h3 className="legal-subsection-title">8.5 Objection and Restriction</h3>
            <p className="legal-paragraph">
              You have the right to object to certain processing of your personal data and to request restriction of processing in certain circumstances.
            </p>

            <h3 className="legal-subsection-title">8.6 Withdrawal of Consent</h3>
            <p className="legal-paragraph">
              Where processing is based on consent, you have the right to withdraw consent at any time. Withdrawal of consent does not affect the lawfulness of processing before withdrawal.
            </p>

            <p className="legal-paragraph">
              To exercise these rights, please contact us at privacy@habsmeet.com. We will respond to your request within 30 days, as required by applicable law.
            </p>
          </section>

          {/* Children's Privacy */}
          <section className="legal-section">
            <h2 className="legal-section-title">9. Children's Privacy</h2>
            <p className="legal-paragraph">
              The Service is not intended for children under 16 years of age. We do not knowingly collect personal information from children under 16. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.
            </p>
            <p className="legal-paragraph">
              If we become aware that we have collected personal information from a child under 16 without parental consent, we will take steps to delete such information promptly.
            </p>
          </section>

          {/* International Data Transfers */}
          <section className="legal-section">
            <h2 className="legal-section-title">10. International Data Transfers</h2>
            <p className="legal-paragraph">
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country.
            </p>
            <p className="legal-paragraph">
              We ensure that appropriate safeguards are in place to protect your data when transferred internationally, including:
            </p>
            <ul className="legal-list">
              <li>Standard contractual clauses approved by relevant data protection authorities</li>
              <li>Compliance with international data protection frameworks</li>
              <li>Implementation of security measures consistent with this Privacy Policy</li>
            </ul>
          </section>

          {/* Changes to Privacy Policy */}
          <section className="legal-section">
            <h2 className="legal-section-title">11. Changes to Privacy Policy</h2>
            <p className="legal-paragraph">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:
            </p>
            <ul className="legal-list">
              <li>Posting the updated Privacy Policy on our website</li>
              <li>Updating the "Last updated" date at the top of this policy</li>
              <li>Sending an email notification for significant changes (where required by law)</li>
            </ul>
            <p className="legal-paragraph">
              Your continued use of the Service after such changes constitutes acceptance of the updated Privacy Policy. We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          {/* Contact Information */}
          <section className="legal-section">
            <h2 className="legal-section-title">12. Contact Information</h2>
            <p className="legal-paragraph">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at:
            </p>
            <p className="legal-paragraph">
              <span className="legal-strong">Habs Technologies Group</span><br />
              Email: <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a><br />
              Website: <a href="https://habs-meet-prod.web.app" className="legal-link" target="_blank" rel="noopener noreferrer">https://habs-meet-prod.web.app</a>
            </p>
            <p className="legal-paragraph">
              If you are located in the European Union and have concerns about our data practices, you also have the right to lodge a complaint with your local data protection authority.
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

export default PrivacyPolicyPage;


