import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Effective Date: January 12, 2026</p>
        
        <div className="space-y-8 text-foreground/80 font-body">
          
          {/* Introduction */}
          <section>
            <p className="mb-4">
              Kairos ("we," "our," or "us") is a self-mastery and mental fitness platform designed specifically for senior leaders, executives, founders, and high-performing professionals. We understand that our users require absolute discretion with their personal and professional information.
            </p>
            <p>
              This Privacy Policy describes how we collect, use, disclose, and protect your information when you use our website, mobile application, and services (collectively, the "Platform"). By accessing or using Kairos, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">1. Information We Collect</h2>
            
            <h3 className="text-lg font-semibold text-foreground mb-2">1.1 Account Information</h3>
            <p className="mb-4">
              When you create an account, we collect your name, email address, and authentication credentials. We use Auth0, a leading identity management platform, to securely handle your authentication.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.2 Onboarding Assessment Data</h3>
            <p className="mb-2">
              During onboarding, you provide responses to our Inner World Profile assessment, which may include:
            </p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li>Your professional role and leadership level</li>
              <li>Primary pressure points and challenges</li>
              <li>Emotional awareness patterns</li>
              <li>Stress response styles</li>
              <li>Recovery and renewal preferences</li>
              <li>Mental clarity and focus patterns</li>
              <li>Growth priorities and intentions</li>
            </ul>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.3 Daily Check-In Data</h3>
            <p className="mb-4">
              When you complete Emotional and Cognitive Energy State check-ins, we collect your self-reported energy levels, emotional states, and contextual tags that help us understand your patterns over time.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.4 AI Coaching Conversations</h3>
            <p className="mb-4">
              Conversations with our Self Mastery Coach are stored to provide continuity in your coaching experience, enable conversation history review, and improve the personalization of guidance. These conversations may contain sensitive information about your professional challenges, relationships, and personal reflections.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.5 Practice and Engagement Data</h3>
            <p className="mb-4">
              We collect data about your use of the Recalibrate Studio, including which practices you complete, session durations, effectiveness ratings, and engagement patterns.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.6 Third-Party Integration Data</h3>
            <p className="mb-2">When you choose to connect third-party services, we collect:</p>
            <ul className="list-disc pl-6 space-y-1 mb-4">
              <li><strong>Google Calendar:</strong> Event timing and density (we do not access event content or attendee details beyond count)</li>
              <li><strong>Oura Ring:</strong> Readiness scores, sleep scores, HRV, and activity data</li>
            </ul>
            <p className="mb-4">
              Integration tokens are encrypted using AES-256-GCM encryption and stored securely. You may disconnect these integrations at any time.
            </p>

            <h3 className="text-lg font-semibold text-foreground mb-2">1.7 Technical and Usage Data</h3>
            <p className="mb-4">
              We automatically collect device information, browser type, IP address, pages visited, features used, and interaction timestamps for platform improvement and security purposes.
            </p>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">2. How We Use Your Information</h2>
            <p className="mb-2">We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, personalize, and improve our self-mastery coaching and mental fitness services</li>
              <li>Generate your Inner World Profile and personalized insights</li>
              <li>Power AI-driven coaching conversations and recommendations</li>
              <li>Track your progress, streaks, and engagement patterns</li>
              <li>Analyze patterns across check-ins, practices, and integrations to surface actionable insights</li>
              <li>Send service-related communications (you may opt out of non-essential communications)</li>
              <li>Ensure platform security and prevent fraud</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          {/* AI-Powered Features Disclosure */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">3. AI-Powered Features Disclosure</h2>
            <p className="mb-4">
              Kairos uses artificial intelligence to power the Self Mastery Coach feature. When you engage with the Coach:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Your messages and conversation history are processed by AI models (currently Google Gemini) to generate personalized coaching responses</li>
              <li>Your onboarding assessment, check-in history, and profile data may be used to contextualize coaching guidance</li>
              <li>Conversations are stored in our database to enable continuity and history review</li>
              <li>AI responses are generated in real-time and are not reviewed by humans unless you report an issue</li>
            </ul>
            <p>
              <strong>Important:</strong> The Self Mastery Coach is an AI assistant, not a licensed therapist, psychologist, or medical professional. It does not provide medical advice, diagnosis, or treatment.
            </p>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">4. Data Security</h2>
            <p className="mb-4">
              We implement enterprise-grade security measures appropriate for protecting sensitive executive information:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Encryption in Transit:</strong> All data transmission uses TLS 1.3 encryption</li>
              <li><strong>Encryption at Rest:</strong> Sensitive data including integration tokens and certain personal information is encrypted using AES-256-GCM</li>
              <li><strong>Authentication:</strong> We use Auth0 for secure identity management with support for multi-factor authentication</li>
              <li><strong>Access Control:</strong> Row-Level Security (RLS) policies ensure users can only access their own data</li>
              <li><strong>Infrastructure:</strong> Our platform is hosted on secure cloud infrastructure with regular security audits</li>
              <li><strong>Audit Logging:</strong> Sensitive operations are logged for security monitoring</li>
            </ul>
            <p>
              While we implement robust security measures, no system is completely secure. We encourage you to use strong passwords and enable available security features.
            </p>
          </section>

          {/* Data Sharing and Disclosure */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">5. Data Sharing and Disclosure</h2>
            <p className="mb-4">We do not sell, rent, or trade your personal information. We may share information in the following circumstances:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Service Providers:</strong> With trusted third parties who assist in operating our platform (hosting, authentication, AI processing), bound by confidentiality obligations</li>
              <li><strong>AI Processing:</strong> Conversation data is processed by Google's Gemini AI through Lovable AI infrastructure to generate coaching responses</li>
              <li><strong>Legal Requirements:</strong> When required by law, subpoena, or legal process</li>
              <li><strong>Safety:</strong> To protect the rights, safety, or property of Kairos, our users, or others</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, with notice to you</li>
              <li><strong>With Consent:</strong> When you explicitly authorize specific sharing</li>
            </ul>
          </section>

          {/* International Data Transfers */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">6. International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place, including standard contractual clauses approved by relevant data protection authorities, to protect your information during such transfers.
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">7. Data Retention</h2>
            <p className="mb-4">We retain your information as follows:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period thereafter</li>
              <li><strong>Coaching Conversations:</strong> Retained while your account is active to provide conversation history</li>
              <li><strong>Check-in and Practice Data:</strong> Retained while your account is active for analytics and insights</li>
              <li><strong>Audit Logs:</strong> Retained for security and compliance purposes</li>
            </ul>
            <p className="mt-4">
              You may request deletion of your account and associated data at any time through your account settings or by contacting us.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">8. Your Rights</h2>
            <p className="mb-4">Depending on your jurisdiction, you may have the following rights:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
              <li><strong>Objection:</strong> Object to certain processing activities</li>
              <li><strong>Restriction:</strong> Request restriction of processing</li>
              <li><strong>Withdraw Consent:</strong> Withdraw consent where processing is based on consent</li>
              <li><strong>Disconnect Integrations:</strong> Disconnect third-party integrations at any time</li>
            </ul>
            <p className="mt-4">
              To exercise these rights, contact us at privacy@kairos.me. We will respond within the timeframe required by applicable law.
            </p>
          </section>

          {/* Cookies and Tracking */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">9. Cookies and Tracking Technologies</h2>
            <p className="mb-4">We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Maintain your session and authentication state</li>
              <li>Remember your preferences</li>
              <li>Analyze platform usage and performance</li>
              <li>Ensure security</li>
            </ul>
            <p>
              You can manage cookie preferences through your browser settings. Disabling certain cookies may affect platform functionality.
            </p>
          </section>

          {/* Children's Privacy */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">10. Children's Privacy</h2>
            <p>
              Kairos is designed for professionals aged 18 and older. We do not knowingly collect personal information from individuals under 18. If we learn we have collected information from a minor, we will delete it promptly.
            </p>
          </section>

          {/* California Privacy Rights */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">11. California Privacy Rights (CCPA)</h2>
            <p className="mb-4">If you are a California resident, you have additional rights under the California Consumer Privacy Act:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Right to know what personal information we collect and how it is used</li>
              <li>Right to delete personal information</li>
              <li>Right to opt-out of the sale of personal information (we do not sell personal information)</li>
              <li>Right to non-discrimination for exercising your privacy rights</li>
            </ul>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Platform and update the "Effective Date" above. Your continued use of the Platform after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* Contact Us */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-4">13. Contact Us</h2>
            <p className="mb-4">
              If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
            </p>
            <p className="mb-2"><strong>Email:</strong> privacy@kairos.me</p>
            <p className="mb-4"><strong>Subject Line:</strong> Privacy Inquiry</p>
            <p>
              We aim to respond to all inquiries within 30 days.
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last Updated: January 12, 2026
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Privacy;
