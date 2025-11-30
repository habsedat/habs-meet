import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const GlobalPrivacyPolicyPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Global Privacy Policy" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Global Privacy Policy
        </h1>
        
        <p className="legal-page-last-updated">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">1. Introduction and Global Compliance</h2>
          <p className="legal-paragraph">
            Habs Technologies Group ("we," "our," or "us") is committed to protecting your privacy worldwide. This Global Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Habs Meet video conferencing platform.
          </p>
          <p className="legal-paragraph">
            <span className="legal-strong">Universal Compliance Commitment:</span> Habs Meet complies with all applicable data protection laws worldwide, including but not limited to:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">GDPR</span> (European Union General Data Protection Regulation)</li>
            <li><span className="legal-strong">UK GDPR</span> (United Kingdom General Data Protection Regulation)</li>
            <li><span className="legal-strong">CCPA/CPRA</span> (California Consumer Privacy Act / California Privacy Rights Act)</li>
            <li><span className="legal-strong">Virginia CDPA</span> and other US state privacy laws</li>
            <li><span className="legal-strong">PIPEDA</span> (Canada's Personal Information Protection and Electronic Documents Act)</li>
            <li><span className="legal-strong">LGPD</span> (Brazil's Lei Geral de Proteção de Dados)</li>
            <li><span className="legal-strong">POPIA</span> (South Africa's Protection of Personal Information Act)</li>
            <li><span className="legal-strong">Australia Privacy Act</span> 1988</li>
            <li><span className="legal-strong">New Zealand Privacy Act</span> 2020</li>
            <li><span className="legal-strong">PDPA</span> (Singapore & Malaysia Personal Data Protection Act)</li>
            <li><span className="legal-strong">DIFC & ADGM</span> data protection laws (United Arab Emirates)</li>
            <li><span className="legal-strong">Saudi PDPL</span> (Saudi Arabia Personal Data Protection Law)</li>
            <li><span className="legal-strong">Qatar DPL</span> (Qatar Data Protection Law)</li>
            <li><span className="legal-strong">India DPDP Act</span> (Digital Personal Data Protection Act)</li>
            <li><span className="legal-strong">Japan APPI</span> (Act on the Protection of Personal Information)</li>
            <li><span className="legal-strong">South Korea PIPA</span> (Personal Information Protection Act)</li>
            <li><span className="legal-strong">China PIPL</span> (Personal Information Protection Law)</li>
          </ul>
          <p className="legal-paragraph">
            <span className="legal-strong">Strongest Rights Apply:</span> Where regional requirements differ, we apply the strongest privacy rights and protections available to ensure your data is protected to the highest standard, regardless of your location.
          </p>
          <p className="legal-paragraph">
            <span className="legal-strong">No Data Sales:</span> We do not sell your personal data to third parties. Your privacy is fundamental to our service.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">2. Information We Collect</h2>
          <p className="legal-paragraph">
            We collect information necessary to provide, maintain, and improve the Service. This includes:
          </p>
          
          <h3 className="legal-subsection-title">2.1 Account Information</h3>
          <ul className="legal-list">
            <li>Full name, email address, phone number</li>
            <li>Date of birth (for age verification)</li>
            <li>Profile picture (if uploaded)</li>
            <li>Account preferences and settings</li>
          </ul>

          <h3 className="legal-subsection-title">2.2 Meeting Data</h3>
          <ul className="legal-list">
            <li>Meeting titles, descriptions, and schedules</li>
            <li>Participant lists and attendance records</li>
            <li>Meeting recordings (only if you enable recording)</li>
            <li>Chat messages and communications</li>
          </ul>

          <h3 className="legal-subsection-title">2.3 Technical Data</h3>
          <ul className="legal-list">
            <li>Device information and browser type</li>
            <li>IP address and approximate location</li>
            <li>Connection quality metrics</li>
            <li>Usage patterns and feature interactions</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">3. How We Use Your Information</h2>
          <p className="legal-paragraph">
            We use your information to:
          </p>
          <ul className="legal-list">
            <li>Provide, maintain, and improve the Service</li>
            <li>Process your account registration and authentication</li>
            <li>Enable video meetings and related features</li>
            <li>Manage subscriptions and billing</li>
            <li>Detect and prevent fraud, abuse, and security threats</li>
            <li>Comply with legal obligations</li>
            <li>Send service-related communications</li>
            <li>Analyze usage patterns to improve the Service (using anonymized data)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">4. How We Do NOT Use Your Data</h2>
          <p className="legal-paragraph">
            We are committed to your privacy. We do NOT:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Sell your personal data</span> to third parties for any purpose</li>
            <li>Share your meeting content with unauthorized parties</li>
            <li>Use your data to build advertising profiles without consent</li>
            <li>Access your meeting recordings unless you explicitly enable recording</li>
            <li>Monitor meeting content for advertising or marketing purposes</li>
            <li>Use your data for purposes unrelated to providing the Service</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">5. Data Storage and Security</h2>
          <p className="legal-paragraph">
            <span className="legal-strong">Global Security Standards:</span> Your data is stored and processed securely regardless of country, using:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Encryption:</span> TLS/SSL for data in transit, AES-256 for data at rest</li>
            <li><span className="legal-strong">Secure Infrastructure:</span> Google Cloud Platform and LiveKit Cloud with enterprise-grade security</li>
            <li><span className="legal-strong">Access Controls:</span> Role-based access, authentication, and authorization</li>
            <li><span className="legal-strong">Regular Audits:</span> Security assessments and compliance reviews</li>
          </ul>
          <p className="legal-paragraph">
            Data may be stored in multiple regions to ensure service availability and performance, but all transfers are subject to appropriate safeguards.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">6. Data Sharing and Disclosure</h2>
          <p className="legal-paragraph">
            We share your information only in the following circumstances:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Service Providers:</span> With trusted third parties who assist in operating the Service (e.g., Google Cloud, LiveKit), subject to strict confidentiality obligations</li>
            <li><span className="legal-strong">Legal Requirements:</span> When required by law, court order, or government regulation</li>
            <li><span className="legal-strong">Protection of Rights:</span> To protect our rights, property, or safety, or that of our users</li>
            <li><span className="legal-strong">With Your Consent:</span> When you explicitly authorize sharing</li>
          </ul>
          <p className="legal-paragraph">
            We do not sell, rent, or trade your personal information to third parties for marketing purposes.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">7. Your Global Privacy Rights</h2>
          <p className="legal-paragraph">
            Depending on your location, you may have various privacy rights. We honor the strongest rights available, including:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Right to Access:</span> Request a copy of your personal data</li>
            <li><span className="legal-strong">Right to Rectification:</span> Correct inaccurate or incomplete data</li>
            <li><span className="legal-strong">Right to Erasure:</span> Request deletion of your personal data</li>
            <li><span className="legal-strong">Right to Restrict Processing:</span> Limit how we process your data</li>
            <li><span className="legal-strong">Right to Data Portability:</span> Receive your data in a portable format</li>
            <li><span className="legal-strong">Right to Object:</span> Object to certain processing activities</li>
            <li><span className="legal-strong">Right to Withdraw Consent:</span> Withdraw consent where processing is based on consent</li>
            <li><span className="legal-strong">Right to Complain:</span> Lodge a complaint with your local data protection authority</li>
          </ul>
          <p className="legal-paragraph">
            To exercise these rights, please contact us at <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a>. We will respond within the timeframes required by applicable law (typically 30 days).
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">8. International Data Transfers</h2>
          <p className="legal-paragraph">
            Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Standard Contractual Clauses (SCCs):</span> For transfers from the EU/UK</li>
            <li><span className="legal-strong">Adequacy Decisions:</span> Where applicable authorities have determined adequate protection</li>
            <li><span className="legal-strong">Binding Corporate Rules:</span> Where applicable</li>
            <li><span className="legal-strong">Other Legal Mechanisms:</span> As recognized by applicable laws</li>
          </ul>
          <p className="legal-paragraph">
            All data transfers are subject to the same security and privacy protections regardless of location.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">9. Data Retention</h2>
          <p className="legal-paragraph">
            We retain your personal data only for as long as necessary to:
          </p>
          <ul className="legal-list">
            <li>Provide the Service to you</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes and enforce agreements</li>
          </ul>
          <p className="legal-paragraph">
            When you delete your account, we delete or anonymize your personal data within 30 days, unless legal retention requirements apply.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">10. Children's Privacy</h2>
          <p className="legal-paragraph">
            The Service is not intended for children under 16 years of age. We do not knowingly collect personal information from children under 16. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">11. Changes to This Policy</h2>
          <p className="legal-paragraph">
            We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or via email. Your continued use of the Service after such changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">12. Contact Information</h2>
          <p className="legal-paragraph">
            For questions about this Privacy Policy or to exercise your privacy rights, please contact:
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

export default GlobalPrivacyPolicyPage;


