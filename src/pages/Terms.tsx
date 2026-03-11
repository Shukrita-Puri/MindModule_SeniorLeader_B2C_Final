import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Terms of Use</h1>
        <p className="text-muted-foreground mb-8">Effective Date: March 11, 2026</p>
        
        <div className="space-y-8 text-foreground/80 font-body">

          {/* 1. Agreement */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">1. Agreement to Terms</h2>
            <p className="mb-4">
              These Terms of Use ("Terms") govern your access to and use of the Mind Module iOS application and website at mindmodule.me (collectively, the "Platform"), operated by Mind Module ("we," "our," or "us").
            </p>
            <p>
              By creating an account or using the Platform you agree to these Terms. If you do not agree, do not use the Platform.
            </p>
          </section>

          {/* 2. Eligibility */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years old to use Mind Module. By using the Platform you represent that you meet this age requirement.
            </p>
          </section>

          {/* 3. Platform Description */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">3. Description of the Platform</h2>
            <p className="mb-4">
              Mind Module is a proactive performance and self-mastery system built for leaders. The Platform includes the following features:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Emotional &amp; Cognitive Check-In:</strong> A daily self-assessment of your energy balance, emotional state, and contextual factors</li>
              <li><strong>Clarity &amp; Confidence Check-In:</strong> A daily self-assessment of mental clarity and confidence levels</li>
              <li><strong>Daily Brief:</strong> A personalised morning summary based on your check-in data, calendar context, and wearable signals</li>
              <li><strong>Proactive Mastery Plan:</strong> A dynamically generated plan of practices and focus areas tailored to your current state</li>
              <li><strong>Self Mastery Coach:</strong> An AI-powered conversational coaching feature (see Section 8 for important disclaimers)</li>
              <li><strong>Recalibrate Studio:</strong> Guided practices, micro-exercises, and soundscapes for recalibration, clarity, and renewal</li>
              <li><strong>Insights ("Your Inner World"):</strong> Pattern analytics and progress tracking across all dimensions of your performance profile</li>
              <li><strong>Just-In-Time Prep:</strong> Context-aware preparation prompts before high-stakes events</li>
              <li><strong>Achievements &amp; Certificates:</strong> Recognition for milestones including shareable digital certificates</li>
            </ul>
          </section>

          {/* 4. Accounts */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">4. Your Account</h2>
            <p className="mb-4">You agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information during registration</li>
              <li>Maintain the security of your account credentials</li>
              <li>Not share your account with others</li>
              <li>Notify us immediately of any unauthorised access at <a href="mailto:support@mindmodule.me" className="text-primary underline">support@mindmodule.me</a></li>
            </ul>
            <p className="mt-4">
              You are responsible for all activity that occurs under your account.
            </p>
          </section>

          {/* 5. Subscriptions & Payment */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">5. Subscriptions and Payment</h2>
            <p className="mb-4">Mind Module offers the following subscription plans:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Monthly Pro:</strong> $29 per month, billed monthly</li>
              <li><strong>Annual Pro:</strong> $24 per month, billed annually at $289 per year</li>
            </ul>
            <p className="mb-4">
              All payments are processed by <strong>Stripe</strong>. By subscribing you authorise Stripe to charge your selected payment method on a recurring basis. Subscriptions automatically renew unless cancelled before the end of the current billing period.
            </p>
            <p className="mb-4">
              You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period — you retain access until then.
            </p>
            <p>
              Refund requests are handled on a case-by-case basis. Contact <a href="mailto:billing@mindmodule.me" className="text-primary underline">billing@mindmodule.me</a> for billing enquiries.
            </p>
          </section>

          {/* 6. Beta Access */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">6. Beta Access</h2>
            <p>
              Beta invitations grant 30 days of full Platform access from the date of invitation. After the beta period expires, you will need an active subscription to continue using premium features. Beta access may be revoked at our discretion.
            </p>
          </section>

          {/* 7. Referral Programme */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">7. Referral Programme</h2>
            <p className="mb-4">
              Mind Module offers a referral programme for active subscribers:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You earn 1 month of free subscription credit for each referred user who activates a paid subscription</li>
              <li>A maximum of 6 referral credits may be earned per 90-day rolling period</li>
              <li>Referral credits are applied to your next billing cycle and are non-transferable and non-refundable</li>
              <li>We reserve the right to modify or discontinue the referral programme at any time with notice</li>
            </ul>
          </section>

          {/* 8. AI Disclaimer */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">8. AI Features and Medical Disclaimer</h2>
            <p className="mb-4">
              <strong>The Self Mastery Coach is powered by artificial intelligence (Google Gemini). It is not a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional.</strong>
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>AI coaching does not constitute medical advice, mental health treatment, diagnosis, or therapy</li>
              <li>The Platform is designed for general wellness, personal development, and professional performance</li>
              <li>If you are experiencing a medical or mental health emergency, contact emergency services immediately</li>
              <li>Always seek the advice of qualified healthcare providers regarding medical or mental health concerns</li>
              <li>Do not use Mind Module as a substitute for professional medical or psychological care</li>
            </ul>
            <p>
              AI-generated content may occasionally be inaccurate, incomplete, or not suitable for your specific circumstances. You are responsible for your own decisions and actions.
            </p>
          </section>

          {/* 9. Third-Party Integrations */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">9. Third-Party Integrations</h2>
            <p className="mb-4">
              Mind Module integrates with the following third-party services at your discretion:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Google Calendar:</strong> Read-only access (<code>calendar.readonly</code> scope) to provide calendar-aware coaching and schedule context. Mind Module does not create, modify, or delete calendar events.</li>
              <li><strong>Apple HealthKit (iOS):</strong> Read-only access to heart rate variability (HRV), resting heart rate, sleep data, and activity data. Mind Module does not write data to HealthKit.</li>
              <li><strong>Google OAuth (via Auth0):</strong> Used for sign-in only. Scopes limited to <code>openid</code>, <code>profile</code>, and <code>email</code>.</li>
            </ul>
            <p className="mb-4">
              Your use of third-party integrations is subject to those services' own terms and privacy policies. You may disconnect any integration at any time through account settings or device settings.
            </p>
            <p>
              We are not responsible for the availability, accuracy, or practices of third-party services.
            </p>
          </section>

          {/* 10. Acceptable Use */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">10. Acceptable Use</h2>
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Attempt to gain unauthorised access to any part of the Platform</li>
              <li>Reverse-engineer, decompile, or disassemble any part of the Platform</li>
              <li>Use automated systems (bots, scrapers) to access the Platform</li>
              <li>Impersonate another person or misrepresent your affiliation</li>
              <li>Interfere with or disrupt the Platform or its infrastructure</li>
              <li>Use the AI coaching feature to generate content that is harmful, illegal, or violates others' rights</li>
            </ul>
          </section>

          {/* 11. Intellectual Property */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">11. Intellectual Property</h2>
            <p className="mb-4">
              All content, features, and functionality of Mind Module — including text, graphics, logos, icons, audio, software, practice frameworks, assessment methodologies, and the Inner World Profile system — are the exclusive property of Mind Module and are protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p>
              You retain ownership of any personal content you submit (e.g. coaching conversation text, check-in responses). By using the Platform, you grant us a limited licence to process and store this content for the purpose of providing the service.
            </p>
          </section>

          {/* 12. Limitation of Liability */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">12. Limitation of Liability</h2>
            <p className="mb-4">
              To the maximum extent permitted by applicable law, Mind Module and its affiliates, officers, directors, and employees shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your use of or inability to use the Platform</li>
              <li>Any AI-generated content or coaching recommendations</li>
              <li>Unauthorised access to or alteration of your data</li>
              <li>Any third-party integration failures or data inaccuracies</li>
              <li>Any decisions you make based on information from the Platform</li>
            </ul>
          </section>

          {/* 13. Termination */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">13. Termination</h2>
            <p className="mb-4">
              We may suspend or terminate your account and access to the Platform:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>For violations of these Terms</li>
              <li>For conduct we deem harmful to other users or the Platform</li>
              <li>Upon your request</li>
            </ul>
            <p>
              You may delete your account at any time by contacting <a href="mailto:support@mindmodule.me" className="text-primary underline">support@mindmodule.me</a>. Upon account deletion, we will remove your personal data in accordance with our <a href="/privacy" className="text-primary underline">Privacy Policy</a>.
            </p>
          </section>

          {/* 14. Governing Law */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">14. Governing Law and Disputes</h2>
            <p className="mb-4">
              These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.
            </p>
            <p>
              Nothing in these Terms limits any mandatory consumer protection rights you may have under the laws of your country of residence, including rights under EU, UK, US, MENA, or APAC consumer protection regulations.
            </p>
          </section>

          {/* 15. Changes */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">15. Changes to These Terms</h2>
            <p>
              We may modify these Terms at any time. We will notify you of material changes by email or through the Platform and update the Effective Date above. Your continued use of the Platform after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          {/* 16. Contact */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">16. Contact Us</h2>
            <p className="mb-4">For questions about these Terms:</p>
            <ul className="list-none space-y-1">
              <li><strong>Terms enquiries:</strong> <a href="mailto:termsofuse@mindmodule.me" className="text-primary underline">termsofuse@mindmodule.me</a></li>
              <li><strong>Billing:</strong> <a href="mailto:billing@mindmodule.me" className="text-primary underline">billing@mindmodule.me</a></li>
              <li><strong>Support:</strong> <a href="mailto:support@mindmodule.me" className="text-primary underline">support@mindmodule.me</a></li>
              <li><strong>General:</strong> <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></li>
            </ul>
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

export default Terms;
