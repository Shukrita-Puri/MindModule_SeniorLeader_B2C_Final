import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Terms of Use</h1>
        <p className="text-muted-foreground mb-8">Effective Date: March 11, 2026</p>
        
        <div className="space-y-8 text-foreground/80 font-body">

          {/* 1. Agreement to Terms */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">1. Agreement to Terms</h2>
            <p className="mb-4">
              These Terms of Use ("Terms") govern your access to and use of the Mind Module mobile application and website at mindmodule.me (collectively, the "Service"), operated by Mind Module ("we," "our," or "us").
            </p>
            <p>
              By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
            </p>
          </section>

          {/* 2. Eligibility */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">2. Eligibility</h2>
            <p>
              You must be at least 18 years old to use the Service. By using the Service, you represent that you meet this age requirement and have the legal capacity to enter into this agreement.
            </p>
          </section>

          {/* 3. Description of the Service */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">3. Description of the Service</h2>
            <p className="mb-4">
              Mind Module is a professional development and performance optimisation platform designed for leaders and high-performing professionals. The Service provides AI-powered coaching, self-assessment tools, personalised guidance, progress tracking, and related features.
            </p>
            <p>
              Specific features and functionality may change from time to time at our discretion.
            </p>
          </section>

          {/* 4. Account Registration and Security */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">4. Account Registration and Security</h2>
            <p className="mb-4">You agree to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Provide accurate and complete information during registration</li>
              <li>Maintain the security of your account credentials</li>
              <li>Not share your account with others</li>
              <li>Notify us immediately of any unauthorised access at <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></li>
            </ul>
            <p>
              You are responsible for all activity under your account.
            </p>
          </section>

          {/* 5. Subscriptions and Payment */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">5. Subscriptions and Payment</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">5.1 Subscription Plans</h3>
            <p className="mb-4">Mind Module offers subscription plans billed on a recurring basis:</p>
            
            <p className="mb-2"><strong>United Kingdom & European Union:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Monthly Pro: £29 per month</li>
              <li>Annual Pro: £24 per month, billed annually at £288 per year</li>
            </ul>
            
            <p className="mb-2"><strong>United States & Rest of World:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Monthly Pro: $29 per month</li>
              <li>Annual Pro: $24 per month, billed annually at $288 per year</li>
            </ul>
            <p className="mb-4">Prices are displayed in your local currency where supported.</p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">5.2 Billing and Renewals</h3>
            <p className="mb-4">
              Payments are processed by <strong>Stripe</strong>. By subscribing, you authorise Stripe to charge your selected payment method on a recurring basis. Subscriptions automatically renew unless cancelled before the end of the current billing period.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">5.3 Cancellation and Refunds</h3>
            <p className="mb-4">
              You may cancel your subscription at any time via account settings. Cancellation takes effect at the end of the current billing period — you retain access until then.
            </p>
            <p className="mb-4">
              Refunds are handled on a case-by-case basis. Contact <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a> for billing enquiries.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">5.4 Price Changes</h3>
            <p>
              We may change subscription prices with 30 days' advance notice. Price changes apply to renewals after the notice period. You may cancel before the new price takes effect.
            </p>
          </section>

          {/* 6. Beta Access */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">6. Beta Access</h2>
            <p>
              Beta access may be granted at our discretion for a limited time. Beta features are provided "as-is" without warranty. Beta access may be revoked at any time.
            </p>
          </section>

          {/* 7. Referral Programme */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">7. Referral Programme</h2>
            <p className="mb-4">
              Mind Module may offer a referral programme for subscribers. Full terms are available at <strong>mindmodule.me/referral-terms</strong>. We reserve the right to modify or discontinue the programme at any time.
            </p>
          </section>

          {/* 8. AI Coach and Professional Disclaimer */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">8. AI Coach and Professional Disclaimer</h2>
            <p className="mb-4">
              The Service includes an AI Coach powered by third-party artificial intelligence models.
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
              AI-generated content may be inaccurate, incomplete, or unsuitable for your specific circumstances. You are solely responsible for your decisions and actions.
            </p>
          </section>

          {/* 9. Health and Medical Disclaimer */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">9. Health and Medical Disclaimer</h2>
            <p className="mb-4"><strong>Mind Module is NOT a health application, medical device, or diagnostic tool.</strong></p>
            <p className="mb-4">The Service:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Does not diagnose, treat, cure, or prevent any disease or medical condition</li>
              <li>Does not provide medical advice or replace professional healthcare</li>
              <li>Is not intended for use in medical emergencies</li>
              <li>Should not be relied upon for health-related decisions</li>
            </ul>
            <p className="mb-4">
              If you integrate wearable devices (e.g., Apple Watch), data is used for performance context only, not medical purposes.
            </p>
            <p>
              <strong>If you have health concerns, consult a qualified healthcare professional.</strong>
            </p>
          </section>

          {/* 10. Third-Party Integrations */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">10. Third-Party Integrations</h2>
            <p className="mb-4">The Service may integrate with third-party platforms including:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Google Calendar</strong> (read-only access for scheduling context)</li>
              <li><strong>Apple HealthKit</strong> (read-only access for wearable data)</li>
              <li><strong>Authentication providers</strong> (Google, LinkedIn)</li>
            </ul>
            <p className="mb-4">
              Your use of third-party integrations is subject to those services' terms and privacy policies. You may disconnect integrations at any time via account settings or device settings.
            </p>
            <p>
              We are not responsible for the availability, accuracy, or practices of third-party services.
            </p>
          </section>

          {/* 11. Acceptable Use */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">11. Acceptable Use</h2>
            <p className="mb-4">You agree <strong>not</strong> to:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Use the Service for unlawful purposes</li>
              <li>Attempt to gain unauthorised access to any part of the Service</li>
              <li>Reverse-engineer, decompile, or disassemble the Service</li>
              <li>Use automated systems (bots, scrapers) to access the Service</li>
              <li>Impersonate others or misrepresent your affiliation</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Use the Service to generate harmful, illegal, or abusive content</li>
            </ul>
            <p>
              Violation of these terms may result in immediate account suspension or termination.
            </p>
          </section>

          {/* 12. Intellectual Property */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">12. Intellectual Property</h2>
            <p className="mb-4">
              All content, features, and functionality of the Service — including software, text, graphics, logos, methodologies, and assessment frameworks — are the exclusive property of Mind Module and are protected by copyright, trademark, patent, and other intellectual property laws.
            </p>
            <p>
              You retain ownership of your personal content (e.g., assessment responses, conversation text). By using the Service, you grant us a limited, non-exclusive licence to process and store this content solely for the purpose of providing the Service.
            </p>
          </section>

          {/* 13. Disclaimers and Limitation of Liability */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">13. Disclaimers and Limitation of Liability</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">13.1 Service Provided "As-Is"</h3>
            <p className="mb-4">
              The Service is provided on an "as-is" and "as-available" basis without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, or non-infringement.
            </p>
            <p className="mb-4">We do not warrant that:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>The Service will be uninterrupted, secure, or error-free</li>
              <li>AI-generated content will be accurate, complete, or suitable for your needs</li>
              <li>Third-party integrations will function without interruption</li>
            </ul>

            <h3 className="text-xl font-subheadline text-foreground mb-2">13.2 Limitation of Liability</h3>
            <p className="mb-4">
              To the maximum extent permitted by law, Mind Module and its affiliates, officers, directors, employees, and agents shall <strong>not</strong> be liable for any indirect, incidental, special, consequential, or punitive damages arising from:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Your use of or inability to use the Service</li>
              <li>AI-generated content or recommendations</li>
              <li>Third-party integration failures or data inaccuracies</li>
              <li>Unauthorised access to or alteration of your data</li>
              <li>Any decisions or actions you take based on the Service</li>
            </ul>
            <p className="mb-4">
              <strong>Maximum Liability:</strong> Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">13.3 Essential Purpose</h3>
            <p>
              Some jurisdictions do not allow exclusions of certain warranties or limitations of liability. In such cases, our liability is limited to the maximum extent permitted by law.
            </p>
          </section>

          {/* 14. Indemnification */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">14. Indemnification</h2>
            <p className="mb-4">
              You agree to indemnify, defend, and hold harmless Mind Module and its affiliates from any claims, liabilities, damages, losses, and expenses (including legal fees) arising from:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any third-party rights</li>
              <li>Your content submitted to the Service</li>
            </ul>
          </section>

          {/* 15. Termination */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">15. Termination</h2>
            <p className="mb-4">We may suspend or terminate your account at any time for:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Violations of these Terms</li>
              <li>Conduct harmful to other users or the Service</li>
              <li>Non-payment of fees</li>
            </ul>
            <p className="mb-4">
              You may delete your account at any time by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>. Upon termination, we will delete your personal data in accordance with our Privacy Policy, except where retention is required by law.
            </p>
            <p>
              No refunds will be issued for partial subscription periods upon termination.
            </p>
          </section>

          {/* 16. Governing Law and Dispute Resolution */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">16. Governing Law and Dispute Resolution</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">16.1 Governing Law</h3>
            <p className="mb-4">
              These Terms are governed by the laws of <strong>England and Wales</strong>, without regard to conflict of law principles.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">16.2 Jurisdiction</h3>
            <p className="mb-4">
              Any disputes arising from these Terms or the Service shall be subject to the <strong>exclusive jurisdiction of the courts of England and Wales</strong>.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">16.3 Consumer Rights</h3>
            <p>
              Nothing in these Terms limits any mandatory consumer protection rights you may have under the laws of your country of residence, including rights under EU, UK, US, MENA, or APAC consumer protection regulations.
            </p>
          </section>

          {/* 17. Changes to These Terms */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">17. Changes to These Terms</h2>
            <p className="mb-4">
              We may modify these Terms at any time. Material changes will be communicated via email or in-app notification at least 30 days before the effective date. Your continued use of the Service after changes constitutes acceptance.
            </p>
            <p>
              If you do not agree to the modified Terms, you may cancel your subscription and discontinue use of the Service.
            </p>
          </section>

          {/* 18. Miscellaneous */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">18. Miscellaneous</h2>
            
            <h3 className="text-xl font-subheadline text-foreground mb-2">18.1 Entire Agreement</h3>
            <p className="mb-4">
              These Terms, together with our Privacy Policy and any other legal notices published on the Service, constitute the entire agreement between you and Mind Module.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">18.2 Severability</h3>
            <p className="mb-4">
              If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will remain in full force and effect.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">18.3 Waiver</h3>
            <p className="mb-4">
              Our failure to enforce any provision does not constitute a waiver of that provision or our right to enforce it in the future.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">18.4 Assignment</h3>
            <p className="mb-4">
              You may not assign or transfer these Terms without our prior written consent. We may assign these Terms in connection with a merger, acquisition, or sale of assets.
            </p>

            <h3 className="text-xl font-subheadline text-foreground mb-2">18.5 Force Majeure</h3>
            <p className="mb-4">
              We are not liable for any failure or delay in performance due to circumstances beyond our reasonable control.
            </p>
          </section>

          {/* 19. Contact Us */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">19. Contact Us</h2>
            <p className="mb-4">For questions about these Terms:</p>
            <p>
              <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>
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

export default Terms;
