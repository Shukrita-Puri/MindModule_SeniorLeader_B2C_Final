import { useNavigate } from 'react-router-dom';
import ProfilePageLayout from '@/components/profile/ProfilePageLayout';
import PageSeo from '@/components/PageSeo';
import { isIosNativeShell } from '@/config/purchasePlatform';

const H2_CLS = "text-[17px] sm:text-[15px] sm:text-lg font-body text-foreground mb-3";
const H3_CLS = "text-[15px] sm:text-lg font-body text-foreground mb-2 mt-4";

const Terms = () => {
  const navigate = useNavigate();
  return (
    <ProfilePageLayout contentClassName="container max-w-4xl">
      <PageSeo
        title="Terms of Use — Mind Module"
        description="The terms that govern your access to and use of the Mind Module mental performance OS."
        path="/terms"
      />
      <h1 className="text-[28px] font-headline font-semibold text-foreground mb-2">Terms of Use</h1>
      <p className="text-muted-foreground mb-8">Effective Date: June 29, 2026 · Last Updated: June 29, 2026</p>

      <div className="space-y-8 text-foreground/80 font-body">
        <section>
          <h2 className={H2_CLS}>1. Agreement to Terms</h2>
          <p className="mb-4">
            These Terms of Use ("Terms") govern your access to and use of the Mind Module mobile application and website at mindmodule.me (collectively, the "Service"), operated by Mind Module ("we," "our," or "us"). By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.
          </p>
          <p>
            This application is distributed through the Apple App Store. Your use of the app is also subject to Apple's Licensed Application End User License Agreement (Standard EULA), available at <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener noreferrer" className="text-primary underline">https://www.apple.com/legal/internet-services/itunes/dev/stdeula/</a>, which applies in addition to these Terms.
          </p>
        </section>

        <section>
          <h2 className={H2_CLS}>2. Eligibility</h2>
          <p>You must be at least 18 years old to use the Service. By using the Service, you represent that you meet this age requirement and have the legal capacity to enter into this agreement.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>3. Description of the Service</h2>
          <p className="mb-4">
            Mind Module is a performance and readiness platform designed for executives and leaders. The Service provides a daily Performance Readiness Brief, a Mental Readiness Score, a Proactive Mastery Plan (including mindset, somatic, and recovery self-regulation protocols), Performance Patterns insights, and Smart Nudges, generated using your connected calendar and wearable/health data together with AI-powered analysis.
          </p>
          <p className="mb-4">
            <strong>The Service is designed around connected data sources.</strong> Full functionality depends on connecting at least one supported calendar provider and at least one supported wearable or health data provider, as described in Section 10. You choose which provider to connect in each category.
          </p>
          <p>Specific features and functionality may change from time to time at our discretion.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>4. Account Registration and Security</h2>
          <p>
            You agree to: provide accurate and complete information during registration; maintain the security of your account credentials; not share your account with others; and notify us immediately of any unauthorised access at <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>. You are responsible for all activity under your account.
          </p>
        </section>

        <section>
          <h2 className={H2_CLS}>5. Subscriptions and Payment</h2>

          <h3 className={H3_CLS}>5.1 Subscription Plans</h3>
          <p className="mb-4">Mind Module Pro is offered as a monthly plan and an annual plan, billed on a recurring basis.</p>
          <p className="mb-4">
            The exact price, currency and billing period that apply to you are always shown before you
            confirm a purchase: on the checkout page when you subscribe on the web, and on the in-app
            subscription screen and Apple's confirmation sheet when you subscribe through the App Store.
            Prices are localised to your region and store, so no price is stated here.
          </p>

          <h3 className={H3_CLS}>5.2 Free Trial</h3>
          <p className="mb-4">
            New subscribers receive a <strong>7-day free trial</strong>. Your free trial begins on the date you subscribe. Unless you cancel before the end of the 7-day trial period, your subscription will automatically convert to a paid plan at the end of the trial, and your selected payment method will be charged the applicable subscription price. You will not receive a separate notification that your trial is ending. You can cancel your trial at any time before it ends via account settings (or via your Apple ID subscription settings if you subscribed through the App Store) to avoid being charged.
          </p>

          <h3 className={H3_CLS}>5.3 Billing and Renewals</h3>
          <p className="mb-4">
            {isIosNativeShell() ? (
              <>Subscriptions are processed by Apple and billed to your Apple ID. Your subscription automatically renews at the end of each billing period at the price shown at purchase, unless cancelled at least 24 hours before the renewal date through your Apple ID subscription settings.</>
            ) : (
              <>Web subscriptions are processed by Stripe; by subscribing you authorise Stripe to charge your selected payment method on a recurring basis. Subscriptions purchased in the iOS app are processed by Apple and billed to your Apple ID. In both cases the subscription automatically renews at the end of each billing period at the price shown at purchase, unless cancelled at least 24 hours before the renewal date.</>
            )}
          </p>

          <h3 className={H3_CLS}>5.4 Cancellation and Refunds</h3>
          <p className="mb-4">You may cancel your subscription at any time via account settings, or via your Apple ID subscription settings if you subscribed through the App Store. Cancellation takes effect at the end of the current billing period — you retain access until then.</p>
          <p className="mb-4">Refunds are handled on a case-by-case basis and, where you subscribed via the App Store, may be subject to Apple's refund policies. Contact <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a> for billing enquiries.</p>

          <h3 className={H3_CLS}>5.5 Price Changes</h3>
          <p>We may change subscription prices with 30 days' advance notice. Price changes apply to renewals after the notice period. You may cancel before the new price takes effect.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>6. Beta Access</h2>
          <p>Beta access may be granted at our discretion for a limited time. Beta features are provided "as-is" without warranty. Beta access may be revoked at any time.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>7. Referral Programme</h2>
          <p>Mind Module may offer a referral programme for subscribers. We reserve the right to modify or discontinue the programme at any time.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>8. AI-Powered Features and Professional Disclaimer</h2>
          <p className="mb-4">
            The Service includes AI-powered features that generate your Brief, Plan, and related insights using third-party artificial intelligence infrastructure. For full detail on how AI is used, see our <button onClick={() => navigate('/powered-by-ai')} className="text-primary underline">AI Transparency Disclosure</button>.
          </p>
          <p className="mb-4"><strong>Important Disclaimers:</strong></p>
          <ul className="list-disc pl-6 space-y-2">
            <li>The Service is not, and does not include, a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional.</li>
            <li>The Service does not provide medical advice, mental health treatment, diagnosis, or therapy.</li>
            <li>The Service is designed for professional and executive performance optimisation only.</li>
            <li>If you are experiencing a medical or mental health emergency, contact emergency services immediately.</li>
            <li>AI-generated content may be inaccurate, incomplete, or unsuitable for your specific circumstances. You are solely responsible for your decisions and actions.</li>
          </ul>
        </section>

        <section>
          <h2 className={H2_CLS}>9. Health and Medical Disclaimer</h2>
          <p>
            Mind Module is <strong>NOT</strong> a health application, medical device, or diagnostic tool. The Service does not diagnose, treat, cure, or prevent any disease or medical condition, does not provide medical advice, and is not intended for use in medical emergencies or as a substitute for professional healthcare. Wearable and health data (heart rate variability, resting heart rate, heart rate, sleep data) is used for performance and readiness context only, not for medical purposes.
          </p>
        </section>

        <section>
          <h2 className={H2_CLS}>10. Third-Party Integrations</h2>
          <p className="mb-4">The Service integrates with the following third-party platforms, at your choice:</p>
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li><strong>Calendar providers:</strong> Google Calendar, Microsoft Calendar/Outlook, or Apple Calendar (read-only access, for scheduling context — you choose which to connect)</li>
            <li><strong>Wearable and health data providers:</strong> Apple Health/HealthKit, Oura, or other providers we may support from time to time (read-only access, for wearable/health context — you choose which to connect)</li>
            <li><strong>Authentication providers:</strong> Google, LinkedIn</li>
          </ul>
          <p className="mb-4">
            <strong>Connecting at least one calendar provider and one wearable/health provider is necessary for the Service to function as designed.</strong> You may use the Service with only one category connected, or neither, but doing so will significantly limit the Brief, Plan, and Performance Patterns features.
          </p>
          <p className="mb-4">
            The Service may also analyse publicly available professional information about your meeting participants to generate contextual meeting briefings and personalise your Brief and Plan. We do not build or sell profiles about third parties, and this information is processed only to provide you with the requested briefing context. See our <button onClick={() => navigate('/privacy')} className="text-primary underline">Privacy Policy</button> §1.4 for full detail.
          </p>
          <p>Your use of third-party integrations is subject to those services' own terms and privacy policies. You may disconnect integrations at any time via account settings or device settings. We are not responsible for the availability, accuracy, or practices of third-party services.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>11. Acceptable Use</h2>
          <p>You agree not to: use the Service for unlawful purposes; attempt to gain unauthorised access to any part of the Service; reverse-engineer, decompile, or disassemble the Service; use automated systems (bots, scrapers) to access the Service; impersonate others or misrepresent your affiliation; interfere with or disrupt the Service or its infrastructure; or use the Service to generate harmful, illegal, or abusive content. Violation of these terms may result in immediate account suspension or termination.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>12. Intellectual Property</h2>
          <p>All content, features, and functionality of the Service — including software, text, graphics, logos, methodologies, and assessment frameworks — are the exclusive property of Mind Module and are protected by applicable intellectual property laws. You retain ownership of your personal content (e.g., assessment responses, check-in data). By using the Service, you grant us a limited, non-exclusive licence to process and store this content solely for the purpose of providing the Service.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>13. Disclaimers and Limitation of Liability</h2>

          <h3 className={H3_CLS}>13.1 Service Provided "As-Is"</h3>
          <p className="mb-4">The Service is provided on an "as-is" and "as-available" basis without warranties of any kind, whether express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free; that AI-generated content will be accurate, complete, or suitable for your needs; or that third-party integrations will function without interruption.</p>

          <h3 className={H3_CLS}>13.2 Limitation of Liability</h3>
          <p className="mb-4">To the maximum extent permitted by law, Mind Module shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service, AI-generated content, third-party integration failures, unauthorised access to your data, or any decisions or actions you take based on the Service.</p>
          <p className="mb-4"><strong>Maximum Liability:</strong> Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.</p>

          <h3 className={H3_CLS}>13.3 Jurisdictional Variations</h3>
          <p>Some jurisdictions do not allow exclusions of certain warranties or limitations of liability. In such cases, our liability is limited to the maximum extent permitted by law.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>14. Indemnification</h2>
          <p>You agree to indemnify, defend, and hold harmless Mind Module and its affiliates from any claims, liabilities, damages, losses, and expenses (including legal fees) arising from your use of the Service, your violation of these Terms, your violation of any third-party rights, or your content submitted to the Service.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>15. Termination</h2>
          <p>We may suspend or terminate your account at any time for violations of these Terms, conduct harmful to other users or the Service, or non-payment of fees. You may delete your account at any time by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>. Upon termination, we will delete your personal data in accordance with our Privacy Policy, except where retention is required by law. No refunds will be issued for partial subscription periods upon termination, except as required by Apple's App Store policies where applicable.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>16. Governing Law and Dispute Resolution</h2>
          <p>These Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales. Nothing in these Terms limits any mandatory consumer protection rights you may have under the laws of your country of residence.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>17. Changes to These Terms</h2>
          <p>We may modify these Terms at any time. Material changes will be communicated via email or in-app notification at least 30 days before the effective date. Continued use after changes constitutes acceptance.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>18. Miscellaneous</h2>
          <p>These Terms, together with our Privacy Policy and AI Transparency Disclosure, constitute the entire agreement between you and Mind Module. If any provision is found invalid or unenforceable, the remaining provisions remain in effect. Our failure to enforce any provision does not constitute a waiver. You may not assign these Terms without our prior written consent. We are not liable for failures due to circumstances beyond our reasonable control.</p>
        </section>

        <section>
          <h2 className={H2_CLS}>19. Contact Us</h2>
          <p className="mb-4">For questions about these Terms:</p>
          <p><a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></p>
        </section>

        <div className="pt-8 mt-8 border-t border-border flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Last Updated: June 29, 2026</p>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/privacy')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy →</button>
            <span className="text-muted-foreground/40 text-sm">·</span>
            <button onClick={() => navigate('/powered-by-ai')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Powered by AI →</button>
          </div>
        </div>
      </div>
    </ProfilePageLayout>
  );
};

export default Terms;
