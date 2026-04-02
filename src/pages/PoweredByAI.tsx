import { useNavigate } from 'react-router-dom';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';

const PoweredByAI = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar hideCoach />
      <div className="container max-w-4xl mx-auto px-4 pt-20 pb-12">
        <h1 className="text-4xl font-headline text-foreground mb-2">Powered by AI</h1>
        <p className="text-muted-foreground mb-8">AI Transparency Disclosure – Last Updated: March 18, 2026</p>
        
        <div className="space-y-8 text-foreground/80 font-body">

          <section>
            <p className="mb-4">
              Mind Module ("we," "our," or "us") is committed to transparency about how artificial intelligence is used within our Service. This page explains which AI services power our features, what data is processed, and the safeguards we have in place.
            </p>
          </section>

          {/* 1. AI Services We Use */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">1. AI Services We Use</h2>
            <p className="mb-4">
              Mind Module integrates with <strong>Lovable's AI</strong>, which provides access to <strong>Google Gemini</strong> models for all AI-powered functionality within our platform.
            </p>
            <p className="mb-4">Specifically, we use:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Google Gemini</strong> (via Lovable AI gateway) – for natural language understanding, contextual coaching responses, pattern analysis, and personalised content generation</li>
            </ul>
            <p>
              All AI requests are routed through Lovable's AI infrastructure, which acts as a secure gateway to Google Gemini. No direct API calls are made from the client application to Google's services.
            </p>
          </section>

          {/* 2. What AI Powers */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">2. Features Powered by AI</h2>
            <p className="mb-4">The following features within Mind Module are powered by AI:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>AI Self-Mastery Coach</strong> – Real-time conversational coaching that adapts to your context, patterns, and goals</li>
              <li><strong>Daily Brief &amp; Energy Insights</strong> – AI-generated summaries of your decision readiness state based on check-in data, calendar context, and wearable signals</li>
              <li><strong>Proactive Mastery Plan</strong> – Personalised practice recommendations generated based on your performance profile and behavioural patterns</li>
              <li><strong>State Pattern Analysis</strong> – AI-driven identification of recurring patterns in your energy, clarity, and confidence over time</li>
              <li><strong>Nudge Recommendations</strong> – Context-aware micro-interventions timed to your schedule and state</li>
              <li><strong>Daily Check-In Insights</strong> – Contextual interpretation of your self-reported states</li>
              <li><strong>Tiny Wins Analysis</strong> – AI-powered reflection and categorisation of daily achievements</li>
            </ul>
          </section>

          {/* 3. How AI Processing Works */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">3. How AI Processing Works</h2>
            <p className="mb-4">
              All AI processing happens <strong>server-side</strong> via secure backend functions. The client application does not make direct calls to any AI service.
            </p>
            <p className="mb-4">The typical flow is:</p>
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              <li>Your app sends a request to our secure backend (e.g., when you open the AI Coach or complete a check-in)</li>
              <li>The backend assembles relevant context from your profile, recent check-ins, and optional integrations</li>
              <li>This context is sent to Google Gemini via Lovable's AI gateway</li>
              <li>The AI generates a response, which is returned to your app</li>
            </ol>
            <p>
              AI responses are generated in real-time and are not pre-written or scripted.
            </p>
          </section>

          {/* 4. Data Sent to AI */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">4. Data Sent to AI Services</h2>
            <p className="mb-4">
              We send <strong>anonymised and contextual data</strong> to the AI service to generate personalised responses. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Energy scores, clarity levels, and confidence ratings from your check-ins</li>
              <li>Check-in outcomes and state tags (e.g., "power-up," "pause," "presence")</li>
              <li>Calendar metadata (event titles, meeting density, time pressure) – if you have connected your calendar</li>
              <li>Practice history and completion records</li>
              <li>Conversation history within the current AI Coach session</li>
              <li>Your professional role and performance profile (as provided during onboarding)</li>
            </ul>
            <p className="mb-4"><strong>We never send the following to AI services:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>Your email address or password</li>
              <li>Payment or financial information</li>
              <li>Raw authentication tokens</li>
              <li>Full calendar event details beyond titles and timing</li>
              <li>Data from other users</li>
            </ul>
          </section>

          {/* 5. AI Limitations and Disclaimers */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">5. AI Limitations and Disclaimers</h2>
            <p className="mb-4"><strong>Important:</strong></p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>The AI Coach is <strong>not</strong> a licensed therapist, psychologist, psychiatrist, counsellor, or medical professional</li>
              <li>AI-generated content is for <strong>professional development and performance optimisation only</strong></li>
              <li>The Service does <strong>not</strong> provide medical advice, mental health treatment, diagnosis, or therapy</li>
              <li>AI responses may occasionally be inaccurate, incomplete, or unsuitable for your specific circumstances</li>
              <li>You are solely responsible for your own decisions and actions</li>
              <li><strong>If you are experiencing a medical or mental health emergency, contact emergency services immediately</strong></li>
            </ul>
          </section>

          {/* 6. Human Oversight */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">6. Human Oversight</h2>
            <p className="mb-4">
              AI-generated responses are <strong>not</strong> reviewed by humans in real-time. However:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li>If you report an issue or concern, our team will review the relevant interaction</li>
              <li>We regularly audit AI behaviour and outputs to ensure quality and safety</li>
              <li>Safety guardrails are built into prompts to prevent harmful or inappropriate responses</li>
              <li>The AI is instructed to recommend professional help when conversations indicate clinical-level concerns</li>
            </ul>
          </section>

          {/* 7. User Control */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">7. Your Control Over AI Features</h2>
            <p className="mb-4">You have control over how AI is used with your data:</p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><strong>Conversation history</strong> – Your AI Coach conversations are stored for continuity; you can request deletion at any time</li>
              <li><strong>Calendar integration</strong> – Optional; you can connect or disconnect Google Calendar at any time via settings</li>
              <li><strong>Wearable integration</strong> – Optional; you can grant or revoke Apple HealthKit access via iOS Settings</li>
              <li><strong>Account deletion</strong> – Deleting your account removes all stored data, including AI conversation history</li>
            </ul>
          </section>

          {/* 8. Data Security */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">8. Data Security</h2>
            <p className="mb-4">
              All communication between our application and AI services is encrypted using <strong>TLS 1.3</strong>. Sensitive data stored in our database is encrypted at rest using <strong>AES-256-GCM</strong>.
            </p>
            <p>
              For full details on our security practices, see our <button onClick={() => navigate('/privacy')} className="text-primary underline">Privacy Policy</button>.
            </p>
          </section>

          {/* 9. Third-Party AI Policies */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">9. Third-Party AI Policies</h2>
            <p className="mb-4">
              For more information about how the underlying AI services handle data:
            </p>
            <ul className="list-disc pl-6 space-y-2 mb-4">
              <li><a href="https://ai.google/responsibility/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google AI Principles</a></li>
              <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Privacy Policy</a></li>
              <li><a href="https://policies.google.com/terms/generative-ai" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google Generative AI Terms</a></li>
            </ul>
          </section>

          {/* 10. Contact Us */}
          <section>
            <h2 className="text-2xl font-subheadline text-foreground mb-3">10. Contact Us</h2>
            <p className="mb-4">
              If you have questions about how AI is used in Mind Module, or wish to exercise any of your data rights:
            </p>
            <p>
              <a href="mailto:contact@mindmodule.me" className="text-primary underline">contact@mindmodule.me</a>
            </p>
          </section>

          <div className="pt-8 mt-8 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Last Updated: March 18, 2026
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/privacy')}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy →
              </button>
              <span className="text-muted-foreground/40 text-sm">·</span>
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
    </div>
  );
};

export default PoweredByAI;
