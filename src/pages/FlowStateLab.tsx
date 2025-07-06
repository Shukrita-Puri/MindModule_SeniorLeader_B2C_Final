import { useState } from "react";
import { ArrowLeft, Timer, Brain, Music, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import vibrantFocusIllustration from "@/assets/ink-focus-illustration.png";

const FlowStateLab = () => {
  const navigate = useNavigate();
  const [selectedTechnique, setSelectedTechnique] = useState("");
  const [duration, setDuration] = useState(25);
  const [focusType, setFocusType] = useState("");

  const flowTechniques = [
    {
      id: "pomodoro-classic",
      title: "Classic Pomodoro",
      description: "25-min focus → 5-min break cycle",
      icon: Timer,
      durations: [25, 45, 60, 90]
    },
    {
      id: "deep-work",
      title: "Deep Work Mode", 
      description: "Extended focus periods with ambient support",
      icon: Brain,
      durations: [60, 90, 120, 180]
    },
    {
      id: "study-sprint",
      title: "Study Sprint",
      description: "High-intensity short bursts",
      icon: Zap,
      durations: [15, 20, 30, 45]
    },
    {
      id: "flow-state",
      title: "Flow State Induction",
      description: "Optimal challenge-skill balance zones",
      icon: Music,
      durations: [45, 60, 90, 120]
    }
  ];

  const focusTypes = [
    {
      id: "academic-focus",
      title: "Academic Work",
      scenarios: ["Math Problem Sets", "Essay Writing", "Reading Comprehension", "Test Prep"]
    },
    {
      id: "creative-focus", 
      title: "Creative Projects",
      scenarios: ["Art/Design", "Creative Writing", "Music Practice", "Brainstorming"]
    },
    {
      id: "skill-building",
      title: "Skill Development", 
      scenarios: ["Language Learning", "Coding Practice", "Instrument Practice", "Sport Training"]
    },
    {
      id: "planning-organizing",
      title: "Planning & Organizing",
      scenarios: ["College Applications", "Schedule Planning", "Room Organization", "Goal Setting"]
    }
  ];

  const handleTechniqueSelect = (techniqueId: string) => {
    setSelectedTechnique(techniqueId);
  };

  const handleStartFlow = () => {
    if (selectedTechnique && focusType) {
      // Instead of scenario lab, navigate to a dedicated flow session
      navigate('/flow-session', { 
        state: { 
          technique: selectedTechnique,
          duration: duration,
          focusType: focusType
        } 
      });
    }
  };

  const selectedTechniqueData = flowTechniques.find(t => t.id === selectedTechnique);

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-24">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/index")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Flow State
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section */}
      <div className="px-8 py-16 text-center max-w-3xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src={vibrantFocusIllustration} 
            alt="Focus and flow state"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-4 leading-tight">
          Focus Tuner
        </h2>
        
        <p className="text-lg text-muted-foreground mb-12">
          Set focus zones with Pomodoro and ambient visuals<br/>
          <span className="text-sm italic">"Study mode: SAT Math / Calm / Lo-fi vibe"</span>
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 px-8 max-w-4xl mx-auto pb-8">
        {/* Technique Selection */}
        <div className="mb-12">
          <h3 className="text-2xl font-heading font-medium text-foreground mb-8 text-center">
            Choose Your Flow Technique
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {flowTechniques.map((technique, index) => (
              <article 
                key={technique.id}
                onClick={() => handleTechniqueSelect(technique.id)}
                className={`group cursor-pointer border border-border rounded-lg p-6 transition-all animate-fade-in ${
                  selectedTechnique === technique.id 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-muted-foreground/20 hover:bg-card/50'
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <technique.icon size={20} className="text-primary" />
                  </div>
                  
                  <div className="flex-1">
                    <h4 className={`text-lg font-heading font-medium mb-2 transition-colors ${
                      selectedTechnique === technique.id ? 'text-primary' : 'text-foreground group-hover:text-primary'
                    }`}>
                      {technique.title}
                    </h4>
                    
                    <p className="text-sm text-muted-foreground leading-relaxed font-body">
                      {technique.description}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Duration Selection */}
        {selectedTechnique && selectedTechniqueData && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-xl font-heading font-medium text-foreground mb-6 text-center">
              Choose Duration
            </h3>
            <div className="grid grid-cols-4 gap-3">
              {selectedTechniqueData.durations.map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDuration(mins)}
                  className={`p-4 rounded-lg border text-center transition-all text-sm ${
                    duration === mins
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <div className="text-2xl font-heading font-bold mb-1">{mins}</div>
                  <div className="text-xs text-muted-foreground">minutes</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Focus Type Selection */}
        {selectedTechnique && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-xl font-heading font-medium text-foreground mb-6 text-center">
              What will you focus on?
            </h3>
            <div className="space-y-4">
              {focusTypes.map((type) => (
                <div key={type.id} className="border border-border rounded-lg p-4">
                  <button
                    onClick={() => setFocusType(type.id)}
                    className={`w-full text-left transition-all ${
                      focusType === type.id ? 'text-primary' : 'text-foreground hover:text-primary'
                    }`}
                  >
                    <h4 className="font-heading font-medium mb-2">{type.title}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {type.scenarios.map((scenario) => (
                        <span 
                          key={scenario}
                          className={`text-xs px-2 py-1 rounded-full border ${
                            focusType === type.id 
                              ? 'border-primary/50 bg-primary/5 text-primary' 
                              : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {scenario}
                        </span>
                      ))}
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start Flow Button */}
        {selectedTechnique && focusType && (
          <div className="py-8 text-center animate-fade-in">
            <Button 
              onClick={handleStartFlow}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-16 py-6 text-xl font-body rounded-full shadow-lg"
            >
              Enter Flow State
            </Button>
            <p className="text-sm text-muted-foreground mt-4 font-body">
              {duration} minute {selectedTechniqueData?.title.toLowerCase()} session
            </p>
          </div>
        )}
      </div>

      <MainNavigation />
    </div>
  );
};

export default FlowStateLab;