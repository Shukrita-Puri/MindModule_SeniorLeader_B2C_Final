import { useNavigate } from 'react-router-dom';
import ProfilePageLayout from '@/components/profile/ProfilePageLayout';

const H2_CLS = "text-[17px] sm:text-[15px] sm:text-lg font-body text-foreground mb-3";
const H3_CLS = "text-[15px] sm:text-lg font-body text-foreground mb-2 mt-4";

const Privacy = () => {
  const navigate = useNavigate();
  return (
    <ProfilePageLayout contentClassName="container max-w-4xl">
      <h1 className="text-[28px] font-headline font-semibold text-foreground mb-2">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Effective Date: June 29, 2026 · Last Updated: June 29, 2026</p>

      <div className="space-y-8 text-foreground/80 font-body">
        <section>
          <p className="mb-4">
            Mind Module ("we," "our," or "us") operates the Mind Module mobile application and website at mindmodule.me (collectively, the "Service"). This Privacy Policy explains how we collect, use, disclose, and protect your personal information.
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in accordance with this Privacy Policy. If you do not agree, please do not use the Service.
          </p>
        </section>

        {/* 1. Information We Collect */}
        <section>
          <h2 className={H2_CLS}>1. Information We Collect</h2>

          <h3 className={H3_CLS}>1.1 Account and Authentication Data</h3>
          <p className="mb-4">We use Auth0 for authentication. You may sign in using:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Google OAuth (email, name, profile picture)</li>
            <li>LinkedIn OAuth (email, name, profile picture)</li>
            <li>Email and password (email address, encrypted password via Auth0)</li>
          </ul>
          <p className="mb-4">We do not store passwords for OAuth sign-ins. Email/password credentials are managed and encrypted by Auth0.</p>

          <h3 className={H3_CLS}>1.2 Profile and Assessment Data</h3>
          <p className="mb-4">During registration and use of the Service, you may provide:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Professional role and industry</li>
            <li>Self-reported performance preferences and goals</li>
            <li>Daily self-assessment responses (mental sharpness, cognitive clarity, confidence levels)</li>
          </ul>

          <h3 className={H3_CLS}>1.3 Usage and Interaction Data</h3>
          <p className="mb-4">We collect data about how you use the Service, including:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Features accessed and session duration</li>
            <li>Content viewed and interactions with the Service</li>
            <li>Progress tracking and milestone completion</li>
          </ul>

          <h3 className={H3_CLS}>1.4 Calendar Integration</h3>
          <p className="mb-4">
            If you connect a calendar — <strong>Google Calendar, Microsoft Calendar/Outlook, or Apple Calendar</strong> (read-only access; you choose which provider to connect) — we collect:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Event titles, start and end times</li>
            <li>Organiser status and attendee count</li>
            <li>Attendee email domains (used to support relationship-context features — see below)</li>
            <li>Recurrence patterns</li>
            <li>Location field, where provided by the calendar event (used to support travel-context features)</li>
          </ul>
          <p className="mb-4">
            <strong>A connected calendar is a core part of how the Service works.</strong> Your daily Brief and Plan are built in significant part from your calendar context. Without a connected calendar, the Service will operate in a limited capacity using fewer data sources.
          </p>
          <p className="mb-4">
            Calendar data is transmitted to and processed on our servers in order to generate your Brief, Plan, and related features, and is stored in accordance with Section 9 (Data Retention) below. You may disconnect a calendar integration at any time via account settings; disconnecting stops new data collection but does not automatically delete previously collected data (see Section 10, Your Rights, to request deletion).
          </p>
          <p className="mb-4">
            <strong>Relationship context — meeting participant analysis:</strong> To help your Brief and Plan reflect the nature of a meeting — for example, recognising that an attendee is a board member, investor, or direct report — the Service analyses publicly available professional information about your meeting participants to generate contextual meeting briefings. This analysis uses your attendee's email domain together with publicly available professional information to infer a likely relationship category (for example: board member, investor, direct report, client, external partner).
          </p>
          <p className="mb-4">
            We do not build or sell profiles about third parties. Information about meeting participants is processed transiently and only to provide you with the requested briefing context. The inferred relationship classification is stored in your account solely to avoid re-processing the same person repeatedly and to ensure your Brief and Plan remain consistent across recurring meetings. It is never shared with the attendees concerned, with advertisers, or with any third party for purposes unrelated to the Service.
          </p>
          <p className="mb-4">
            This processing applies only to external attendees on your calendar where the email domain alone is insufficient to identify the relationship, is subject to a daily volume cap, and is used solely to improve the relevance of your Brief and Plan. You may request deletion of stored attendee relationship inferences by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>.
          </p>

          <h3 className={H3_CLS}>1.5 Wearable and Health Data</h3>
          <p className="mb-4">
            If you connect a supported wearable or health data source — <strong>Apple Health (HealthKit), Oura, or another provider we may support from time to time</strong> (you choose which provider to connect) — we collect the following signals, where made available by your connected source:
          </p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Heart Rate Variability (HRV)</li>
            <li>Resting Heart Rate (RHR)</li>
            <li>Heart Rate (general, including elevated heart rate signals during the day)</li>
            <li>Sleep data (duration and, where available, sleep stage and quality signals)</li>
          </ul>
          <p className="mb-4">
            <strong>This data is read from your device and/or your wearable provider's platform and is transmitted to and stored on our secure servers</strong>, where it is used to generate your Mental Readiness Score, daily Performance Readiness Brief, Proactive Mastery Plan, and Performance Patterns insights.
          </p>
          <p className="mb-4">
            Wearable and health data in transit is encrypted using TLS 1.3, and at rest using AES-256-GCM (see Section 5, Data Security). Access is restricted via row-level security so that only you, and the automated systems generating your Brief and Plan, can access your own wearable data.
          </p>
          <p className="mb-4">
            <strong>A connected wearable or health data source is a core part of how the Service works</strong>, in the same way a connected calendar is. Your Mental Readiness Score and Brief depend on wearable and health data for full functionality. Without a connected wearable, the Service will display a limited, calendar-and-pattern-based experience.
          </p>
          <p className="mb-4">
            You may revoke wearable access at any time — for Apple Health, via iOS Settings &gt; Health &gt; Data Access &amp; Devices; for Oura or other providers, via the relevant provider's app or settings, or via Mind Module account settings. Revoking access stops new data collection but does not automatically delete previously collected data (see Section 10).
          </p>
          <p className="mb-4"><strong>We request read access only.</strong> We do not write data back to Apple Health, Oura, or any connected wearable platform.</p>
          <p className="mb-4">
            <strong>Health data use limitation:</strong> Wearable and health data collected by the Service is used solely to provide you with performance and readiness context within the Service. It is never used for advertising, marketing, or any form of user profiling outside the direct functioning of the Service, and is never sold or shared with data brokers or advertisers. This applies equally to all health and fitness data accessed via Apple HealthKit.
          </p>

          <h3 className={H3_CLS}>1.6 Device and Technical Data</h3>
          <p className="mb-4">We automatically collect:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Device type, operating system, and app version</li>
            <li>IP address and general location (country/region)</li>
            <li>Features used and interaction timestamps</li>
          </ul>
        </section>

        {/* 2. How We Use Your Information */}
        <section>
          <h2 className={H2_CLS}>2. How We Use Your Information</h2>
          <p className="mb-4">We use your information to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide, maintain, and improve the Service</li>
            <li>Generate your Mental Readiness Score, Performance Readiness Brief, Proactive Mastery Plan, Performance Patterns, and Smart Nudges</li>
            <li>Personalise your experience and deliver tailored, context-aware performance guidance</li>
            <li>Process payments and manage subscriptions</li>
            <li>Communicate with you about your account and the Service</li>
            <li>Detect and prevent fraud, abuse, and security threats</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        {/* 3. AI-Powered Features */}
        <section>
          <h2 className={H2_CLS}>3. AI-Powered Features</h2>
          <p className="mb-4">
            The Service includes AI-driven features powered by third-party AI infrastructure. Your data — including assessment responses, calendar context, wearable/health signals, and other contextual information — is processed by these systems to generate your Brief, Plan, and related personalised content. For full detail on which AI services we use, what data is sent to them, and the safeguards in place, see our <button onClick={() => navigate('/powered-by-ai')} className="text-primary underline">AI Transparency Disclosure</button>, which forms part of this Privacy Policy by reference.
          </p>
          <p className="mb-4"><strong>Important Disclaimers:</strong></p>
          <ul className="list-disc pl-6 space-y-2">
            <li>The Service is not, and does not include, a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional.</li>
            <li>The Service does not provide medical advice, mental health treatment, diagnosis, or therapy.</li>
            <li>The Service is designed for professional and executive performance optimisation only.</li>
            <li>If you are experiencing a medical or mental health emergency, contact emergency services immediately.</li>
            <li>AI-generated content may occasionally be inaccurate or incomplete. You are responsible for your own decisions and actions.</li>
          </ul>
        </section>

        {/* 4. Health and Medical Disclaimer */}
        <section>
          <h2 className={H2_CLS}>4. Health and Medical Disclaimer</h2>
          <p>
            Mind Module is <strong>NOT</strong> a health application, medical device, or diagnostic tool. The Service does not diagnose, treat, cure, or prevent any disease or medical condition, does not provide medical advice, and is not intended for use in medical emergencies or as a substitute for professional healthcare. Wearable and health data (HRV, resting heart rate, heart rate, sleep) is used solely for performance and readiness context, not for medical purposes.
          </p>
        </section>

        {/* 5. Data Security */}
        <section>
          <h2 className={H2_CLS}>5. Data Security</h2>
          <p className="mb-4">We implement industry-standard security measures to protect your information, including all wearable, health, and calendar data:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Encryption in transit:</strong> TLS 1.3 for all data transmission</li>
            <li><strong>Encryption at rest:</strong> AES-256-GCM for sensitive data, including wearable/health data and authentication tokens</li>
            <li><strong>Access controls:</strong> Row-level security policies ensure users can only access their own data</li>
            <li><strong>Secure authentication:</strong> Auth0-managed identity with OAuth 2.0</li>
            <li><strong>Infrastructure security:</strong> Hosted on secure cloud infrastructure with regular monitoring</li>
          </ul>
          <p>No security system is impenetrable. We encourage you to use strong passwords and enable available security features.</p>
        </section>

        {/* 6. Payment Processing */}
        <section>
          <h2 className={H2_CLS}>6. Payment Processing</h2>
          <p className="mb-4">Subscription payments are processed by Stripe. We do not store your credit card details, CVV, or full payment credentials. Stripe is PCI DSS Level 1 certified.</p>
          <p>We retain: Stripe customer ID, subscription status and plan type, and referral credit records.</p>
        </section>

        {/* 7. Data Sharing and Disclosure */}
        <section>
          <h2 className={H2_CLS}>7. Data Sharing and Disclosure</h2>
          <p className="mb-4">We do not sell, rent, or trade your personal information.</p>
          <p className="mb-4">We may share information with:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Service providers:</strong> Authentication (Auth0), payment processing (Stripe), AI processing (Google Gemini via Lovable's AI gateway — see our AI Transparency Disclosure), third-party services used to retrieve publicly available professional information about meeting participants as described in §1.4, wearable/health data providers (Apple HealthKit, Oura) to the extent necessary to retrieve data you have authorised, calendar providers (Google, Microsoft, Apple) to the extent necessary to retrieve data you have authorised, and cloud hosting — all subject to strict confidentiality obligations.</li>
            <li><strong>Legal authorities:</strong> When required by law, court order, or to protect legal rights.</li>
            <li><strong>Safety purposes:</strong> To prevent fraud, abuse, or threats to the Service or users.</li>
            <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets, with prior notice.</li>
            <li><strong>With your consent:</strong> When you explicitly authorise sharing.</li>
          </ul>
          <p>We do not share wearable, health, or calendar data with advertisers, data brokers, or for any advertising, marketing, or cross-app profiling purpose.</p>
        </section>

        {/* 8. International Data Transfers */}
        <section>
          <h2 className={H2_CLS}>8. International Data Transfers</h2>
          <p>
            The Service operates globally. Your information may be transferred to and processed in countries other than your country of residence, including the United States. We use Standard Contractual Clauses (SCCs) approved by the European Commission and UK ICO, Data Processing Agreements with all processors, and adequacy decisions where applicable.
          </p>
        </section>

        {/* 9. Data Retention */}
        <section>
          <h2 className={H2_CLS}>9. Data Retention</h2>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Account data:</strong> While your account is active, plus 30 days after a deletion request.</li>
            <li><strong>Calendar and wearable/health data:</strong> While your account is active, or until you disconnect the relevant integration and request deletion.</li>
            <li><strong>Attendee relationship inferences:</strong> While your account is active, or upon your request for deletion.</li>
            <li><strong>Usage and assessment data:</strong> While your account is active.</li>
            <li><strong>Payment records:</strong> As required by tax and financial regulations (typically 7 years).</li>
            <li><strong>Security logs:</strong> For compliance and security monitoring purposes.</li>
          </ul>
          <p>You may request account deletion at any time by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>.</p>
        </section>

        {/* 10. Your Rights */}
        <section>
          <h2 className={H2_CLS}>10. Your Rights</h2>
          <p className="mb-4">
            Depending on your jurisdiction, you may have the right to: access your personal information; correct inaccurate data; delete your personal information; export your data in a machine-readable format; object to processing based on legitimate interests; restrict processing; withdraw consent; and disconnect integrations and request deletion of data collected through them (including attendee relationship inferences from §1.4 and wearable/health data from §1.5).
          </p>
          <p>To exercise any rights, contact <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>. We respond within 30 days or sooner where required by law.</p>
        </section>

        {/* 11. Regional Privacy Rights */}
        <section>
          <h2 className={H2_CLS}>11. Regional Privacy Rights</h2>

          <h3 className={H3_CLS}>11.1 European Union &amp; United Kingdom (GDPR / UK GDPR)</h3>
          <p className="mb-4">Our lawful bases for processing:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Contract performance:</strong> Providing the Service.</li>
            <li><strong>Consent:</strong> Optional integrations and marketing; and, for wearable/health data specifically, your explicit consent given at the point of connecting a wearable or health data source.</li>
            <li><strong>Legitimate interests:</strong> Security, fraud prevention, product improvement, and the attendee-relationship inference feature described in §1.4.</li>
            <li><strong>Legal compliance:</strong> Tax and regulatory requirements.</li>
          </ul>
          <p className="mb-4">You may lodge a complaint with your supervisory authority (e.g., the ICO in the UK).</p>

          <h3 className={H3_CLS}>11.2 California, USA (CCPA / CPRA)</h3>
          <p className="mb-4">California residents have the right to know what personal information we collect and how it is used, to delete personal information (with exceptions), and to opt out of the sale of personal information. We do not sell personal information. We do not discriminate against users who exercise their privacy rights.</p>

          <h3 className={H3_CLS}>11.3 Middle East &amp; North Africa (MENA)</h3>
          <p className="mb-4">For users in DIFC, ADGM, Saudi Arabia, and other MENA jurisdictions, we comply with applicable data protection laws including the DIFC Data Protection Law and ADGM Data Protection Regulations.</p>

          <h3 className={H3_CLS}>11.4 Asia-Pacific (APAC)</h3>
          <p className="mb-4">For users in Singapore (PDPA), Australia (Privacy Act), Japan (APPI), and South Korea (PIPA), we comply with applicable data protection requirements.</p>

          <h3 className={H3_CLS}>11.5 Apple App Store and HealthKit Compliance</h3>
          <p className="mb-4">We comply with Apple's App Store Review Guidelines, including Guideline 5.1.3 governing health data, and the App Tracking Transparency framework.</p>
          <p>
            <strong>HealthKit data, and all wearable/health data collected through the Service, is never used for advertising or marketing, is never shared with advertising networks or data brokers, and is never used to build advertising profiles</strong> — whether about you individually or in aggregate. This is an absolute commitment and is not subject to user settings or consent withdrawal; it reflects a hard architectural constraint on how we use this category of data.
          </p>
        </section>

        {/* 12. Cookies and Tracking */}
        <section>
          <h2 className={H2_CLS}>12. Cookies and Tracking</h2>
          <p>
            We use cookies on mindmodule.me for authentication and session management, security and fraud prevention, and platform analytics and performance monitoring. The mobile app uses secure local storage and keychain for session management. We do not use cookies for cross-site tracking or targeted advertising.
          </p>
        </section>

        {/* 13. Age Restriction */}
        <section>
          <h2 className={H2_CLS}>13. Age Restriction</h2>
          <p>The Service is intended for users aged 18 and older. We do not knowingly collect information from minors. If we learn we have collected data from a minor, we will delete it and terminate the account.</p>
        </section>

        {/* 14. Changes to This Policy */}
        <section>
          <h2 className={H2_CLS}>14. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes — including any change to which data we collect or how we use wearable/health or calendar data — will be communicated via email or in-app notification before or at the time the change takes effect.
          </p>
        </section>

        {/* 15. Contact Us */}
        <section>
          <h2 className={H2_CLS}>15. Contact Us</h2>
          <p className="mb-4">For questions or requests regarding this Privacy Policy:</p>
          <p><a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></p>
          <p className="mt-4">We respond to enquiries within 30 days.</p>
        </section>

        <div className="pt-8 mt-8 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Last Updated: June 29, 2026</p>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/terms')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Use →</button>
            <span className="text-muted-foreground/40 text-sm">·</span>
            <button onClick={() => navigate('/powered-by-ai')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Powered by AI →</button>
          </div>
        </div>
      </div>
    </ProfilePageLayout>
  );
};

export default Privacy;
