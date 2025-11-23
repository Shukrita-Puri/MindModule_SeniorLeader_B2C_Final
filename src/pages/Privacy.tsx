import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-headline text-foreground mb-8">Privacy Policy</h1>
        
        <div className="space-y-6 text-foreground/80 font-body">
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Information We Collect</h2>
            <p className="mb-4">
              Mind Module collects information that you provide directly to us when using our mental fitness platform. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account information (name, email address)</li>
              <li>Profile information and preferences</li>
              <li>Check-in data and mental fitness assessments</li>
              <li>Practice session data and progress tracking</li>
              <li>Calendar events (when you choose to connect your calendar)</li>
              <li>Wearable device data (when you choose to connect devices like Oura)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">How We Use Your Information</h2>
            <p className="mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and personalize our mental fitness services</li>
              <li>Generate insights and recommendations based on your patterns</li>
              <li>Track your progress and mental fitness journey</li>
              <li>Improve and optimize our platform</li>
              <li>Communicate with you about your account and our services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your personal information. Your data is encrypted both in transit and at rest. We use secure authentication methods and regularly update our security practices to ensure your information remains protected.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Third-Party Integrations</h2>
            <p className="mb-4">
              When you choose to connect third-party services (like Google Calendar or Oura), we only access the data necessary to provide our services. We do not sell or share your personal information with third parties for their marketing purposes.
            </p>
            <p>
              Connected services include:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Google Calendar (for event density analysis)</li>
              <li>Oura Ring (for physiological data insights)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal information</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Opt out of certain data collection</li>
              <li>Export your data</li>
              <li>Disconnect third-party integrations at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide you services. You can request deletion of your account and associated data at any time through your account settings.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Children's Privacy</h2>
            <p>
              Our services are not intended for users under the age of 18. We do not knowingly collect personal information from children under 18.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at privacy@mindmodule.me
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

export default Privacy;
