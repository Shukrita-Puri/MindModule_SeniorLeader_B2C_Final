import { useState } from "react";
import { ArrowLeft, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import vibrantFocusIllustration from "@/assets/ink-focus-illustration.png";
import { Progress } from "@/components/ui/progress";

type FlowStep = 'hero' | 'choose-task' | 'choose-duration' | 'technique-selected' | 'session' | 'reflect';

const FlowStateLab = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<FlowStep>('hero');
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedSubtask, setSelectedSubtask] = useState("");
  const [duration, setDuration] = useState(0);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [ambientSound, setAmbientSound] = useState(false);

  const taskCategories = [
    {
      id: "academic-work",
      title: "Academic Work",
      subtasks: ["Essay Writing", "Math Problem Sets", "Reading & Analysis", "Test Preparation", "Research Projects"]
    },
    {
      id: "creative-projects", 
      title: "Creative Projects",
      subtasks: ["Art & Design", "Creative Writing", "Music Practice", "Video Creation", "Photography"]
    },
    {
      id: "skill-development",
      title: "Skill Development", 
      subtasks: ["Language Learning", "Coding Practice", "Instrument Mastery", "Sport Training", "Public Speaking"]
    },
    {
      id: "planning-organizing",
      title: "Planning & Organizing",
      subtasks: ["College Applications", "Schedule Planning", "Room Organization", "Goal Setting", "Project Planning"]
    }
  ];

  const getFlowTechnique = () => {
    if (duration <= 30) return { name: "Focus Sprint", rationale: "Short bursts maximize attention for quick wins" };
    if (duration <= 60) return { name: "Pomodoro Method", rationale: "Classic 25-min cycles with strategic breaks" };
    return { name: "Deep Work", rationale: "Extended focus periods for complex thinking" };
  };

  const getStepProgress = () => {
    const steps = ['hero', 'choose-task', 'choose-duration', 'technique-selected', 'session', 'reflect'];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'hero':
        return (
          <div className="text-center animate-fade-in">
            <div className="w-32 h-32 mx-auto mb-8 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
              <img 
                src={vibrantFocusIllustration} 
                alt="Focus and flow state"
                className="w-full h-full object-cover"
              />
            </div>
            
            <h1 className="text-4xl font-heading font-medium text-foreground mb-4 leading-tight">
              The Focus Tuner: Enter Your Flow State
            </h1>
            
            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Train your focus. Master your mind. Unlock your peak performance.
            </p>

            <Button 
              onClick={() => setCurrentStep('choose-task')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg font-medium rounded-full shadow-lg"
            >
              Begin Guided Session
            </Button>
          </div>
        );

      case 'choose-task':
        return (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-12 text-center">
              Choose What You'll Master Today
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {taskCategories.map((category) => (
                <div key={category.id} className="border border-border rounded-lg p-6 transition-all hover:border-primary/50">
                  <button
                    onClick={() => {
                      setSelectedTask(category.id);
                      if (!selectedSubtask) return; // Wait for subtask selection
                    }}
                    className={`w-full text-left mb-4 ${
                      selectedTask === category.id ? 'text-primary' : 'text-foreground hover:text-primary'
                    }`}
                  >
                    <h3 className="text-xl font-heading font-medium mb-2">{category.title}</h3>
                  </button>
                  
                  <div className="grid grid-cols-1 gap-2">
                    {category.subtasks.map((subtask) => (
                      <button
                        key={subtask}
                        onClick={() => {
                          setSelectedTask(category.id);
                          setSelectedSubtask(subtask);
                        }}
                        className={`text-left px-3 py-2 rounded text-sm transition-all ${
                          selectedTask === category.id && selectedSubtask === subtask
                            ? 'bg-primary/10 text-primary border border-primary/20'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {subtask}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedTask && selectedSubtask && (
              <div className="text-center animate-fade-in">
                <Button 
                  onClick={() => setCurrentStep('choose-duration')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
                >
                  Next: Choose Duration →
                </Button>
              </div>
            )}
          </div>
        );

      case 'choose-duration':
        return (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-12 text-center">
              Choose Your Focus Duration
            </h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              {[25, 45, 60, 90].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDuration(mins)}
                  className={`p-6 rounded-lg border text-center transition-all ${
                    duration === mins
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <div className="text-3xl font-heading font-bold mb-2">{mins}</div>
                  <div className="text-sm text-muted-foreground">minutes</div>
                </button>
              ))}
            </div>

            {duration > 0 && (
              <div className="text-center animate-fade-in">
                <Button 
                  onClick={() => setCurrentStep('technique-selected')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
                >
                  Next: See Your Technique →
                </Button>
              </div>
            )}
          </div>
        );

      case 'technique-selected':
        const technique = getFlowTechnique();
        return (
          <div className="animate-fade-in text-center">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-8">
              Your Ideal Flow Technique
            </h2>
            
            <div className="bg-card/50 rounded-lg p-8 mb-8 max-w-2xl mx-auto border border-primary/20">
              <h3 className="text-2xl font-heading font-medium text-primary mb-4">
                {technique.name}
              </h3>
              <p className="text-lg text-muted-foreground mb-6">
                {technique.rationale}
              </p>
              <p className="text-sm text-muted-foreground">
                We chose {technique.name} for your {selectedSubtask} + {duration} min session.
              </p>
            </div>

            <Button 
              onClick={() => setCurrentStep('session')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg rounded-full"
            >
              Start Guided Session
            </Button>
          </div>
        );

      case 'session':
        return (
          <div className="animate-fade-in text-center">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-8">
              Focus Session Active
            </h2>
            
            <div className="max-w-md mx-auto mb-12">
              <div className="text-6xl font-heading font-bold text-primary mb-4">
                {Math.floor(sessionTimer / 60)}:{(sessionTimer % 60).toString().padStart(2, '0')}
              </div>
              <Progress value={(sessionTimer / (duration * 60)) * 100} className="mb-6" />
              <p className="text-lg text-muted-foreground">
                {selectedSubtask} • {getFlowTechnique().name}
              </p>
            </div>

            <div className="flex justify-center gap-4 mb-8">
              <Button 
                onClick={() => setIsSessionActive(!isSessionActive)}
                variant={isSessionActive ? "secondary" : "default"}
                className="px-6 py-3"
              >
                <Play size={20} className="mr-2" />
                {isSessionActive ? 'Pause' : 'Start'}
              </Button>
              
              <Button 
                onClick={() => setAmbientSound(!ambientSound)}
                variant="outline"
                className="px-6 py-3"
              >
                <Volume2 size={20} className="mr-2" />
                {ambientSound ? 'Sound On' : 'Sound Off'}
              </Button>
            </div>

            <Button 
              onClick={() => setCurrentStep('reflect')}
              variant="outline"
              className="px-8 py-3 rounded-full"
            >
              End Session
            </Button>
          </div>
        );

      case 'reflect':
        return (
          <div className="animate-fade-in">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-12 text-center">
              Session Complete
            </h2>
            
            <div className="max-w-2xl mx-auto space-y-8">
              <div>
                <h3 className="text-lg font-heading font-medium text-foreground mb-4">
                  How focused were you?
                </h3>
                <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      className="w-12 h-12 rounded-full border border-border hover:border-primary hover:bg-primary/10 transition-all"
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-heading font-medium text-foreground mb-4">
                  Did you complete your goal?
                </h3>
                <div className="flex justify-center gap-4">
                  <Button variant="outline" className="px-8">Yes</Button>
                  <Button variant="outline" className="px-8">No</Button>
                </div>
              </div>

              <div className="text-center">
                <Button 
                  onClick={() => navigate('/index')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 rounded-full"
                >
                  Log This Session
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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

      {/* Progress Bar */}
      {currentStep !== 'hero' && (
        <div className="px-8 pt-6">
          <Progress value={getStepProgress()} className="mb-4" />
          <p className="text-sm text-muted-foreground text-center">
            Step {['hero', 'choose-task', 'choose-duration', 'technique-selected', 'session', 'reflect'].indexOf(currentStep)} of 5
          </p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 px-8 py-16 max-w-4xl mx-auto">
        {renderCurrentStep()}
      </div>

      <MainNavigation />
    </div>
  );
};

export default FlowStateLab;