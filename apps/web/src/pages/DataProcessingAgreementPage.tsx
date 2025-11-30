import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const DataProcessingAgreementPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Data Processing Agreement" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Data Processing Agreement
        </h1>
        
        <p className="legal-page-last-updated">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">1. Definitions</h2>
          <p className="legal-paragraph">
            This Data Processing Agreement ("DPA") forms part of the Terms of Service and governs the processing of personal data by Habs Technologies Group ("Processor" or "we") on behalf of users ("Controller" or "you") when using the Habs Meet platform.
          </p>
          <p className="legal-paragraph">
            <span className="legal-strong">Definitions:</span>
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">"Personal Data"</span> means any information relating to an identified or identifiable natural person</li>
            <li><span className="legal-strong">"Processing"</span> means any operation performed on personal data, including collection, storage, use, disclosure, and deletion</li>
            <li><span className="legal-strong">"Controller"</span> means the entity that determines the purposes and means of processing personal data</li>
            <li><span className="legal-strong">"Processor"</span> means the entity that processes personal data on behalf of the Controller</li>
            <li><span className="legal-strong">"Sub-processor"</span> means any third party engaged by the Processor to process personal data</li>
            <li><span className="legal-strong">"Data Subject"</span> means the individual to whom personal data relates</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">2. Roles and Responsibilities</h2>
          
          <h3 className="legal-subsection-title">2.1 Data Controller</h3>
          <p className="legal-paragraph">
            As a user of Habs Meet, you act as the Data Controller for personal data you collect, store, or process through meetings you host. This includes:
          </p>
          <ul className="legal-list">
              <li>Participant information you collect</li>
              <li>Meeting recordings you create</li>
              <li>Content shared during your meetings</li>
              <li>Any personal data you upload or share</li>
            </ul>
            <p className="legal-paragraph">
              As Controller, you are responsible for:
            </p>
            <ul className="legal-list">
              <li>Obtaining necessary consent from data subjects</li>
              <li>Ensuring lawful basis for processing</li>
              <li>Complying with applicable data protection laws</li>
              <li>Responding to data subject rights requests</li>
            </ul>

            <h3 className="legal-subsection-title">2.2 Data Processor</h3>
            <p className="legal-paragraph">
              Habs Technologies Group acts as a Data Processor when processing personal data on your behalf to provide the Service. We process personal data only:
            </p>
            <ul className="legal-list">
              <li>In accordance with your instructions</li>
              <li>As necessary to provide the Service</li>
              <li>In compliance with this DPA and applicable laws</li>
              <li>For the purposes specified in our Privacy Policy</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">3. Scope of Processing</h2>
            <p className="legal-paragraph">
              We process the following categories of personal data on your behalf:
            </p>
            <ul className="legal-list">
              <li>Account information (name, email, phone number)</li>
              <li>Meeting metadata (titles, schedules, participant lists)</li>
              <li>Meeting recordings (if enabled by you)</li>
              <li>Chat messages and communications</li>
              <li>Uploaded files and documents</li>
              <li>Device and usage information</li>
            </ul>
            <p className="legal-paragraph">
              Processing activities include: storage, transmission, encryption, backup, and deletion of personal data as necessary to provide the Service.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">4. Sub-Processing</h2>
            <p className="legal-paragraph">
              We engage Sub-processors to provide the Service. Our Sub-processors include:
            </p>
            
            <h3 className="legal-subsection-title">4.1 Google Cloud Platform (Firebase)</h3>
            <p className="legal-paragraph">
              We use Google Cloud Platform and Firebase for:
            </p>
            <ul className="legal-list">
              <li>Data storage and hosting</li>
              <li>Authentication services</li>
              <li>Database management</li>
              <li>Cloud functions and APIs</li>
            </ul>
            <p className="legal-paragraph">
              Google Cloud Platform is certified under various international standards including ISO 27001, SOC 2, and GDPR compliance.
            </p>

            <h3 className="legal-subsection-title">4.2 LiveKit Cloud</h3>
            <p className="legal-paragraph">
              We use LiveKit Cloud for:
            </p>
            <ul className="legal-list">
              <li>Real-time video and audio processing</li>
              <li>Meeting infrastructure</li>
              <li>Recording services (when enabled)</li>
            </ul>
            <p className="legal-paragraph">
              LiveKit processes video and audio streams in real-time and does not store content unless recording is explicitly enabled.
            </p>

            <h3 className="legal-subsection-title">4.3 Sub-Processor Obligations</h3>
            <p className="legal-paragraph">
              All Sub-processors are contractually bound to:
            </p>
            <ul className="legal-list">
              <li>Process personal data only as instructed by us</li>
              <li>Implement appropriate security measures</li>
              <li>Comply with applicable data protection laws</li>
              <li>Notify us of any data breaches</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">5. Technical and Organizational Measures (TOMs)</h2>
            <p className="legal-paragraph">
              We implement comprehensive technical and organizational measures to ensure the security of personal data:
            </p>
            
            <h3 className="legal-subsection-title">5.1 Technical Measures</h3>
            <ul className="legal-list">
              <li><span className="legal-strong">Encryption:</span> TLS/SSL for data in transit, AES-256 for data at rest</li>
              <li><span className="legal-strong">Access Controls:</span> Role-based access, multi-factor authentication</li>
              <li><span className="legal-strong">Network Security:</span> Firewalls, intrusion detection, DDoS protection</li>
              <li><span className="legal-strong">Data Backup:</span> Regular automated backups with encryption</li>
              <li><span className="legal-strong">Monitoring:</span> 24/7 security monitoring and logging</li>
              <li><span className="legal-strong">Token Security:</span> HMAC-signed tokens for meeting access</li>
            </ul>

            <h3 className="legal-subsection-title">5.2 Organizational Measures</h3>
            <ul className="legal-list">
              <li><span className="legal-strong">Staff Training:</span> Regular data protection and security training</li>
              <li><span className="legal-strong">Access Management:</span> Principle of least privilege, regular access reviews</li>
              <li><span className="legal-strong">Incident Response:</span> Documented procedures for security incidents</li>
              <li><span className="legal-strong">Data Protection Officer:</span> Designated privacy contact</li>
              <li><span className="legal-strong">Regular Audits:</span> Security assessments and compliance reviews</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">6. Data Breach Notification</h2>
            <p className="legal-paragraph">
              In the event of a personal data breach, we will:
            </p>
            
            <h3 className="legal-subsection-title">6.1 Global Breach Notification Rules</h3>
            <ul className="legal-list">
              <li><span className="legal-strong">GDPR (EU/UK):</span> Notify relevant supervisory authority within 72 hours of becoming aware of the breach</li>
              <li><span className="legal-strong">US State Laws:</span> Comply with state-specific notification requirements (typically 30-60 days)</li>
              <li><span className="legal-strong">Canada (PIPEDA):</span> Notify affected individuals and authorities as required</li>
              <li><span className="legal-strong">Other Jurisdictions:</span> Comply with applicable local breach notification requirements</li>
            </ul>

            <h3 className="legal-subsection-title">6.2 Controller Notification</h3>
            <p className="legal-paragraph">
              We will notify you without undue delay after becoming aware of a personal data breach affecting your data. The notification will include:
            </p>
            <ul className="legal-list">
              <li>Description of the nature of the breach</li>
              <li>Categories and approximate number of data subjects affected</li>
              <li>Likely consequences of the breach</li>
              <li>Measures taken or proposed to address the breach</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">7. International Data Transfers</h2>
            <p className="legal-paragraph">
              Personal data may be transferred to and processed in countries outside your country of residence. We ensure appropriate safeguards are in place:
            </p>
            
            <h3 className="legal-subsection-title">7.1 Standard Contractual Clauses (SCCs)</h3>
            <p className="legal-paragraph">
              For transfers from the EU/UK, we use European Commission-approved Standard Contractual Clauses with our Sub-processors to ensure adequate protection of personal data.
            </p>

            <h3 className="legal-subsection-title">7.2 Other Transfer Mechanisms</h3>
            <p className="legal-paragraph">
              We also rely on:
            </p>
            <ul className="legal-list">
              <li>Adequacy decisions by relevant authorities</li>
              <li>Binding corporate rules where applicable</li>
              <li>Certification schemes and codes of conduct</li>
              <li>Other legally recognized transfer mechanisms</li>
            </ul>

            <h3 className="legal-subsection-title">7.3 Data Residency</h3>
            <p className="legal-paragraph">
              While we strive to process data in regions close to users, data may be stored and processed globally to ensure service availability and performance. All data transfers are subject to appropriate safeguards regardless of location.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">8. Data Subject Rights</h2>
            <p className="legal-paragraph">
              We assist you in responding to data subject rights requests, including:
            </p>
            <ul className="legal-list">
              <li>Right to access</li>
              <li>Right to rectification</li>
              <li>Right to erasure</li>
              <li>Right to restrict processing</li>
              <li>Right to data portability</li>
              <li>Right to object</li>
            </ul>
            <p className="legal-paragraph">
              We will respond to your instructions regarding data subject rights requests within the timeframes required by applicable law.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">9. Data Retention and Deletion</h2>
            <p className="legal-paragraph">
              We retain personal data only for as long as necessary to provide the Service or as required by law. Upon termination of your account or upon your request, we will:
            </p>
            <ul className="legal-list">
              <li>Delete or return all personal data to you</li>
              <li>Delete existing copies unless storage is required by law</li>
              <li>Ensure Sub-processors also delete the data</li>
            </ul>
            <p className="legal-paragraph">
              Deletion will occur within 30 days of your request, unless legal retention requirements apply.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">10. Audit Rights</h2>
            <p className="legal-paragraph">
              You have the right to audit our compliance with this DPA. We will:
            </p>
            <ul className="legal-list">
              <li>Provide information necessary to demonstrate compliance</li>
              <li>Allow audits by you or your authorized representatives</li>
              <li>Cooperate with supervisory authority audits</li>
            </ul>
            <p className="legal-paragraph">
              Audits must be conducted during business hours with reasonable advance notice and must not interfere with our operations.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">11. Liability and Indemnification</h2>
            <p className="legal-paragraph">
              Each party is liable for its own violations of data protection laws. We are liable only for damages caused by our breach of this DPA or our obligations as a Processor. Our liability is subject to the limitations set forth in our Terms of Service.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">12. Governing Law</h2>
            <p className="legal-paragraph">
              This DPA is governed by the laws applicable to data protection in your jurisdiction. In case of conflict between this DPA and mandatory data protection laws, the mandatory laws shall prevail.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">13. Contact Information</h2>
            <p className="legal-paragraph">
              For questions about this DPA or data processing activities, please contact:
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

export default DataProcessingAgreementPage;
