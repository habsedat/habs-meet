import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const GlobalUserRightsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Global User Rights" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Global User Rights
        </h1>
        
        <p className="legal-page-last-updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="legal-section">
            <h2 className="legal-section-title">Introduction</h2>
            <p className="legal-paragraph">
              At Habs Meet, we recognize and respect your privacy rights regardless of where you are located. This page outlines the universal privacy rights available to all users, as well as region-specific rights that may apply based on your location.
            </p>
            <p className="legal-paragraph">
              <span className="legal-strong">Universal Principle:</span> We apply the strongest privacy rights and protections available to ensure your data is protected to the highest standard, regardless of your location.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">Universal Privacy Rights</h2>
            <p className="legal-paragraph">
              The following rights are available to all Habs Meet users worldwide:
            </p>

            <h3 className="legal-subsection-title">1. Right to Access</h3>
            <p className="legal-paragraph">
              You have the right to access the personal data we hold about you. You can:
            </p>
            <ul className="legal-list">
              <li>View your account information through your account settings</li>
              <li>Request a copy of your personal data in a portable format</li>
              <li>Obtain information about how we process your data</li>
            </ul>
            <p className="legal-paragraph">
              <span className="legal-strong">How to exercise:</span> Access your data through account settings or email <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a>
            </p>

            <h3 className="legal-subsection-title">2. Right to Deletion</h3>
            <p className="legal-paragraph">
              You have the right to request deletion of your personal data. We will delete your data when:
            </p>
            <ul className="legal-list">
              <li>You delete your account</li>
              <li>You request deletion and we have no legal basis to retain it</li>
              <li>The data is no longer necessary for the purposes for which it was collected</li>
            </ul>
            <p className="legal-paragraph">
              <span className="legal-strong">How to exercise:</span> Delete your account in settings or email <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a>
            </p>

            <h3 className="legal-subsection-title">3. Right to Correction</h3>
            <p className="legal-paragraph">
              You have the right to correct inaccurate or incomplete personal data. You can:
            </p>
            <ul className="legal-list">
              <li>Update your account information at any time through account settings</li>
              <li>Request correction of any inaccurate data we hold</li>
            </ul>

            <h3 className="legal-subsection-title">4. Right to Restrict Processing</h3>
            <p className="legal-paragraph">
              You have the right to request that we restrict the processing of your personal data in certain circumstances, such as when you contest the accuracy of the data or object to processing.
            </p>

            <h3 className="legal-subsection-title">5. Right to Object</h3>
            <p className="legal-paragraph">
              You have the right to object to certain processing activities, including processing for direct marketing purposes or processing based on legitimate interests.
            </p>

            <h3 className="legal-subsection-title">6. Right to Data Portability</h3>
            <p className="legal-paragraph">
              You have the right to receive your personal data in a structured, commonly used, and machine-readable format. You can export your data through your account settings.
            </p>

            <h3 className="legal-subsection-title">7. Right to Withdraw Consent</h3>
            <p className="legal-paragraph">
              Where processing is based on consent, you have the right to withdraw consent at any time. Withdrawal of consent does not affect the lawfulness of processing before withdrawal.
            </p>

            <h3 className="legal-subsection-title">8. Right to Complain</h3>
            <p className="legal-paragraph">
              You have the right to lodge a complaint with your local data protection authority if you believe we have violated your privacy rights.
            </p>

            <h3 className="legal-subsection-title">9. Rights Related to Video/Audio Recordings</h3>
            <p className="legal-paragraph">
              Regarding meeting recordings:
            </p>
            <ul className="legal-list">
              <li>You have the right to be informed when a meeting is being recorded</li>
              <li>You have the right to consent or decline participation in recorded meetings</li>
              <li>You have the right to request deletion of recordings in which you appear</li>
              <li>You have the right to access recordings in which you are a participant (subject to host permissions)</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">Region-Specific Rights</h2>
            
            <h3 className="legal-subsection-title">Your Rights Under GDPR (European Union & UK)</h3>
            <p className="legal-paragraph">
              If you are located in the EU or UK, you have all the rights listed above, plus:
            </p>
            <ul className="legal-list">
              <li>Right to be informed about data collection and processing</li>
              <li>Right to erasure ("right to be forgotten")</li>
              <li>Right to data portability in a structured format</li>
              <li>Right to object to automated decision-making and profiling</li>
              <li>Right to lodge a complaint with your local supervisory authority</li>
            </ul>
            <p className="legal-paragraph">
              We must respond to your requests within one month (may be extended by two months for complex requests).
            </p>

            <h3 className="legal-subsection-title">Your Rights Under CCPA/CPRA (California, USA)</h3>
            <p className="legal-paragraph">
              If you are a California resident, you have:
            </p>
            <ul className="legal-list">
              <li>Right to know what personal information is collected, used, shared, or sold</li>
              <li>Right to delete personal information (with certain exceptions)</li>
              <li>Right to opt-out of the sale of personal information (we do not sell your data)</li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
              <li>Right to correct inaccurate personal information</li>
              <li>Right to limit use and disclosure of sensitive personal information</li>
            </ul>

            <h3 className="legal-subsection-title">Your Rights Under LGPD (Brazil)</h3>
            <p className="legal-paragraph">
              If you are located in Brazil, you have:
            </p>
            <ul className="legal-list">
              <li>Right to confirmation of the existence of processing</li>
              <li>Right to access data</li>
              <li>Right to correction of incomplete, inaccurate, or outdated data</li>
              <li>Right to anonymization, blocking, or deletion of unnecessary or excessive data</li>
              <li>Right to data portability</li>
              <li>Right to deletion of personal data processed with consent</li>
              <li>Right to information about public and private entities with which we share data</li>
            </ul>

            <h3 className="legal-subsection-title">Your Rights Under POPIA (South Africa)</h3>
            <p className="legal-paragraph">
              If you are located in South Africa, you have:
            </p>
            <ul className="legal-list">
              <li>Right to be notified that personal information is being collected</li>
              <li>Right to access personal information</li>
              <li>Right to request correction or deletion of personal information</li>
              <li>Right to object to processing</li>
              <li>Right to lodge a complaint with the Information Regulator</li>
            </ul>

            <h3 className="legal-subsection-title">Your Rights Under PIPEDA (Canada)</h3>
            <p className="legal-paragraph">
              If you are located in Canada, you have:
            </p>
            <ul className="legal-list">
              <li>Right to access your personal information</li>
              <li>Right to challenge the accuracy and completeness of your information</li>
              <li>Right to have information amended when appropriate</li>
              <li>Right to file a complaint with the Privacy Commissioner of Canada</li>
            </ul>

            <h3 className="legal-subsection-title">Your Rights Under Other Jurisdictions</h3>
            <p className="legal-paragraph">
              We respect privacy rights in all jurisdictions, including but not limited to:
            </p>
            <ul className="legal-list">
              <li>Australia Privacy Act rights</li>
              <li>New Zealand Privacy Act rights</li>
              <li>Singapore and Malaysia PDPA rights</li>
              <li>UAE DIFC and ADGM data protection rights</li>
              <li>Saudi Arabia PDPL rights</li>
              <li>Qatar DPL rights</li>
              <li>India DPDP Act rights</li>
              <li>Japan APPI rights</li>
              <li>South Korea PIPA rights</li>
              <li>China PIPL rights</li>
            </ul>
            <p className="legal-paragraph">
              Contact us to learn about specific rights in your jurisdiction.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">How to Exercise Your Rights</h2>
            <p className="legal-paragraph">
              To exercise any of your privacy rights:
            </p>
            <ol className="legal-numbered-list">
              <li><span className="legal-strong">Through Your Account:</span> Many rights can be exercised directly through your account settings</li>
              <li><span className="legal-strong">By Email:</span> Send a request to <a href="mailto:privacy@habsmeet.com" className="legal-link">privacy@habsmeet.com</a> with:
                <ul className="legal-list">
                  <li>Your full name and email address</li>
                  <li>The specific right you wish to exercise</li>
                  <li>Any additional information needed to process your request</li>
                </ul>
              </li>
              <li><span className="legal-strong">Response Time:</span> We will respond within 30 days (or as required by applicable law)</li>
              <li><span className="legal-strong">Verification:</span> We may need to verify your identity before processing your request</li>
            </ol>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">Contact Information</h2>
            <p className="legal-paragraph">
              For questions about your privacy rights or to exercise them, please contact:
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

export default GlobalUserRightsPage;


