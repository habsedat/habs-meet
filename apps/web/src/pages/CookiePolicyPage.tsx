import React from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import '../styles/legal-pages.css';

const CookiePolicyPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="legal-page-container">
      <Header title="Cookie Policy" />
      
      <main className="legal-page-content">
        <h1 className="legal-page-title">
          Cookie Policy
        </h1>
        
        <p className="legal-page-last-updated">
          Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        <section className="legal-section">
          <h2 className="legal-section-title">1. Introduction</h2>
          <p className="legal-paragraph">
              This Cookie Policy explains how Habs Technologies Group ("we," "our," or "us") uses cookies and similar tracking technologies on the Habs Meet platform. This policy is designed to comply with global cookie regulations, including the EU ePrivacy Directive, Canada's consent rules, US state cookie laws, Asia-Pacific frameworks, and GCC guidelines.
            </p>
          <p className="legal-paragraph">
            By using Habs Meet, you consent to the use of cookies in accordance with this policy, unless you have disabled cookies in your browser settings.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">2. What Are Cookies?</h2>
          <p className="legal-paragraph">
              Cookies are small text files that are placed on your device when you visit a website. They are widely used to make websites work more efficiently and provide information to website owners. Cookies allow websites to remember your preferences, improve your experience, and analyze how the website is used.
            </p>
          <p className="legal-paragraph">
            We also use similar technologies such as web beacons, pixel tags, and local storage, which function similarly to cookies.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">3. Types of Cookies We Use</h2>
          
          <h3 className="legal-subsection-title">3.1 Strictly Necessary Cookies</h3>
          <p className="legal-paragraph">
            These cookies are essential for the Service to function properly. They enable core functionality such as:
          </p>
          <ul className="legal-list">
            <li>User authentication and session management</li>
            <li>Security and fraud prevention</li>
            <li>Load balancing and service availability</li>
            <li>Remembering your preferences during a session</li>
          </ul>
          <p className="legal-paragraph">
            These cookies cannot be disabled as they are necessary for the Service to operate. They are typically set in response to actions you take, such as logging in or setting privacy preferences.
          </p>

          <h3 className="legal-subsection-title">3.2 Functional Cookies</h3>
          <p className="legal-paragraph">
            These cookies enhance functionality and personalization. They may be set by us or by third-party providers whose services we use. They enable:
          </p>
          <ul className="legal-list">
            <li>Remembering your language preferences</li>
            <li>Storing your video/audio settings</li>
            <li>Remembering your view mode preferences</li>
            <li>Maintaining your background effect choices</li>
          </ul>
          <p className="legal-paragraph">
            If you disable these cookies, some features of the Service may not function properly.
          </p>

          <h3 className="legal-subsection-title">3.3 Analytics Cookies</h3>
          <p className="legal-paragraph">
            These cookies help us understand how visitors interact with the Service by collecting and reporting information anonymously. They enable us to:
          </p>
          <ul className="legal-list">
            <li>Count visits and traffic sources</li>
            <li>Understand which features are most popular</li>
            <li>Identify technical issues and improve performance</li>
            <li>Measure the effectiveness of our service improvements</li>
          </ul>
          <p className="legal-paragraph">
            All information collected by analytics cookies is aggregated and anonymized. We do not use analytics cookies to identify individual users.
          </p>

          <h3 className="legal-subsection-title">3.4 Third-Party Cookies</h3>
          <p className="legal-paragraph">
            Some cookies are placed by third-party services that appear on our pages. These may include:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Google Analytics:</span> For website analytics (if enabled)</li>
            <li><span className="legal-strong">Firebase:</span> For authentication and service functionality</li>
            <li><span className="legal-strong">LiveKit:</span> For video conferencing functionality</li>
          </ul>
          <p className="legal-paragraph">
            We do not control the setting of these third-party cookies. Please refer to the third-party websites for more information about their cookies.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">4. Cookie Duration</h2>
          <p className="legal-paragraph">
            Cookies may be either "persistent" or "session" cookies:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Session cookies:</span> Temporary cookies that expire when you close your browser. They are used to maintain your session while using the Service.</li>
            <li><span className="legal-strong">Persistent cookies:</span> Remain on your device for a set period or until you delete them. They are used to remember your preferences across sessions.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">5. Global Cookie Compliance</h2>
          
          <h3 className="legal-subsection-title">5.1 European Union (ePrivacy Directive)</h3>
          <p className="legal-paragraph">
            In compliance with the EU ePrivacy Directive, we obtain your consent before placing non-essential cookies on your device. You can withdraw your consent at any time through your browser settings.
          </p>

          <h3 className="legal-subsection-title">5.2 United States</h3>
          <p className="legal-paragraph">
            We comply with applicable US state laws regarding cookies and tracking technologies, including California's CCPA/CPRA requirements for transparency about data collection.
          </p>

          <h3 className="legal-subsection-title">5.3 Canada</h3>
          <p className="legal-paragraph">
            In accordance with Canada's Personal Information Protection and Electronic Documents Act (PIPEDA), we obtain meaningful consent for cookies and provide clear information about their use.
          </p>

          <h3 className="legal-subsection-title">5.4 Asia-Pacific</h3>
          <p className="legal-paragraph">
            We comply with cookie and tracking regulations in Asia-Pacific jurisdictions, including Singapore's PDPA, Australia's Privacy Act, and Japan's APPI.
          </p>

          <h3 className="legal-subsection-title">5.5 GCC and Middle East</h3>
          <p className="legal-paragraph">
            We respect cookie and tracking guidelines in GCC countries and the Middle East, ensuring transparency and user control over tracking technologies.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">6. How to Manage Cookies</h2>
          <p className="legal-paragraph">
            You have the right to accept or reject cookies. Most web browsers automatically accept cookies, but you can modify your browser settings to decline cookies if you prefer.
          </p>
          
          <h3 className="legal-subsection-title">6.1 Browser Settings</h3>
          <p className="legal-paragraph">
            You can control cookies through your browser settings. Instructions for popular browsers:
          </p>
          <ul className="legal-list">
            <li><span className="legal-strong">Chrome:</span> Settings → Privacy and security → Cookies and other site data</li>
            <li><span className="legal-strong">Firefox:</span> Options → Privacy & Security → Cookies and Site Data</li>
            <li><span className="legal-strong">Safari:</span> Preferences → Privacy → Cookies and website data</li>
            <li><span className="legal-strong">Edge:</span> Settings → Cookies and site permissions → Cookies and site data</li>
          </ul>

          <h3 className="legal-subsection-title">6.2 Impact of Disabling Cookies</h3>
          <p className="legal-paragraph">
            Please note that disabling certain cookies may impact your ability to use some features of the Service:
          </p>
          <ul className="legal-list">
            <li>You may need to re-enter information more frequently</li>
            <li>Some features may not function properly</li>
            <li>Your preferences may not be saved</li>
            <li>Video meeting functionality may be affected</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">7. Do Not Track Signals</h2>
          <p className="legal-paragraph">
            Some browsers include a "Do Not Track" (DNT) feature that signals to websites you visit that you do not want to have your online activity tracked. Currently, there is no universal standard for how to interpret DNT signals. We do not currently respond to DNT browser signals, but we respect your cookie preferences as set in your browser.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">8. Updates to This Policy</h2>
          <p className="legal-paragraph">
            We may update this Cookie Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by posting the updated policy on our website and updating the "Last updated" date.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">9. Contact Us</h2>
          <p className="legal-paragraph">
            If you have questions about our use of cookies, please contact us at:
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

export default CookiePolicyPage;
