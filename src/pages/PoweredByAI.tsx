import { useNavigate } from 'react-router-dom';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';
import PageSeo from '@/components/PageSeo';

const H2_CLS = "text-[17px] sm:text-xl font-body text-foreground mb-3";
const H3_CLS = "text-[15px] sm:text-lg font-body text-foreground mb-2 mt-4";

const PoweredByAI = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-transparent">
      <PageSeo
        title="Powered by AI — Mind Module"
        description="How Mind Module uses AI to power executive brief, plan, and coach features, and the safeguards in place."
        path="/powered-by-ai"
      />
      <UnifiedTopBar hideCoach />
      <div className="container max-w-4xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-[22px] sm:text-3xl font-headline text-foreground mb-2">Powered by AI</h1>
        <p className="text-muted-foreground mb-8">AI Transparency Disclosure — Last Updated: June 29, 2026</p>

        <div className="space-y-8 text-foreground/80 font-body">

          <section>
            <p>
              Mind Module ("we," "our," or "us") is committed to transparency about how artificial intelligence is used within our Service. This page explains which AI services power our features, what data is processed, and the safeguards we have in place.
            </p>
          </section>

          <section>
            <h2 className={H2_CLS}>1. AI Services We Use</h2>
            <p className="mb-4">Mind Module integrates with the following AI services:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Google Gemini</strong> (via Lovable's AI gateway) — our primary AI model, used for natural language generation, contextual analysis, pattern recognition, and personalised content generation across the features listed below.</li>
              <li><strong>Anthropic Claude</strong> — used as an additional large language model for natural language generation and contextual analysis, with equivalent data handling, server-side routing, and security safeguards as described in this disclosure.</li>
              <li><strong>Other large language model providers</strong> may be used as a fallback or for specific functions, with equivalent data handling and security safeguards as described in this disclosure.</li>
            </ul>
            <p>All AI requests are routed through a secure server-side backend gateway. No direct API calls are made from the client application to any AI provider.</p>
          </section>

          <section>
            <h2 className={H2_CLS}>2. Features Powered by AI</h2>
            <p className="mb-4">The following features within Mind Module are powered, in whole or in part, by AI:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Performance Readiness Brief</strong> — A daily, AI-generated summary of your readiness state, built from your check-in data, calendar context, and wearable/health signals.</li>
              <li><strong>Mental Readiness Score</strong> — A score derived from a combination of rules-based calculation and AI-assisted analysis of your wearable, calendar, and check-in data.</li>
              <li><strong>Proactive Mastery Plan</strong> — Personalised priority and self-regulation protocol recommendations, generated based on your calendar events, profile, and behavioural patterns.</li>
              <li><strong>Performance Patterns</strong> — AI-assisted identification of recurring patterns in your recovery, workload, focus, and decision quality.</li>
              <li><strong>Smart Nudges</strong> — Context-aware, AI-assisted timing and content of in-app prompts and notifications.</li>
              <li><strong>Daily Check-In Insights</strong> — Contextual interpretation of your self-reported states.</li>
              <li><strong>Attendee Relationship Inference</strong> — AI-assisted identification of the likely professional relationship between you and your meeting attendees, to personalise your Brief and Plan (see Section 4 for full detail).</li>
            </ul>
            <p className="mb-4">
              <strong>Note on reliability and fallback:</strong> In a small number of cases — for example, where an AI response cannot be generated within the required time window, or does not meet our internal quality and safety validation checks — the Service may show a simplified, non-AI-generated message rather than a personalised AI response, rather than show content that has not been properly checked. The Service is designed to prefer no personalised message over an inaccurate one.
            </p>
            <p>
              <strong>Note on conversational coaching:</strong> The Service does not currently include a real-time conversational AI coaching feature. If we introduce one in the future, this disclosure will be updated before that feature becomes available.
            </p>
          </section>

          <section>
            <h2 className={H2_CLS}>3. How AI Processing Works</h2>
            <p className="mb-4">All AI processing happens server-side via secure backend functions. The client application does not make direct calls to any AI service.</p>
            <p className="mb-4">The typical flow is:</p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Your app sends a request to our secure backend (for example, when your daily Brief or Plan is generated, or when you complete a check-in).</li>
              <li>The backend assembles relevant context from your profile, recent check-ins, calendar data, and wearable/health signals.</li>
              <li>This context is sent to the relevant AI provider via our secure backend gateway.</li>
              <li>The AI generates a response, which is validated by our backend safety and quality checks before being returned to your app.</li>
            </ol>
          </section>

          <section>
            <h2 className={H2_CLS}>4. Data Sent to AI Services</h2>

            <h3 className={H3_CLS}>Standard AI features (Brief, Plan, Patterns, Nudges, Check-In Insights)</h3>
            <p className="mb-4">We send the following contextual data to AI services to generate personalised responses:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Readiness scores, sharpness, clarity, and confidence ratings from your check-ins</li>
              <li>Check-in outcomes and state signals</li>
              <li>Calendar metadata (event titles, attendee count, organiser status, meeting timing and density, recurrence) — if you have connected a calendar provider (Google, Microsoft, or Apple Calendar)</li>
              <li>Wearable and health signals (heart rate variability, resting heart rate, heart rate, sleep duration and quality signals, and derived trends) — if you have connected a wearable or health data source (Apple Health/HealthKit, Oura, or another supported provider)</li>
              <li>Practice and plan history and completion records</li>
              <li>Your professional role and performance profile (as provided during onboarding)</li>
            </ul>

            <h3 className={H3_CLS}>Attendee relationship inference — meeting participant analysis</h3>
            <p className="mb-4">To help your Brief and Plan reflect the nature of a meeting, the Service analyses publicly available professional information about your meeting participants to generate contextual meeting briefings. Specifically:</p>
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              <li>For external attendees on your calendar where email-domain-based identification alone is insufficient, the Service retrieves and analyses publicly available professional information about the attendee — information they have made publicly accessible — to determine their likely professional role and seniority.</li>
              <li>This publicly available information is then passed to an AI model, together with context about your own professional role, to infer the likely relationship category (for example: board member, investor, direct report, client, external partner).</li>
              <li>The inferred relationship classification is stored in your account and used to weight the importance of that meeting in your Brief and Plan.</li>
            </ol>
            <p className="mb-2"><strong>Important:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>We do not build or sell profiles about third parties. Information about meeting participants is processed only to provide you with the requested briefing context.</li>
              <li>Only publicly available professional information is used — we do not access private or restricted information about your attendees.</li>
              <li>This processing applies only to <strong>external attendees</strong> on your calendar, is subject to a <strong>daily volume cap</strong>, and is used solely to personalise your Brief and Plan.</li>
              <li>The inferred relationship classification is <strong>never shared with the attendees concerned</strong>, with advertisers, or with any third party for purposes unrelated to the Service.</li>
              <li>You may request deletion of stored attendee relationship inferences by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>.</li>
              <li>The specific sources used to retrieve publicly available professional information may change over time as we improve the reliability and coverage of this feature. The user-facing behaviour — contextual meeting briefings based on publicly available information — will remain consistent regardless of the underlying source.</li>
            </ul>

            <h3 className={H3_CLS}>What we never send to AI services</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your email address or password</li>
              <li>Payment or financial information</li>
              <li>Raw authentication tokens</li>
              <li>Full calendar event descriptions or attendee names and email addresses beyond what is necessary for the attendee-inference flow described above</li>
              <li>Data from other users</li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLS}>5. AI Limitations and Disclaimers</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>The Service is not, and does not include, a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional.</li>
              <li>AI-generated content is for professional and executive performance optimisation only.</li>
              <li>The Service does not provide medical advice, mental health treatment, diagnosis, or therapy.</li>
              <li>AI responses may occasionally be inaccurate, incomplete, or unsuitable for your specific circumstances.</li>
              <li>You are solely responsible for your own decisions and actions.</li>
              <li>If you are experiencing a medical or mental health emergency, contact emergency services immediately.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLS}>6. Human Oversight</h2>
            <p className="mb-4">AI-generated responses are not reviewed by humans in real time. However:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>If you report an issue or concern, our team will review the relevant interaction.</li>
              <li>We regularly audit AI behaviour and outputs to ensure quality and safety.</li>
              <li>Safety guardrails and validation checks are built into our backend. Where a response fails these checks, the Service withholds the personalised output rather than showing content that has not been validated (see Section 2, Note on reliability and fallback).</li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLS}>7. Your Control</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Calendar integration</strong> — You choose which calendar provider to connect and may disconnect at any time via account settings.</li>
              <li><strong>Wearable/health integration</strong> — You choose which provider to connect. You may revoke access at any time via the relevant provider's settings (e.g., iOS Settings &gt; Health &gt; Data Access &amp; Devices for Apple Health) or via Mind Module account settings.</li>
              <li><strong>Attendee inference</strong> — This processing happens automatically for eligible external attendees once a calendar is connected. You may request deletion of stored relationship inferences at any time by contacting <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>.</li>
              <li><strong>Account deletion</strong> — Deleting your account removes all stored data used for AI processing, in accordance with our Privacy Policy.</li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLS}>8. Data Security</h2>
            <p>
              All communication between our application and AI services is encrypted using TLS 1.3. Sensitive data stored in our database — including wearable/health data, calendar data, and attendee relationship inferences — is encrypted at rest using AES-256-GCM. See our <button onClick={() => navigate('/privacy')} className="text-primary underline">Privacy Policy</button> for full detail.
            </p>
          </section>

          <section>
            <h2 className={H2_CLS}>9. Third-Party AI Policies</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><a href="https://ai.google/responsibility/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google AI Principles</a></li>
              <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Privacy Policy</a></li>
              <li><a href="https://policies.google.com/terms/generative-ai" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Generative AI Terms</a></li>
            </ul>
          </section>

          <section>
            <h2 className={H2_CLS}>10. Contact Us</h2>
            <p><a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a></p>
          </section>

          <div className="pt-8 mt-8 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Last Updated: June 29, 2026</p>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/privacy')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy →</button>
              <span className="text-muted-foreground/40 text-sm">·</span>
              <button onClick={() => navigate('/terms')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Use →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoweredByAI;
