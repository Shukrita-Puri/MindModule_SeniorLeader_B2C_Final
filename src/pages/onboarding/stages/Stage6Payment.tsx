import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function Stage6Payment() {
  const navigate = useNavigate();

  const plans = [
    {
      name: "Pro Monthly",
      price: "$40",
      period: "/month",
      features: [
        "Full practice feature",
        "Dialogue Learning",
        "Meta Skill development",
        "Recalibrate (Pause/Flow/Re-energize)",
        "Unlimited scenarios",
        "Cancel anytime"
      ]
    },
    {
      name: "Super Pro Monthly",
      price: "$59",
      period: "/month",
      badge: "MOST POPULAR",
      features: [
        "Everything in Pro",
        "Context Integration (calendar + wearable)",
        "Daily customized homepage",
        "Smart practice timing",
        "Advanced pattern recognition",
        "Cancel anytime"
      ]
    },
    {
      name: "Annual Super Pro",
      price: "$509",
      period: "/year",
      badge: "BEST VALUE",
      subtitle: "Save $199 (just $42/month)",
      features: [
        "Everything in Super Pro Monthly",
        "Priority feature access",
        "Advanced analytics",
        "Lock in rate forever"
      ]
    }
  ];

  return (
    <div className="space-y-8 py-8 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-headline font-bold">Your Baseline is Just the Beginning</h2>
        <p className="text-lg text-muted-foreground">You've seen where you are. Now let's build where you're going.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.map((plan, idx) => (
          <Card key={idx} className={`p-6 relative ${idx === 1 ? 'border-gold border-2' : ''}`}>
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-primary-foreground px-3 py-1 rounded-full text-xs font-bold">
                {plan.badge}
              </div>
            )}
            <h3 className="font-heading font-bold text-xl mb-2">{plan.name}</h3>
            <div className="mb-4">
              <span className="text-3xl font-bold">{plan.price}</span>
              <span className="text-muted-foreground">{plan.period}</span>
              {plan.subtitle && <div className="text-sm text-gold font-semibold mt-1">{plan.subtitle}</div>}
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check size={16} className="text-gold flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button 
              className="w-full" 
              variant={idx === 1 ? "default" : "outline"}
              onClick={() => {
                // Save selected plan
                localStorage.setItem('selectedPlan', plan.name);
                
                // All plans go to context-connection for consistent onboarding flow
                navigate("/onboarding/context-connection");
              }}
            >
              Start {plan.name.split(' ')[0]} Plan
            </Button>
          </Card>
        ))}
      </div>

      <div className="text-center space-y-2 text-sm text-muted-foreground">
        <p>🔒 Secure payment via Stripe</p>
        <p>💯 14-day money-back guarantee</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding/context-connection")}>
          I'll decide later
        </Button>
      </div>
    </div>
  );
}
