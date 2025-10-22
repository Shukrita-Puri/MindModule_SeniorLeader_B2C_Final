import { useState } from "react";
import { ArrowLeft, Calendar, Check, Download, BookOpen, Target, Lightbulb, RefreshCw, Plus } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import ModeDial from "@/components/ModeDial";
import MainNavigation from "@/components/MainNavigation";

interface CraftSection {
  title: string;
  icon: any;
  content: string;
  actionSteps?: string[];
  examples?: string[];
}

const ClaritySummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useScrollToTop(); // Scroll to top when this page loads
  const messages = location.state?.messages || [];
  
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [customRitual, setCustomRitual] = useState("");

  // Student-focused C.R.A.F.T summary
  const craftSummary: CraftSection[] = [
    {
      title: "Context",
      icon: BookOpen,
      content: "Today I felt overwhelmed about balancing college applications, maintaining my GPA, and still having time for friends...",
    },
    {
      title: "Reflection", 
      icon: Lightbulb,
      content: "I realized I'm putting pressure on myself to be perfect at everything. My fear of disappointing my parents is making me say yes to too many commitments.",
    },
    {
      title: "Action",
      icon: Target,
      content: "Small steps you can take this week:",
      actionSteps: [
        "Take 3 deep breaths before answering any new commitment requests",
        "Block 2 hours Sunday evening for weekly planning and reflection",
        "Write down your top 3 priorities and keep them visible on your desk",
        "Have an honest conversation with parents about realistic expectations"
      ]
    },
    {
      title: "Frameworks",
      icon: BookOpen,
      content: "Resources saved from our conversation:",
      examples: [
        "The Eisenhower Matrix for Priority Management",
        "Stanford's 'Design Your Life' approach to decision-making",
        "Cal Newport's 'Deep Work' strategies for focused study time",
        "Brené Brown on perfectionism and vulnerability"
      ]
    },
    {
      title: "Transformation",
      icon: RefreshCw,
      content: "Choose what will help these insights stick:",
      actionSteps: [
        "Set a daily 5-minute morning intention ritual before school",
        "Weekly check-in with a trusted friend or mentor",
        "Monthly review of goals and progress in your journal",
        "Create seasonal goals that align with your school calendar"
      ]
    }
  ];

  const handleActionToggle = (action: string) => {
    setSelectedActions(prev => 
      prev.includes(action) 
        ? prev.filter(a => a !== action)
        : [...prev, action]
    );
  };

  const handleSetReminders = () => {
    console.log("Setting reminders for:", selectedActions);
    if (customRitual) {
      console.log("Custom ritual:", customRitual);
    }
    navigate("/clarity");
  };

  const handleNewConversation = () => {
    navigate("/clarity");
  };

  const handleDownload = () => {
    console.log("Downloading clarity summary...");
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-body pb-32">
      {/* Minimal Header */}
      <div className="flex items-center bg-background p-4 justify-between border-b border-border">
        <button
          onClick={() => navigate("/clarity")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </button>
        <h2 className="text-lg font-heading font-medium text-foreground">Your Clarity Journey</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 px-6 sm:px-8 max-w-4xl mx-auto w-full">
        {/* Hero Section */}
        <div className="py-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-heading font-medium text-foreground mb-4 leading-tight">
            Your Session Summary
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Here's what we discovered together, organized to help you move forward with clarity and confidence.
          </p>
        </div>

        {/* Download Action */}
        <div className="mb-8 flex justify-center">
          <Button 
            onClick={handleDownload}
            variant="outline"
            className="flex items-center gap-2 text-sm"
          >
            <Download size={16} />
            Save Summary
          </Button>
        </div>

        {/* C.R.A.F.T Summary - Card Layout */}
        <div className="space-y-8 mb-12">
          {craftSummary.map((section, index) => (
            <Card key={index} className="border border-border shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <section.icon size={16} className="text-primary" />
                  </div>
                  <h3 className="text-xl font-heading font-medium text-foreground">
                    {section.title}
                  </h3>
                </div>
                
                <div className="space-y-6">
                  <p className="text-foreground leading-relaxed font-body text-base">
                    {section.content}
                  </p>
                  
                  {section.actionSteps && (
                    <div className="space-y-4">
                      {section.actionSteps.map((action, actionIndex) => (
                        <label key={actionIndex} className="flex items-start gap-4 cursor-pointer group p-3 rounded-lg hover:bg-muted/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedActions.includes(action)}
                            onChange={() => handleActionToggle(action)}
                            className="w-5 h-5 text-primary rounded focus:ring-primary accent-primary mt-0.5 flex-shrink-0"
                          />
                          <span className="text-sm text-foreground leading-relaxed group-hover:text-primary transition-colors">
                            {action}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {section.examples && (
                    <div className="space-y-3">
                      {section.examples.map((example, exampleIndex) => (
                        <div key={exampleIndex} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                          <BookOpen size={14} className="text-primary flex-shrink-0" />
                          <span className="text-sm text-foreground">{example}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Your Own Ritual */}
        <Card className="border border-border shadow-sm mb-8">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <Plus size={16} className="text-accent" />
              </div>
              <h3 className="text-xl font-heading font-medium text-foreground">
                Add Your Own
              </h3>
            </div>
            
            <p className="text-muted-foreground mb-4 text-sm">
              Write your own ritual, habit, or insight from our conversation that you'd like to remember:
            </p>
            
            <Textarea
              placeholder="e.g., 'When I feel anxious about college apps, I'll remind myself that my worth isn't defined by acceptances...'"
              value={customRitual}
              onChange={(e) => setCustomRitual(e.target.value)}
              className="w-full min-h-[80px] border-input focus:border-primary text-sm leading-relaxed"
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-4 mb-8">
          {/* Set Reminders */}
          {(selectedActions.length > 0 || customRitual.trim()) && (
            <Card className="border border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Calendar className="text-primary" size={20} />
                  <h3 className="text-lg font-heading font-medium text-foreground">Set Calendar Reminders</h3>
                </div>
                
                {selectedActions.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-3">Selected actions:</p>
                    <div className="space-y-2">
                      {selectedActions.map((action, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm text-foreground">
                          <Check size={14} className="text-primary flex-shrink-0" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <Button 
                  onClick={handleSetReminders}
                  className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Calendar size={16} className="mr-2" />
                  Set Reminders
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Next Steps */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button 
              onClick={handleNewConversation}
              variant="outline"
              className="flex-1 border-border text-foreground hover:bg-muted"
            >
              New Conversation
            </Button>
            <Button 
              onClick={() => navigate("/mind-vault")}
              variant="secondary"
              className="flex-1"
            >
              Save to Library
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClaritySummary;