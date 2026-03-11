import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Effective Date: March 11, 2026</p>
        
        <div className="space-y-8 text-foreground/80 font-body">
          
          {/* Introduction */}
          <section>
            <p className="mb-4">
              Mind Module ("we," "our," or "us") operates the Mind Module iOS application and website at mindmodule.me (collectively, the "Platform"). Mind Module is a proactive performance and self-mastery system built for senior leaders, executives, founders, and high-performing professionals.
            </p>
            <p className="mb-4">
              This Privacy Policy explains what data we collect, how we use it, who we share it with, and your rights — whether you access Mind Module from the United Kingdom, European Union, United States, Middle East and North Africa (MENA), Asia-Pacific (APAC), or any other jurisdiction.
            </p>
            <p>
              By using the Platform you acknowledge that you have read and understood this Privacy Policy. If you do not agree, please do not use the Platform.
            </p>
          </section>

          {/* 1. Information We Collect */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">1. Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-foreground mb-2">1.1 Account Information</h3>
            <p className="mb-4">
              We use Auth0 for identity management. When you sign in with Google, we receive your name, email address, and profile picture via the <code>openid</code>, <code>profile</code>, and <code>email</code> OAuth scopes. We do not receive or store your Google password.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.2 Onboarding Assessment (Inner World Profile)</h3>
            <p className="mb-2">
              During onboarding you complete a five-question assessment that builds your performance profile across three areas — Recalibrate, Clarity, and Renewal. Responses may include:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Your professional role and leadership level</li>
              <li>Primary pressure points and challenges</li>
              <li>Emotional awareness and cognitive patterns</li>
              <li>Stress response and recovery preferences</li>
              <li>Growth priorities and intentions</li>
            </ul>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.3 Daily Check-In Data</h3>
            <p className="mb-2">Mind Module includes two daily check-ins:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Emotional &amp; Cognitive Check-In:</strong> self-reported energy balance, emotional state tags, and contextual information</li>
              <li><strong>Clarity &amp; Confidence Check-In:</strong> clarity level, confidence level, and related state tags</li>
            </ul>
            <p className="mb-4">
              This data is used to detect patterns, generate your Daily Brief, and personalise your Proactive Mastery Plan.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.4 Self Mastery Coach Conversations</h3>
            <p className="mb-4">
              Conversations with the Self Mastery Coach — an AI-powered coaching feature — are stored to provide session continuity, conversation history, pattern recognition, and increasingly personalised guidance. Conversations may contain sensitive information about your professional challenges, relationships, and personal reflections. AI responses are generated in real-time by Google Gemini via Lovable AI infrastructure and are not reviewed by humans unless you report an issue.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.5 Recalibrate Studio Data</h3>
            <p className="mb-4">
              We record which guided practices and micro-exercises you complete, session duration, effectiveness ratings, and soundscape usage within the Recalibrate Studio.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.6 Insights &amp; Analytics Data</h3>
            <p className="mb-4">
              The Insights section ("Your Inner World") derives pattern analytics from your check-ins, coaching sessions, practice completions, and integration data. These analytics are computed and stored to surface trends and recommendations.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.7 Google Calendar Integration</h3>
            <p className="mb-2">
              When you connect Google Calendar, we request the <code>calendar.readonly</code> scope only. We collect:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Event title</li>
              <li>Start and end times</li>
              <li>Whether you are the organiser</li>
              <li>Attendee count (not individual attendee identities)</li>
              <li>Recurrence flag</li>
              <li>Location and description metadata</li>
              <li>Video-call link (e.g. Google Meet)</li>
            </ul>
            <p className="mb-4">
              We do <strong>not</strong> create, modify, or delete any calendar events. Calendar data is used to understand your schedule density and provide context-aware coaching.
            </p>
            <p className="mb-4">
              <strong>Token security:</strong> Google OAuth access and refresh tokens are encrypted with <strong>AES-256-GCM</strong> and stored server-side. Tokens are automatically refreshed every 15 minutes. Calendar data is synced every 6 hours. You may disconnect Google Calendar at any time, which revokes stored tokens.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.8 Apple Watch / Apple HealthKit Integration (iOS Only)</h3>
            <p className="mb-2">
              On iOS, you may grant Mind Module read-only access to Apple HealthKit. We request:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Heart Rate Variability (HRV)</li>
              <li>Resting heart rate</li>
              <li>Sleep analysis — in-bed minutes, asleep minutes, sleep efficiency, deep sleep, REM sleep</li>
              <li>Activity rings — move (active energy), exercise minutes, stand hours</li>
              <li>Step count</li>
            </ul>
            <p className="mb-4">
              HealthKit data is queried on-device and synced to our encrypted backend storage. We do <strong>not</strong> write any data back to HealthKit. You may revoke HealthKit access at any time via iOS Settings &gt; Health &gt; Data Access.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.9 LinkedIn</h3>
            <p className="mb-4">
              Mind Module offers the ability to share achievements to LinkedIn via an outbound share URL. We do <strong>not</strong> use LinkedIn OAuth, do not import LinkedIn data, and do not access your LinkedIn profile or connections.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.10 Technical and Usage Data</h3>
            <p className="mb-4">
              We automatically collect device type, operating system version, browser type, IP address, pages and features used, and interaction timestamps for platform improvement and security purposes.
            </p>
          </section>

          {/* 2. How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, personalise, and improve the Platform — including your Daily Brief, Proactive Mastery Plan, AI coaching, and Just-In-Time Prep</li>
              <li>Generate and refine your Inner World Profile and Insights</li>
              <li>Power AI-driven coaching conversations and recommendations via the Self Mastery Coach</li>
              <li>Track your progress, streaks, achievements, and engagement patterns</li>
              <li>Analyse patterns across check-ins, practices, calendar, and wearable data to surface actionable insights</li>
              <li>Process subscriptions and referral credits via Stripe</li>
              <li>Send service-related communications (you may opt out of non-essential messages)</li>
              <li>Ensure platform security, prevent fraud, and comply with legal obligations</li>
            </ul>
          </section>

          {/* 3. AI-Powered Features */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">3. AI-Powered Features</h2>
            <p className="mb-4">
              Mind Module uses artificial intelligence to power several features, including the Self Mastery Coach, pattern detection, and Daily Brief generation.
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Your messages and conversation history are processed by Google Gemini AI models to generate personalised coaching responses</li>
              <li>Your onboarding assessment, check-in history, calendar context, and wearable data may be used to contextualise coaching guidance</li>
              <li>Conversations are stored in our database to enable continuity and history review</li>
              <li>AI responses are generated in real-time and are not reviewed by humans unless you report an issue</li>
            </ul>
            <p>
              <strong>Important:</strong> The Self Mastery Coach is an AI assistant. It is not a licensed therapist, psychologist, psychiatrist, or medical professional. It does not provide medical advice, diagnosis, or treatment. If you are experiencing a medical or mental health emergency, contact emergency services immediately.
            </p>
          </section>

          {/* 4. Data Security */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">4. Data Security</h2>
            <p className="mb-4">
              We implement enterprise-grade security measures appropriate for protecting sensitive executive information:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Encryption in Transit:</strong> All data transmission uses TLS 1.3</li>
              <li><strong>Encryption at Rest:</strong> Integration tokens and sensitive personal data are encrypted using AES-256-GCM</li>
              <li><strong>Authentication:</strong> Auth0 provides secure identity management with Google federation</li>
              <li><strong>Access Control:</strong> Row-Level Security (RLS) policies on all user data tables ensure you can only access your own data</li>
              <li><strong>Infrastructure:</strong> Hosted on secure cloud infrastructure with regular security monitoring</li>
              <li><strong>Audit Logging:</strong> Sensitive operations are logged for security and compliance monitoring</li>
            </ul>
            <p>
              No system is completely secure. We encourage you to use strong passwords and enable available security features on your devices.
            </p>
          </section>

          {/* 5. Payment Data */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">5. Payment Data</h2>
            <p className="mb-4">
              Subscription payments are processed by <strong>Stripe</strong>. Mind Module does not store your credit card number, CVV, or payment credentials. Stripe is PCI DSS Level 1 certified — the highest level of payment-industry security certification.
            </p>
            <p>
              We store your Stripe customer ID, subscription status, plan type, and referral credit records for billing and account management purposes.
            </p>
          </section>

          {/* 6. Data Sharing and Disclosure */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">6. Data Sharing and Disclosure</h2>
            <p className="mb-4">We do not sell, rent, or trade your personal information. We may share information in the following limited circumstances:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Service Providers:</strong> Auth0 (authentication), Stripe (payments), Google Gemini via Lovable AI (AI processing), and cloud hosting providers — each bound by contractual confidentiality obligations</li>
              <li><strong>Legal Requirements:</strong> When required by law, regulation, subpoena, or legal process</li>
              <li><strong>Safety:</strong> To protect the rights, safety, or property of Mind Module, our users, or the public</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with prior notice to affected users</li>
              <li><strong>With Consent:</strong> When you explicitly authorise specific sharing (e.g. LinkedIn achievement shares)</li>
            </ul>
          </section>

          {/* 7. International Data Transfers */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">7. International Data Transfers</h2>
            <p className="mb-4">
              Mind Module operates globally. Your information may be transferred to and processed in countries other than your country of residence, including the United States. We ensure appropriate safeguards are in place:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission and the UK Information Commissioner's Office</li>
              <li>Data processing agreements with all sub-processors</li>
              <li>Adequacy decisions where applicable</li>
            </ul>
          </section>

          {/* 8. Data Retention */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">8. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Account Data:</strong> Retained while your account is active and for 30 days after deletion request to allow recovery</li>
              <li><strong>Coaching Conversations:</strong> Retained while your account is active to provide conversation history and pattern recognition</li>
              <li><strong>Check-in, Practice &amp; Integration Data:</strong> Retained while your account is active for analytics and personalisation</li>
              <li><strong>Payment Records:</strong> Retained as required by tax and financial regulations (typically 7 years)</li>
              <li><strong>Audit Logs:</strong> Retained for security and compliance purposes</li>
            </ul>
            <p>
              You may request deletion of your account and associated data at any time by contacting <a href="mailto:privacy@mindmodule.me" className="text-primary underline">privacy@mindmodule.me</a>.
            </p>
          </section>

          {/* 9. Your Rights */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">9. Your Rights</h2>
            <p className="mb-4">Depending on your jurisdiction, you may exercise the following rights:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request your data in a structured, machine-readable format</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interests</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent at any time where processing is based on consent</li>
              <li><strong>Disconnect Integrations:</strong> Disconnect Google Calendar or Apple HealthKit at any time via account settings or device settings</li>
            </ul>
            <p>
              To exercise any right, email <a href="mailto:privacy@mindmodule.me" className="text-primary underline">privacy@mindmodule.me</a>. We will respond within 30 days (or sooner where required by law).
            </p>
          </section>

          {/* 10. Regional Provisions */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">10. Regional Privacy Provisions</h2>
            
            <h3 className="text-lg font-semibold text-foreground mb-2">10.1 European Union &amp; United Kingdom (GDPR / UK GDPR)</h3>
            <p className="mb-2">Our lawful bases for processing are:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Contract:</strong> Processing necessary to provide the Platform and services you have subscribed to</li>
              <li><strong>Consent:</strong> Optional integrations (Google Calendar, Apple HealthKit) and marketing communications</li>
              <li><strong>Legitimate Interests:</strong> Platform security, fraud prevention, and product improvement</li>
              <li><strong>Legal Obligation:</strong> Tax records, regulatory compliance</li>
            </ul>
            <p className="mb-4">
              You have the right to lodge a complaint with your local supervisory authority (e.g. the ICO in the UK, CNIL in France, BfDI in Germany).
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">10.2 California, USA (CCPA / CPRA)</h3>
            <p className="mb-2">If you are a California resident:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>We do not sell or share your personal information for cross-context behavioural advertising</li>
              <li>You have the right to know, delete, correct, and opt out</li>
              <li>We will not discriminate against you for exercising your privacy rights</li>
              <li>Categories of information collected are detailed in Section 1 above</li>
            </ul>

            <h3 className="text-lg font-semibold text-foreground mb-2">10.3 Middle East &amp; North Africa (MENA)</h3>
            <p className="mb-4">
              For users in DIFC, ADGM, Saudi Arabia, and other MENA jurisdictions with data protection laws, we comply with applicable local requirements including the DIFC Data Protection Law and ADGM Data Protection Regulations. Data transfers outside the region are protected by Standard Contractual Clauses.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">10.4 Asia-Pacific (APAC)</h3>
            <p className="mb-4">
              For users in jurisdictions such as Singapore (PDPA), Australia (Privacy Act), Japan (APPI), and South Korea (PIPA), we comply with applicable local data protection requirements. Cross-border transfers are subject to appropriate safeguards as required by local law.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">10.5 Apple App Store Requirements</h3>
            <p className="mb-4">
              As an iOS application, Mind Module complies with Apple's App Store Review Guidelines and App Tracking Transparency framework. We do not track you across other apps or websites. HealthKit data is handled in accordance with Apple's HealthKit guidelines and is never used for advertising.
            </p>
          </section>

          {/* 11. Cookies */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">11. Cookies and Tracking Technologies</h2>
            <p className="mb-4">On the website (mindmodule.me) we use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Maintain your session and authentication state</li>
              <li>Remember your preferences</li>
              <li>Analyse platform usage and performance</li>
              <li>Ensure security</li>
            </ul>
            <p>
              The iOS app uses local storage and secure keychain for session management. You can manage cookie preferences through your browser settings on the web. Disabling certain cookies may affect website functionality.
            </p>
          </section>

          {/* 12. Children */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">12. Age Restriction</h2>
            <p>
              Mind Module is designed for professionals aged 18 and older. We do not knowingly collect personal information from individuals under 18. If we learn we have collected information from a minor, we will delete it promptly and terminate the associated account.
            </p>
          </section>

          {/* 13. Changes */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">13. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Platform and update the Effective Date above. Your continued use of the Platform after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* 14. Contact */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">14. Contact Us</h2>
            <p className="mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices:
            </p>
            <ul className="list-none space-y-1 mb-4">
              <li><strong>Privacy enquiries:</strong> <a href="mailto:privacy@mindmodule.me" className="text-primary underline">privacy@mindmodule.me</a></li>
              <li><strong>General support:</strong> <a href="mailto:support@mindmodule.me" className="text-primary underline">support@mindmodule.me</a></li>
              <li><strong>General contact:</strong> <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></li>
            </ul>
            <p>
              We aim to respond to all privacy enquiries within 30 days.
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last Updated: March 11, 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
