import { useNavigate } from 'react-router-dom';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Privacy = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar hideCoach />
      <div className="container max-w-4xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Effective Date: March 11, 2026</p>
        
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
            <h2 className="text-2xl font-subheadline text-foreground mb-3">1. Information We Collect</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">1.1 Account and Authentication Data</h3>
            <p className="mb-4">
              We use Auth0 for authentication. You may sign in using:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Google OAuth</strong> (email, name, profile picture)</li>
              <li><strong>LinkedIn OAuth</strong> (email, name, profile picture)</li>
              <li><strong>Email and password</strong> (email address, encrypted password via Auth0)</li>
            </ul>
            <p className="mb-4">
              We do not store passwords for OAuth sign-ins. Email/password credentials are managed and encrypted by Auth0.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.2 Profile and Assessment Data</h3>
            <p className="mb-4">
              During registration and use of the Service, you may provide:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Professional role and industry</li>
              <li>Self-reported performance preferences and goals</li>
              <li>Daily self-assessment responses (emotional state, cognitive clarity, confidence levels)</li>
            </ul>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.3 Usage and Interaction Data</h3>
            <p className="mb-4">
              We collect data about how you use the Service, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Features accessed and session duration</li>
              <li>Content viewed and interactions with the Service</li>
              <li>Progress tracking and milestone completion</li>
            </ul>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.4 AI Coaching Conversations</h3>
            <p className="mb-4">
              Conversations with our AI Coach are stored to provide continuity, session history, and personalised guidance. AI responses are generated in real-time using third-party AI infrastructure and are not reviewed by humans unless you report an issue or request support.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.5 Calendar Integration (Optional)</h3>
            <p className="mb-4">
              If you connect your Google Calendar (read-only access), we collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Event titles, start and end times</li>
              <li>Organiser status and attendee count</li>
              <li>Recurrence patterns</li>
            </ul>
            <p className="mb-4">
              <strong>Local Storage:</strong> Calendar data is processed and stored <strong>locally on your device</strong>. You control this data and may disconnect the integration at any time.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.6 Wearable Data (Optional, iOS Only)</h3>
            <p className="mb-4">
              If you grant access to Apple HealthKit, we collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Heart Rate Variability (HRV)</strong> only</li>
            </ul>
            <p className="mb-4">
              <strong>Local Storage:</strong> HealthKit data is queried <strong>on-device only</strong> and stored <strong>locally on your iOS device</strong>. We do not sync wearable data to our servers. You may revoke access at any time via iOS Settings {'>'} Health {'>'} Data Access.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">1.7 Device and Technical Data</h3>
            <p className="mb-4">
              We automatically collect:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Device type, operating system, and browser type</li>
              <li>IP address and general location (country/region)</li>
              <li>Pages visited, features used, and timestamps</li>
            </ul>
          </section>

          {/* 2. How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">2. How We Use Your Information</h2>
            <p className="mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Provide, maintain, and improve the Service</li>
              <li>Personalise your experience and deliver tailored guidance</li>
              <li>Process payments and manage subscriptions</li>
              <li>Communicate with you about your account and the Service</li>
              <li>Detect and prevent fraud, abuse, and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          {/* 3. AI-Powered Features */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">3. AI-Powered Features</h2>
            <p className="mb-4">
              The Service includes AI-driven features powered by third-party AI models. Your data (including assessment responses, conversation history, and contextual information) may be processed by these models to generate personalised recommendations and coaching responses.
            </p>
            <p className="mb-4"><strong>Important Disclaimers:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>The AI Coach is <strong>not</strong> a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional</li>
              <li>The Service does <strong>not</strong> provide medical advice, mental health treatment, diagnosis, or therapy</li>
              <li>The Service is designed for professional development, performance optimisation, and general wellness only</li>
              <li><strong>If you are experiencing a medical or mental health emergency, contact emergency services immediately</strong></li>
              <li>Always seek advice from qualified healthcare providers for medical or mental health concerns</li>
              <li>Do not use the Service as a substitute for professional medical or psychological care</li>
            </ul>
            <p>
              AI-generated content may occasionally be inaccurate or incomplete. You are responsible for your own decisions and actions.
            </p>
          </section>

          {/* 4. Health and Medical Disclaimer */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">4. Health and Medical Disclaimer</h2>
            <p className="mb-4"><strong>Mind Module is NOT a health application, medical device, or diagnostic tool.</strong></p>
            <p className="mb-4">The Service:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Does not diagnose, treat, cure, or prevent any disease or medical condition</li>
              <li>Does not provide medical advice or replace professional healthcare</li>
              <li>Is not intended for use in medical emergencies</li>
              <li>Should not be relied upon for health-related decisions</li>
            </ul>
            <p>
              Wearable data (HRV) is used solely for performance context and wellness insights, not for medical purposes. If you have health concerns, consult a qualified healthcare professional.
            </p>
          </section>

          {/* 5. Data Security */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">5. Data Security</h2>
            <p className="mb-4">We implement industry-standard security measures to protect your information:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Encryption in transit:</strong> TLS 1.3 for all data transmission</li>
              <li><strong>Encryption at rest:</strong> AES-256-GCM for sensitive data and authentication tokens</li>
              <li><strong>Access controls:</strong> Row-level security policies ensure users can only access their own data</li>
              <li><strong>Secure authentication:</strong> Auth0-managed identity with OAuth 2.0</li>
              <li><strong>Infrastructure security:</strong> Hosted on secure cloud infrastructure with regular monitoring</li>
            </ul>
            <p className="mb-4">
              <strong>Local Data Storage:</strong> Calendar and wearable data are stored locally on your device, giving you full control over this information.
            </p>
            <p>
              No security system is impenetrable. We encourage you to use strong passwords and enable available security features.
            </p>
          </section>

          {/* 6. Payment Processing */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">6. Payment Processing</h2>
            <p className="mb-4">
              Subscription payments are processed by <strong>Stripe</strong>. We do not store your credit card details, CVV, or full payment credentials. Stripe is PCI DSS Level 1 certified.
            </p>
            <p className="mb-4">We retain:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Stripe customer ID</li>
              <li>Subscription status and plan type</li>
              <li>Referral credit records</li>
            </ul>
          </section>

          {/* 7. Data Sharing and Disclosure */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">7. Data Sharing and Disclosure</h2>
            <p className="mb-4">We do not sell, rent, or trade your personal information.</p>
            <p className="mb-4">We may share information with:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Service providers:</strong> Authentication (Auth0), payment processing (Stripe), AI processing (third-party AI infrastructure), and cloud hosting — all subject to strict confidentiality obligations</li>
              <li><strong>Legal authorities:</strong> When required by law, court order, or to protect legal rights</li>
              <li><strong>Safety purposes:</strong> To prevent fraud, abuse, or threats to the Service or users</li>
              <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets (with prior notice)</li>
              <li><strong>With your consent:</strong> When you explicitly authorise sharing (e.g., social media sharing features)</li>
            </ul>
          </section>

          {/* 8. International Data Transfers */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">8. International Data Transfers</h2>
            <p className="mb-4">
              The Service operates globally. Your information may be transferred to and processed in countries other than your country of residence, including the United States. We use appropriate safeguards:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission and UK ICO</li>
              <li>Data Processing Agreements with all processors</li>
              <li>Adequacy decisions where applicable</li>
            </ul>
          </section>

          {/* 9. Data Retention */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">9. Data Retention</h2>
            <p className="mb-4">We retain your information:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Account data:</strong> While your account is active, plus 30 days after deletion request</li>
              <li><strong>Conversation history:</strong> While your account is active</li>
              <li><strong>Usage and assessment data:</strong> While your account is active</li>
              <li><strong>Payment records:</strong> As required by tax and financial regulations (typically 7 years)</li>
              <li><strong>Security logs:</strong> For compliance and security monitoring purposes</li>
            </ul>
            <p>
              You may request account deletion at any time by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>.
            </p>
          </section>

          {/* 10. Your Rights */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">10. Your Rights</h2>
            <p className="mb-4">Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Access</strong> your personal information</li>
              <li><strong>Correct</strong> inaccurate or incomplete data</li>
              <li><strong>Delete</strong> your personal information</li>
              <li><strong>Export</strong> your data in a structured, machine-readable format</li>
              <li><strong>Object</strong> to processing based on legitimate interests</li>
              <li><strong>Restrict</strong> processing in certain circumstances</li>
              <li><strong>Withdraw consent</strong> where processing is consent-based</li>
              <li><strong>Disconnect integrations</strong> (Google Calendar, Apple HealthKit)</li>
            </ul>
            <p>
              To exercise any rights, contact <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>. We respond within 30 days (or sooner where required by law).
            </p>
          </section>

          {/* 11. Regional Privacy Rights */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">11. Regional Privacy Rights</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">11.1 European Union & United Kingdom (GDPR / UK GDPR)</h3>
            <p className="mb-4">Our lawful bases for processing:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Contract performance:</strong> Providing the Service</li>
              <li><strong>Consent:</strong> Optional integrations and marketing</li>
              <li><strong>Legitimate interests:</strong> Security, fraud prevention, product improvement</li>
              <li><strong>Legal compliance:</strong> Tax, regulatory requirements</li>
            </ul>
            <p className="mb-4">
              You may lodge a complaint with your supervisory authority (e.g., ICO in the UK).
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">11.2 California, USA (CCPA / CPRA)</h3>
            <p className="mb-4">California residents have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Know what personal information we collect and how it is used</li>
              <li>Delete personal information (with exceptions)</li>
              <li>Opt out of the sale of personal information (we do not sell personal information)</li>
            </ul>
            <p className="mb-4">We do not discriminate against users who exercise their privacy rights.</p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">11.3 Middle East & North Africa (MENA)</h3>
            <p className="mb-4">
              For users in DIFC, ADGM, Saudi Arabia, and other MENA jurisdictions, we comply with applicable data protection laws including the DIFC Data Protection Law and ADGM Data Protection Regulations.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">11.4 Asia-Pacific (APAC)</h3>
            <p className="mb-4">
              For users in Singapore (PDPA), Australia (Privacy Act), Japan (APPI), and South Korea (PIPA), we comply with applicable data protection requirements.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">11.5 Apple App Store Compliance</h3>
            <p className="mb-4">
              We comply with Apple's App Store Review Guidelines and App Tracking Transparency framework. HealthKit data is handled in accordance with Apple's guidelines and is never used for advertising or marketing.
            </p>
          </section>

          {/* 12. Cookies and Tracking */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">12. Cookies and Tracking</h2>
            <p className="mb-4">We use cookies on mindmodule.me for:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Authentication and session management</li>
              <li>Security and fraud prevention</li>
              <li>Platform analytics and performance monitoring</li>
            </ul>
            <p className="mb-4">
              The mobile app uses secure local storage and keychain for session management. For details, see our <strong>Cookie Policy</strong> at mindmodule.me/cookie-policy.
            </p>
            <p>
              We do <strong>not</strong> use cookies for cross-site tracking or targeted advertising.
            </p>
          </section>

          {/* 13. Age Restriction */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">13. Age Restriction</h2>
            <p>
              The Service is intended for users aged 18 and older. We do not knowingly collect information from minors. If we learn we have collected data from a minor, we will delete it and terminate the account.
            </p>
          </section>

          {/* 14. Changes to This Policy */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">14. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be communicated via email or in-app notification. Continued use after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* 15. Contact Us */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">15. Contact Us</h2>
            <p className="mb-4">For questions or requests regarding this Privacy Policy:</p>
            <p>
              <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>
            </p>
            <p className="mt-4">
              We respond to enquiries within 30 days.
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Last Updated: March 11, 2026
            </p>
            <button
              onClick={() => navigate('/terms')}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms of Use →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
