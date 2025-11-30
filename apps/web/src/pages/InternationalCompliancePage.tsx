import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const InternationalCompliancePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="International Compliance" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          International Compliance Statement
        </h1>
        
        <p className="legal-page-last-updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="legal-section">
            <h2 className="legal-section-title">1. Our Global Compliance Commitment</h2>
            <p className="legal-paragraph">
              Habs Technologies Group is committed to operating in compliance with data protection and privacy laws worldwide. We recognize that different jurisdictions have varying legal requirements, and we have designed our platform to meet the highest standards of privacy protection globally.
            </p>
            <p className="legal-paragraph">
              Our compliance approach ensures that regardless of where you are located, your data is protected to the highest applicable standard, and you have access to the strongest privacy rights available.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">2. How We Adapt to Different Legal Requirements</h2>
            <p className="legal-paragraph">
              We implement a universal privacy framework that:
            </p>
            <ul className="legal-list">
              <li><span className="legal-strong">Applies the Strongest Rights:</span> Where regional requirements differ, we apply the strongest privacy rights and protections to all users</li>
              <li><span className="legal-strong">Universal Security Standards:</span> All data is protected with the same high-level security measures regardless of location</li>
              <li><span className="legal-strong">Transparent Processing:</span> We clearly communicate how data is processed and provide users with control over their data</li>
              <li><span className="legal-strong">Consent-Based Approach:</span> We obtain appropriate consent where required by law</li>
              <li><span className="legal-strong">Regular Compliance Reviews:</span> We regularly review and update our practices to ensure ongoing compliance</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">3. Universal Privacy Principles</h2>
            <p className="legal-paragraph">
              The following principles apply to all users worldwide:
            </p>
            
            <h3 className="legal-subsection-title">3.1 Lawfulness, Fairness, and Transparency</h3>
            <p className="legal-paragraph">
              We process personal data lawfully, fairly, and transparently. We clearly communicate what data we collect, why we collect it, and how we use it.
            </p>

            <h3 className="legal-subsection-title">3.2 Purpose Limitation</h3>
            <p className="legal-paragraph">
              We collect personal data only for specified, explicit, and legitimate purposes. We do not use data for purposes incompatible with those originally specified.
            </p>

            <h3 className="legal-subsection-title">3.3 Data Minimization</h3>
            <p className="legal-paragraph">
              We collect only the personal data that is adequate, relevant, and necessary for the purposes for which it is processed.
            </p>

            <h3 className="legal-subsection-title">3.4 Accuracy</h3>
            <p className="legal-paragraph">
              We take reasonable steps to ensure personal data is accurate and kept up to date. You can update your information at any time through your account settings.
            </p>

            <h3 className="legal-subsection-title">3.5 Storage Limitation</h3>
            <p className="legal-paragraph">
              We retain personal data only for as long as necessary to fulfill the purposes for which it was collected or as required by law.
            </p>

            <h3 className="legal-subsection-title">3.6 Integrity and Confidentiality</h3>
            <p className="legal-paragraph">
              We implement appropriate technical and organizational measures to protect personal data against unauthorized access, alteration, disclosure, or destruction.
            </p>

            <h3 className="legal-subsection-title">3.7 Accountability</h3>
            <p className="legal-paragraph">
              We are responsible for and can demonstrate compliance with privacy principles. We maintain documentation of our processing activities and implement privacy by design and default.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">4. Standard Contractual Clauses (SCCs)</h2>
            <p className="legal-paragraph">
              For international data transfers, particularly from the European Union and United Kingdom, we use European Commission-approved Standard Contractual Clauses (SCCs) with our service providers. SCCs are:
            </p>
            <ul className="legal-list">
              <li>Legally binding contracts that ensure adequate protection of personal data</li>
              <li>Recognized by data protection authorities as providing appropriate safeguards</li>
              <li>Designed to protect data regardless of where it is processed</li>
              <li>Regularly updated to reflect current legal requirements</li>
            </ul>
            <p className="legal-paragraph">
              Our use of SCCs ensures that your data receives the same level of protection when transferred internationally as it does in your home jurisdiction.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">5. Cross-Border Data Flow Compliance</h2>
            <p className="legal-paragraph">
              Personal data may be transferred across borders to ensure service availability and performance. All cross-border transfers are subject to appropriate safeguards:
            </p>
            <ul className="legal-list">
              <li><span className="legal-strong">Standard Contractual Clauses:</span> For transfers from the EU/UK</li>
              <li><span className="legal-strong">Adequacy Decisions:</span> Where applicable authorities have determined adequate protection</li>
              <li><span className="legal-strong">Binding Corporate Rules:</span> Where applicable</li>
              <li><span className="legal-strong">Other Legal Mechanisms:</span> As recognized by applicable laws in your jurisdiction</li>
            </ul>
            <p className="legal-paragraph">
              Regardless of where data is processed, it receives the same security and privacy protections.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">6. Security Architecture Summary</h2>
            <p className="legal-paragraph">
              Our security architecture is designed to meet international standards:
            </p>
            
            <h3 className="legal-subsection-title">6.1 Encryption</h3>
            <ul className="legal-list">
              <li><span className="legal-strong">In Transit:</span> TLS/SSL encryption for all data transmission</li>
              <li><span className="legal-strong">At Rest:</span> AES-256 encryption for stored data</li>
              <li><span className="legal-strong">Video Streams:</span> End-to-end encryption during transmission</li>
            </ul>

            <h3 className="legal-subsection-title">6.2 Access Controls</h3>
            <ul className="legal-list">
              <li>Role-based access controls</li>
              <li>Multi-factor authentication</li>
              <li>Principle of least privilege</li>
              <li>Regular access reviews</li>
            </ul>

            <h3 className="legal-subsection-title">6.3 Infrastructure</h3>
            <ul className="legal-list">
              <li>Enterprise-grade cloud infrastructure (Google Cloud Platform, LiveKit Cloud)</li>
              <li>Regular security audits and assessments</li>
              <li>24/7 monitoring and incident response</li>
              <li>Compliance certifications (ISO 27001, SOC 2, etc.)</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">7. Transparency Commitments</h2>
            <p className="legal-paragraph">
              We are committed to transparency in our data practices:
            </p>
            <ul className="legal-list">
              <li><span className="legal-strong">Clear Privacy Policies:</span> We provide comprehensive privacy policies that explain our data practices</li>
              <li><span className="legal-strong">User Control:</span> You have control over your data through account settings</li>
              <li><span className="legal-strong">Regular Updates:</span> We notify you of material changes to our privacy practices</li>
              <li><span className="legal-strong">Open Communication:</span> We respond to privacy inquiries and requests promptly</li>
              <li><span className="legal-strong">Documentation:</span> We maintain documentation of our processing activities</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">8. Compliance with Specific Jurisdictions</h2>
            <p className="legal-paragraph">
              We comply with data protection laws in all jurisdictions where we operate, including:
            </p>
            <ul className="legal-list">
              <li>European Union (GDPR)</li>
              <li>United Kingdom (UK GDPR)</li>
              <li>United States (CCPA/CPRA and state laws)</li>
              <li>Canada (PIPEDA)</li>
              <li>Brazil (LGPD)</li>
              <li>South Africa (POPIA)</li>
              <li>Australia and New Zealand</li>
              <li>Singapore and Malaysia (PDPA)</li>
              <li>UAE (DIFC & ADGM)</li>
              <li>Saudi Arabia (PDPL)</li>
              <li>Qatar (DPL)</li>
              <li>India (DPDP Act)</li>
              <li>Japan (APPI)</li>
              <li>South Korea (PIPA)</li>
              <li>China (PIPL)</li>
              <li>And other applicable jurisdictions</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">9. Ongoing Compliance</h2>
            <p className="legal-paragraph">
              We maintain ongoing compliance through:
            </p>
            <ul className="legal-list">
              <li>Regular legal and compliance reviews</li>
              <li>Staff training on data protection</li>
              <li>Security assessments and audits</li>
              <li>Monitoring of regulatory developments</li>
              <li>Updating policies and procedures as needed</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">10. Contact Information</h2>
            <p className="legal-paragraph">
              For questions about our international compliance practices, please contact:
            </p>
            <p className="legal-paragraph">
              <span className="legal-strong">Habs Technologies Group</span><br />
              Email: <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a><br />
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

export default InternationalCompliancePage;


