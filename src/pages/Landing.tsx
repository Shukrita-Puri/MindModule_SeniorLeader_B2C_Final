
import { useState } from "react";
import { Brain, Target, Users, Heart, CheckCircle, ArrowRight, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import vibrantLandingHero from "@/assets/vibrant-landing-hero.png";

const Landing = () => {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleWaitlistSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setIsSubmitted(true);
    toast({
      title: "You're on the waitlist!",
      description: "We'll notify you when Mind Module launches.",
    });
    
    console.log("Waitlist signup:", email);
  };

  const features = [
    {
      icon: Brain,
      title: "AI-Powered Clarity",
      description: "Get personalized insights and guidance from your context-aware cognitive co-pilot"
    },
    {
      icon: Target,
      title: "Future Visioning",
      description: "Visualize and plan your ideal future with guided visualization techniques"
    },
    {
      icon: Users,
      title: "Scenario Practice", 
      description: "Rehearse difficult conversations and strategies before they happen"
    },
    {
      icon: Heart,
      title: "Emotional Mastery",
      description: "Access grounding exercises and breathwork for immediate support"
    }
  ];

  const benefits = [
    "Private, context-based cognitive support",
    "Smart nudges based on your patterns",
    "Integrated breathwork and grounding",
    "Memory vault for insights storage",
    "Executive-level decision making support"
  ];

  return (
    <div className="min-h-screen bg-white font-manrope">
      {/* Header */}
      <header className="px-4 py-6 border-b border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-8 h-8 text-hyper-coral" />
            <span className="text-xl font-bold text-black">Mind Module</span>
          </div>
          <Button variant="outline" size="sm" className="border-gray-300 text-gray-700 hover:bg-gray-50">
            <Mail className="w-4 h-4 mr-2" />
            Contact
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-4 py-20 bg-gradient-to-br from-gray-50 via-white to-gray-100">
        <div className="max-w-6xl mx-auto text-center">
          {/* Hero Visual */}
          <div className="w-64 h-64 mx-auto mb-12 rounded-lg overflow-hidden shadow-2xl">
            <img 
              src={vibrantLandingHero}
              alt="Mind Module - Cognitive Empowerment"
              className="w-full h-full object-cover"
            />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-black mb-6 leading-tight">
            Your Private
            <span className="text-hyper-coral block">Cognitive Co-pilot</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Mind Module is an AI-powered cognitive companion that provides context-aware guidance for mental clarity, decision making, and emotional mastery.
          </p>
          
          {!isSubmitted ? (
            <form onSubmit={handleWaitlistSignup} className="max-w-md mx-auto mb-8">
              <div className="flex gap-3">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 h-12 text-lg border-gray-300"
                />
                <Button type="submit" size="lg" className="h-12 px-8 bg-hyper-coral hover:bg-red-600 text-white">
                  Join Waitlist
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </form>
          ) : (
            <div className="max-w-md mx-auto mb-8 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-center gap-2 text-black">
                <CheckCircle className="w-5 h-5 text-hyper-coral" />
                <span className="font-medium">You're on the waitlist!</span>
              </div>
            </div>
          )}
          
          <p className="text-sm text-gray-500">
            🚀 Launching Q2 2025 • Be among the first 1000 users
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-black mb-6">
              Four Powerful Modes
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Each mode is designed to support different aspects of your mental and emotional well-being
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center p-6 rounded-xl hover:bg-gray-50 transition-colors">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-8 h-8 text-hyper-coral" />
                </div>
                <h3 className="text-xl font-bold text-black mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-4 py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-black mb-6">
              Why Mind Module?
            </h2>
            <p className="text-xl text-gray-600">
              Built for executives and professionals who need intelligent, private support
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-hyper-coral mt-0.5 flex-shrink-0" />
                  <span className="text-lg text-gray-700">{benefit}</span>
                </div>
              ))}
            </div>
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
              <blockquote className="text-lg text-gray-700 italic mb-4">
                "Finally, a tool that understands the complexity of executive decision-making and provides personalized support when I need it most."
              </blockquote>
              <cite className="text-sm text-gray-500">- Early Beta User</cite>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Transform Your Mental Clarity?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join the waitlist and be among the first to experience the future of cognitive support.
          </p>
          
          {!isSubmitted && (
            <form onSubmit={handleWaitlistSignup} className="max-w-md mx-auto">
              <div className="flex gap-3">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="flex-1 h-12 text-lg bg-white border-gray-300"
                />
                <Button type="submit" size="lg" className="h-12 px-8 bg-hyper-coral hover:bg-red-600 text-white">
                  Join Waitlist
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 bg-gray-900">
        <div className="max-w-6xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Brain className="w-6 h-6 text-hyper-coral" />
            <span className="text-lg font-bold text-white">Mind Module</span>
          </div>
          <p className="text-gray-400 mb-4">
            Your Private Cognitive Co-pilot for Mental Clarity and Decision Making
          </p>
          <p className="text-sm text-gray-500">
            © 2025 Mind Module. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
