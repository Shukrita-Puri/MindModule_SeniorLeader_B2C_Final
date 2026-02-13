import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-8">Terms of Service</h1>
        
        <div className="space-y-6 text-foreground/80 font-body">
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Acceptance of Terms</h2>
            <p>
              By accessing and using Mind Module, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Description of Service</h2>
            <p className="mb-4">
              Mind Module provides a mental fitness platform that includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Daily check-ins and energy state tracking</li>
              <li>Guided practices and meditation sessions</li>
              <li>Mental fitness assessments and insights</li>
              <li>Integration with calendar and wearable devices</li>
              <li>Personalized recommendations and interventions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">User Responsibilities</h2>
            <p className="mb-4">You agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Use the service in compliance with all applicable laws</li>
              <li>Not misuse or attempt to gain unauthorized access to the service</li>
              <li>Not share your account with others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Medical Disclaimer</h2>
            <p className="mb-4">
              <strong>Important:</strong> Mind Module is a mental fitness and wellness tool, not a medical device or mental health treatment service.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Our services do not constitute medical advice, diagnosis, or treatment</li>
              <li>The platform is designed for general wellness and personal development</li>
              <li>If you are experiencing a medical or mental health emergency, please contact emergency services immediately</li>
              <li>Always seek the advice of qualified healthcare providers regarding any medical or mental health concerns</li>
              <li>Do not use Mind Module as a substitute for professional medical care</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Subscription and Payment</h2>
            <p className="mb-4">
              Some features of Mind Module require a paid subscription. By subscribing:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You authorize us to charge your payment method on a recurring basis</li>
              <li>Subscriptions automatically renew unless cancelled</li>
              <li>You can cancel your subscription at any time through account settings</li>
              <li>Refunds are handled on a case-by-case basis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Intellectual Property</h2>
            <p>
              All content, features, and functionality of Mind Module, including but not limited to text, graphics, logos, and software, are the exclusive property of Mind Module and are protected by copyright, trademark, and other intellectual property laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Third-Party Integrations</h2>
            <p className="mb-4">
              Mind Module may integrate with third-party services (Google Calendar, Oura, etc.). Your use of these integrations is subject to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>The terms and policies of those third-party services</li>
              <li>Your explicit consent to connect these services</li>
              <li>The permissions you grant to Mind Module</li>
            </ul>
            <p className="mt-4">
              You may disconnect third-party integrations at any time through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Limitation of Liability</h2>
            <p>
              Mind Module and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service, even if we have been advised of the possibility of such damages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Termination</h2>
            <p className="mb-4">
              We reserve the right to terminate or suspend your account and access to the service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>For violations of these terms</li>
              <li>For conduct that we deem harmful to other users or the service</li>
              <li>Upon your request</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Changes to Terms</h2>
            <p>
              We may modify these terms at any time. We will notify you of any material changes by posting the new terms on this page and updating the "Last Updated" date. Your continued use of the service after changes constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Governing Law</h2>
            <p>
              These terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Contact Information</h2>
            <p>
              For questions about these Terms of Service, please contact us at support@mindmodule.me
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last Updated: November 23, 2025
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Terms;
