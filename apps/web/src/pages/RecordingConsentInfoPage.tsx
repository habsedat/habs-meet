import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const RecordingConsentInfoPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Recording Consent Information" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Meeting Recording Consent Information
        </h1>
        
        <p className="legal-page-last-updated">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="legal-section">
            <h2 className="legal-section-title">1. Overview</h2>
            <p className="legal-paragraph">
              This page explains how meeting recordings work on Habs Meet, your rights regarding recordings, and the legal requirements for recording consent worldwide.
            </p>
            <p className="legal-paragraph">
              <span className="legal-strong">Important:</span> When a meeting is being recorded, all participants are notified and must consent to continue. By continuing in a recorded meeting, you consent to the recording of video, audio, and screen content according to our Global Privacy Policy.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">2. How Recording Works</h2>
            
            <h3 className="legal-subsection-title">2.1 Recording Notification</h3>
            <p className="legal-paragraph">
              When recording is enabled in a meeting:
            </p>
            <ul className="legal-list">
              <li>All participants receive a clear notification that recording is active</li>
              <li>A visual indicator (red recording icon) is displayed throughout the meeting</li>
              <li>Participants are informed before joining if recording is already active</li>
              <li>You can choose to continue or leave the meeting</li>
            </ul>

            <h3 className="legal-subsection-title">2.2 What Gets Recorded</h3>
            <p className="legal-paragraph">
              When recording is enabled, the following may be captured:
            </p>
            <ul className="legal-list">
              <li>Video feeds from all participants (if cameras are enabled)</li>
              <li>Audio from all participants (if microphones are enabled)</li>
              <li>Screen sharing content (if shared during the meeting)</li>
              <li>Chat messages (if chat is enabled)</li>
              <li>Participant names and display information</li>
            </ul>

            <h3 className="legal-subsection-title">2.3 Recording Storage</h3>
            <p className="legal-paragraph">
              Recordings are:
            </p>
            <ul className="legal-list">
              <li>Stored securely in encrypted format</li>
              <li>Accessible only to authorized users (typically the meeting host)</li>
              <li>Subject to your subscription tier's storage limits</li>
              <li>Retained according to your account settings and applicable laws</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">3. Your Rights Regarding Recordings</h2>
            
            <h3 className="legal-subsection-title">3.1 Right to Consent or Decline</h3>
            <p className="legal-paragraph">
              You have the right to:
            </p>
            <ul className="legal-list">
              <li>Be informed when a meeting is being recorded</li>
              <li>Choose to continue or leave a recorded meeting</li>
              <li>Request that a meeting not be recorded (subject to host's decision)</li>
              <li>Turn off your camera or microphone if you do not wish to be recorded</li>
            </ul>

            <h3 className="legal-subsection-title">3.2 Right to Access</h3>
            <p className="legal-paragraph">
              If you are a participant in a recorded meeting, you may have the right to:
            </p>
            <ul className="legal-list">
              <li>Access recordings in which you appear (subject to host permissions)</li>
              <li>Request a copy of recordings from the meeting host</li>
            </ul>

            <h3 className="legal-subsection-title">3.3 Right to Deletion</h3>
            <p className="legal-paragraph">
              You have the right to:
            </p>
            <ul className="legal-list">
              <li>Request deletion of recordings in which you appear</li>
              <li>Request that your image or voice be removed from recordings</li>
            </ul>
            <p className="legal-paragraph">
              Note: Deletion requests should be made to the meeting host, who controls the recordings. We will assist in processing deletion requests where legally required.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">4. Legal Requirements for Recording Consent</h2>
            <p className="legal-paragraph">
              Recording consent requirements vary by jurisdiction. We comply with all applicable laws:
            </p>
            
            <h3 className="legal-subsection-title">4.1 Two-Party Consent States (US)</h3>
            <p className="legal-paragraph">
              In states requiring two-party consent (e.g., California, Florida, Massachusetts), all participants must consent to recording. Our notification system ensures all participants are informed and can consent or decline.
            </p>

            <h3 className="legal-subsection-title">4.2 One-Party Consent States (US)</h3>
            <p className="legal-paragraph">
              In one-party consent states, typically only the person initiating the recording needs to consent. However, we notify all participants as a best practice.
            </p>

            <h3 className="legal-subsection-title">4.3 European Union (GDPR)</h3>
            <p className="legal-paragraph">
              Under GDPR, recording personal data requires a lawful basis. Consent is one such basis. We ensure all participants are informed and can provide or withdraw consent.
            </p>

            <h3 className="legal-subsection-title">4.4 Other Jurisdictions</h3>
            <p className="legal-paragraph">
              We comply with recording consent requirements in all jurisdictions, including Canada, Australia, the UK, and other countries where we operate.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">5. Host Responsibilities</h2>
            <p className="legal-paragraph">
              Meeting hosts are responsible for:
            </p>
            <ul className="legal-list">
              <li>Obtaining necessary consent from participants before recording</li>
              <li>Complying with applicable recording laws in their jurisdiction</li>
              <li>Informing participants that recording is active</li>
              <li>Managing access to and deletion of recordings</li>
              <li>Responding to participant requests regarding recordings</li>
            </ul>
            <p className="legal-paragraph">
              As a host, you should familiarize yourself with recording laws applicable to your location and the locations of your participants.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">6. Ownership of Recordings</h2>
            <p className="legal-paragraph">
              <span className="legal-strong">Recording Ownership:</span> The meeting host typically owns the recordings they create. However, ownership may vary based on:
            </p>
            <ul className="legal-list">
              <li>Organizational policies (for enterprise accounts)</li>
              <li>Employment agreements</li>
              <li>Applicable laws in your jurisdiction</li>
            </ul>
            <p className="legal-paragraph">
              Participants retain rights to their personal data in recordings, including the right to request deletion or restriction of processing.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">7. Retention and Deletion</h2>
            <p className="legal-paragraph">
              Recordings are retained:
            </p>
            <ul className="legal-list">
              <li>According to your account settings and subscription tier</li>
              <li>Until you delete them or your account is deleted</li>
              <li>As required by applicable legal retention requirements</li>
            </ul>
            <p className="legal-paragraph">
              You can delete recordings at any time through your account. Deletion is permanent and cannot be undone.
            </p>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">8. Security of Recordings</h2>
            <p className="legal-paragraph">
              Recordings are protected by:
            </p>
            <ul className="legal-list">
              <li>Encryption at rest (AES-256) and in transit (TLS/SSL)</li>
              <li>Access controls limiting who can view recordings</li>
              <li>Secure storage infrastructure</li>
              <li>Regular security audits and monitoring</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2 className="legal-section-title">9. Contact Information</h2>
            <p className="legal-paragraph">
              For questions about recording consent or to exercise your rights regarding recordings, please contact:
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

export default RecordingConsentInfoPage;


