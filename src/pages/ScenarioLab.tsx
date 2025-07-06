import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import inkMeditationIllustration from "@/assets/ink-meditation-illustration.png";

const ScenarioLab = () => {
  const navigate = useNavigate();
  const [selectedDomain, setSelectedDomain] = useState("");
  const [contextType, setContextType] = useState("");
  const [scenarioContext, setScenarioContext] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);

  const domains = [
    {
      id: "academic-performance",
      title: "Academic Skills",
      description: "Study strategies and test preparation"
    },
    {
      id: "social-dynamics", 
      title: "Social Navigation",
      description: "Friend groups & peer interactions"
    },
    {
      id: "emotional-regulation",
      title: "Stress Management",
      description: "Handle pressure and big emotions"
    },
    {
      id: "communication-skills",
      title: "Communication",
      description: "Express yourself clearly and confidently"
    },
    {
      id: "future-planning",
      title: "Life Planning",
      description: "College prep and career exploration"
    }
  ];

  const contextTypes = {
    "academic-performance": [
      "Big Test Coming Up", 
      "Presentation to Class", 
      "Group Project Drama",
      "College Interview"
    ],
    "social-dynamics": [
      "Friend Group Conflict",
      "Making New Friends", 
      "Dating Situation",
      "Standing Up for Yourself"
    ],
    "emotional-regulation": [
      "Overwhelming Stress",
      "Family Expectations",
      "Social Anxiety"
    ],
    "communication-skills": [
      "Difficult Conversation",
      "Asking for Help",
      "Setting Boundaries"
    ],
    "future-planning": [
      "College Decisions",
      "Career Exploration",
      "Life After Graduation"
    ]
  };

  const handleDomainSelect = (domainId: string) => {
    setSelectedDomain(domainId);
    setContextType(""); // Reset context when domain changes
  };

  const handleContextSelect = (context: string) => {
    setContextType(context);
  };

  const handleStartPractice = () => {
    if (selectedDomain && contextType) {
      navigate('/simulation', { 
        state: { 
          scenarioDomain: selectedDomain,
          contextType: contextType,
          scenarioContext: scenarioContext,
          selectedPersonas: ["Student Mentor"],
          customPersonas: "",
          isVoiceMode: isVoiceMode
        } 
      });
    }
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Minimal Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Scenario Lab
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section - Voice-First Entry */}
      <div className="px-8 py-20 text-center max-w-3xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-16 rounded-full bg-card border border-border overflow-hidden">
          <img 
            src={inkMeditationIllustration} 
            alt="Student preparation"
            className="w-full h-full object-contain p-6 opacity-90"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-4 leading-tight">
          What situation are you preparing for?
        </h2>
        
        <p className="text-lg text-muted-foreground mb-12">
          Practice important conversations and situations in a safe space
        </p>

        {/* Voice Mode Toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <button
            onClick={toggleVoiceMode}
            className={`px-4 py-2 rounded-full text-sm transition-all ${
              isVoiceMode 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
          >
            Voice
          </button>
          <button
            onClick={() => setIsVoiceMode(false)}
            className={`px-4 py-2 rounded-full text-sm transition-all ${
              !isVoiceMode 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-foreground hover:bg-muted/80'
            }`}
          >
            Text
          </button>
        </div>
      </div>

      {/* Domain Selection */}
      <div className="flex-1 px-8 max-w-4xl mx-auto">
        <div className="mb-12">
          <h3 className="text-2xl font-heading font-medium text-foreground mb-8 text-center">
            Select Your Domain
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {domains.map((domain, index) => (
              <article 
                key={domain.id}
                onClick={() => handleDomainSelect(domain.id)}
                className={`group cursor-pointer border border-border rounded-lg p-6 transition-all animate-fade-in ${
                  selectedDomain === domain.id 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-muted-foreground/20 hover:bg-card/50'
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <h4 className={`text-lg font-heading font-medium mb-2 transition-colors ${
                      selectedDomain === domain.id ? 'text-primary' : 'text-foreground group-hover:text-primary'
                    }`}>
                      {domain.title}
                    </h4>
                    
                    <p className="text-sm text-muted-foreground leading-relaxed font-body">
                      {domain.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Context Type Selection */}
        {selectedDomain && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-xl font-heading font-medium text-foreground mb-6 text-center">
              Choose Scenario
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {contextTypes[selectedDomain as keyof typeof contextTypes]?.map((context, index) => (
                <button
                  key={context}
                  onClick={() => handleContextSelect(context)}
                  className={`p-3 rounded-lg border text-center transition-all animate-fade-in text-sm ${
                    contextType === context
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {context}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Context Input */}
        {contextType && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-lg font-heading font-medium text-foreground mb-3">
              Context
            </h3>
            <textarea
              value={scenarioContext}
              onChange={(e) => setScenarioContext(e.target.value)}
              placeholder="Add specific details to make this rehearsal realistic..."
              className="w-full min-h-[100px] p-4 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none text-sm"
            />
          </div>
        )}

        {/* Start Practice Button */}
        {contextType && (
          <div className="py-12 text-center animate-fade-in">
            <div className="w-16 h-px bg-border mx-auto mb-8"></div>
            <Button 
              onClick={handleStartPractice}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-16 py-6 text-xl font-body rounded-full shadow-lg"
            >
              Begin Rehearsal
            </Button>
            <p className="text-sm text-muted-foreground mt-4 font-body">
              {isVoiceMode ? "Voice-first simulation" : "Text-based practice"}
            </p>
          </div>
        )}
      </div>

      <MainNavigation />
    </div>
  );
};

export default ScenarioLab;