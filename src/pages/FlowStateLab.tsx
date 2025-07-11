import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Brain, Timer, Target, ChevronRight, RotateCcw, CheckCircle, Coffee, Cloud, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import ClearBackButton from "@/components/ClearBackButton";
import vibrantFlowTunnel from "@/assets/vibrant-flow-tunnel.png";
import { useToast } from "@/hooks/use-toast";

type FlowStep = 'hero' | 'choose-task' | 'add-context' | 'choose-duration' | 'technique-matched' | 'session-setup' | 'session-active' | 'session-complete' | 'flow-log';

type TaskCategory = {
  id: string;
  title: string;
  emoji: string;
  subtasks: { id: string; name: string; technique: FlowTechnique }[];
};

type FlowTechnique = {
  name: string;
  category: string;
  whatItIs: string;
  whyItWorks: string;
  phases: SessionPhase[];
};

type SessionPhase = {
  name: string;
  duration: number; // in minutes
  description: string;
  guidance?: string;
};

type SessionData = {
  task: string;
  subtask: string;
  context: string;
  duration: number;
  technique: FlowTechnique;
  startTime: Date;
  endTime?: Date;
  rating?: number;
  goalCompleted?: boolean;
  notes?: string;
};

const FlowStateLab = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Core state
  const [currentStep, setCurrentStep] = useState<FlowStep>('hero');
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedSubtask, setSelectedSubtask] = useState("");
  const [userContext, setUserContext] = useState("");
  const [duration, setDuration] = useState(0);
  const [customDuration, setCustomDuration] = useState("");
  
  // Session state
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [phaseTimer, setPhaseTimer] = useState(0);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ambientSound, setAmbientSound] = useState<'rain' | 'cafe' | 'silence'>('silence');
  const [microGoal, setMicroGoal] = useState("");
  
  // Reflection state
  const [focusRating, setFocusRating] = useState(0);
  const [goalCompleted, setGoalCompleted] = useState<boolean | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");

  // Flow techniques database
  const flowTechniques: { [key: string]: FlowTechnique } = {
    'time-block-micro-goal': {
      name: 'Time Block + Micro-Goal Framing',
      category: 'Modern Cognitive Science',
      whatItIs: 'Break your time into focused blocks with one small, clear goal. Use a grounding phrase to begin. No pressure. Just one step.',
      whyItWorks: 'Reduces overwhelm, quiets inner critic, and gives your brain a tangible win to chase. It\'s a recipe for clarity — not chaos.',
      phases: [
        { name: 'Mental Warm-Up', duration: 2, description: 'Close your eyes. Inhale. Say to yourself: "This block has one job."', guidance: 'Breath cue + gentle bell' },
        { name: 'Set Micro Goal', duration: 1, description: 'What\'s one small win you want from this block?' },
        { name: 'Focus Block', duration: 0, description: 'Deep work on your micro goal with progress tracking' },
        { name: 'Reflect', duration: 2, description: 'How did it go? What helped? What\'s next?' }
      ]
    },
    'problem-looping': {
      name: 'Problem Looping',
      category: 'Deliberate Practice + Spaced Repetition',
      whatItIs: 'Solve 3–5 similar problems repeatedly with increasing variation.',
      whyItWorks: 'Builds mastery and pattern recognition; aligns with Hebbian learning principles.',
      phases: [
        { name: 'Pattern Setup', duration: 2, description: 'Select 3-5 related problems to cycle through' },
        { name: 'Loop Cycles', duration: 0, description: 'Repeat problems with increasing complexity' },
        { name: 'Pattern Review', duration: 3, description: 'Identify patterns and consolidate learning' }
      ]
    },
    'active-margin-tagging': {
      name: 'Active Margin Tagging',
      category: 'Socratic Engagement + Active Reading',
      whatItIs: 'Use highlights and symbols (*, !, ?) as you read to engage actively.',
      whyItWorks: 'Keeps the brain processing, not passively consuming; draws on classical dialectic reading.',
      phases: [
        { name: 'Symbol Setup', duration: 1, description: 'Prepare your tagging system: * = key idea, ! = surprise, ? = question' },
        { name: 'Active Reading', duration: 0, description: 'Read with continuous tagging and annotation' },
        { name: 'Tag Review', duration: 2, description: 'Review your tags and synthesize insights' }
      ]
    },
    'retrieval-sprints': {
      name: 'Retrieval Sprints',
      category: 'Neuroscience of Memory',
      whatItIs: 'Practice active recall by writing answers from memory in short bursts.',
      whyItWorks: 'Activates long-term memory and improves learning consolidation.',
      phases: [
        { name: 'Sprint Prep', duration: 1, description: 'Clear space, set timer, prepare materials' },
        { name: 'Recall Sprints', duration: 0, description: 'Fast, low-stakes recall sessions' },
        { name: 'Review & Correct', duration: 2, description: 'Check answers and fill gaps' }
      ]
    },
    'constraint-challenge': {
      name: 'Constraint Challenge',
      category: 'Zen Aesthetic + Design Thinking',
      whatItIs: 'Limit your palette, tools, or time. Create within those limits.',
      whyItWorks: 'Constraints reduce decision fatigue and activate deeper creativity.',
      phases: [
        { name: 'Set Constraints', duration: 2, description: 'Choose 2-3 creative limitations' },
        { name: 'Create Within Limits', duration: 0, description: 'Focus solely on working within constraints' },
        { name: 'Constraint Reflection', duration: 2, description: 'How did limits enhance creativity?' }
      ]
    },
    'timed-freewriting': {
      name: 'Timed Freewriting with Prompt',
      category: 'Journaling + Flow Psychology',
      whatItIs: '10–20 min of uninterrupted writing from a visual, word, or emotion prompt.',
      whyItWorks: 'Reduces self-censorship and enhances expressive freedom.',
      phases: [
        { name: 'Prompt Connection', duration: 1, description: 'Connect with your writing prompt emotionally' },
        { name: 'Free Flow Writing', duration: 0, description: 'Write without stopping or editing' },
        { name: 'Flow Review', duration: 2, description: 'Read through and highlight gems' }
      ]
    }
  };

  // Task categories with matched techniques
  const taskCategories: TaskCategory[] = [
    {
      id: "academic-work",
      title: "Academic Work",
      emoji: "",
      subtasks: [
        { id: "essay-writing", name: "Essay Writing", technique: flowTechniques['time-block-micro-goal'] },
        { id: "math-problems", name: "Math Problem Sets", technique: flowTechniques['problem-looping'] },
        { id: "reading-analysis", name: "Reading & Analysis", technique: flowTechniques['active-margin-tagging'] },
        { id: "test-prep", name: "Test or Exam Preparation", technique: flowTechniques['retrieval-sprints'] },
        { id: "research", name: "Research Projects", technique: flowTechniques['time-block-micro-goal'] }
      ]
    },
    {
      id: "creative-projects",
      title: "Creative Projects", 
      emoji: "",
      subtasks: [
        { id: "art-design", name: "Art & Design", technique: flowTechniques['constraint-challenge'] },
        { id: "creative-writing", name: "Creative Writing", technique: flowTechniques['timed-freewriting'] },
        { id: "music-practice", name: "Music Practice", technique: flowTechniques['problem-looping'] },
        { id: "video-creation", name: "Video Creation", technique: flowTechniques['constraint-challenge'] },
        { id: "photography", name: "Photography", technique: flowTechniques['constraint-challenge'] }
      ]
    },
    {
      id: "skill-development",
      title: "Skill Development",
      emoji: "",
      subtasks: [
        { id: "language-learning", name: "Language Learning", technique: flowTechniques['retrieval-sprints'] },
        { id: "coding-practice", name: "Coding Practice", technique: flowTechniques['problem-looping'] },
        { id: "instrument-mastery", name: "Instrument Mastery", technique: flowTechniques['problem-looping'] },
        { id: "sport-training", name: "Sport Training", technique: flowTechniques['problem-looping'] },
        { id: "public-speaking", name: "Public Speaking", technique: flowTechniques['time-block-micro-goal'] }
      ]
    },
    {
      id: "planning-organizing", 
      title: "Planning & Organizing",
      emoji: "",
      subtasks: [
        { id: "college-apps", name: "College Applications", technique: flowTechniques['time-block-micro-goal'] },
        { id: "schedule-planning", name: "Schedule Planning", technique: flowTechniques['time-block-micro-goal'] },
        { id: "room-organization", name: "Room Organization", technique: flowTechniques['constraint-challenge'] },
        { id: "goal-setting", name: "Goal Setting", technique: flowTechniques['time-block-micro-goal'] },
        { id: "project-planning", name: "Project Planning", technique: flowTechniques['time-block-micro-goal'] }
      ]
    }
  ];

  // Timer effect for session phases
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSessionActive && !isPaused && currentStep === 'session-active' && sessionData) {
      interval = setInterval(() => {
        setPhaseTimer(prev => prev + 1);
        
        // Check if current phase is complete
        const currentPhaseData = sessionData.technique.phases[currentPhase];
        if (currentPhaseData.duration > 0 && phaseTimer >= currentPhaseData.duration * 60) {
          // Move to next phase
          if (currentPhase < sessionData.technique.phases.length - 1) {
            setCurrentPhase(prev => prev + 1);
            setPhaseTimer(0);
            toast({
              title: "Phase Complete!",
              description: `Moving to: ${sessionData.technique.phases[currentPhase + 1].name}`
            });
          } else {
            // Session complete
            setCurrentStep('session-complete');
            setIsSessionActive(false);
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, isPaused, currentStep, sessionData, currentPhase, phaseTimer, toast]);

  const getSelectedTechnique = (): FlowTechnique | null => {
    const category = taskCategories.find(cat => cat.id === selectedTask);
    const subtask = category?.subtasks.find(sub => sub.id === selectedSubtask);
    return subtask?.technique || null;
  };

  const startSession = () => {
    const technique = getSelectedTechnique();
    if (!technique) return;

    const session: SessionData = {
      task: selectedTask,
      subtask: selectedSubtask,
      context: userContext,
      duration: duration,
      technique: technique,
      startTime: new Date()
    };

    setSessionData(session);
    setCurrentPhase(0);
    setPhaseTimer(0);
    setCurrentStep('session-setup');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStepProgress = () => {
    const steps = ['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'];
    return ((steps.indexOf(currentStep) + 1) / steps.length) * 100;
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'hero':
        return (
          <div className="text-center animate-fade-in">
            <div className="w-48 h-48 mx-auto mb-8 rounded-full overflow-hidden shadow-2xl border-4 border-primary/20">
              <img 
                src={vibrantFlowTunnel} 
                alt="Vibrant flow tunnel visualization"
                className="w-full h-full object-cover"
              />
            </div>
            
            <h1 className="text-5xl font-heading font-medium text-foreground mb-6 leading-tight">
              Dial into your Flow state
            </h1>
            
            <p className="text-xl text-muted-foreground mb-12 max-w-3xl mx-auto">
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
            <h2 className="text-4xl font-heading font-medium text-foreground mb-4 text-center">
              Step 1: Choose What You'll Master Today
            </h2>
            <p className="text-lg text-muted-foreground mb-12 text-center max-w-3xl mx-auto">
              Pick the kind of activity you're doing right now. This helps us match you with a flow technique designed for exactly that.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {taskCategories.map((category) => (
                <Card key={category.id} className={`cursor-pointer transition-all hover:border-primary/50 ${
                  selectedTask === category.id ? 'border-primary bg-primary/5' : ''
                }`}>
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-3 text-xl">
                      {category.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-2">
                      {category.subtasks.map((subtask) => (
                        <button
                          key={subtask.id}
                          onClick={() => {
                            setSelectedTask(category.id);
                            setSelectedSubtask(subtask.id);
                          }}
                          className={`text-left px-3 py-2 rounded text-sm transition-all ${
                            selectedTask === category.id && selectedSubtask === subtask.id
                              ? 'bg-primary/20 text-primary border border-primary/30'
                              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {subtask.name}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {selectedTask && selectedSubtask && (
              <div className="text-center animate-fade-in">
                <Button 
                  onClick={() => setCurrentStep('add-context')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
                >
                  Next: Add Context <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        );

      case 'add-context':
        return (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-4 text-center">
              Step 2: Add Context (Optional)
            </h2>
            <p className="text-lg text-muted-foreground mb-8 text-center">
              Tell us more about what you're working on — or let us auto-sense it.
            </p>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  I'm working on...
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="e.g., 'Editing my college essay draft' / 'Practicing French vocab' / 'Organizing my room before guests arrive'"
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  className="min-h-[100px] mb-4"
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Auto-fill based on task selection
                    const category = taskCategories.find(cat => cat.id === selectedTask);
                    const subtask = category?.subtasks.find(sub => sub.id === selectedSubtask);
                    if (subtask) {
                      setUserContext(`Working on ${subtask.name.toLowerCase()} session`);
                    }
                  }}
                >
                  Use Current Life Context
                </Button>
              </CardContent>
            </Card>

            <div className="text-center">
              <Button 
                onClick={() => setCurrentStep('choose-duration')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
              >
                Next: Choose Duration <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </div>
        );

      case 'choose-duration':
        return (
          <div className="animate-fade-in">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-4 text-center">
              Step 3: Choose Your Time Commitment
            </h2>
            <p className="text-lg text-muted-foreground mb-12 text-center">
              We'll match your attention span with the right flow pattern.
            </p>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { mins: 15, label: "Quick Win" },
                { mins: 25, label: "Classic Pomodoro" },
                { mins: 45, label: "Deep Focus" },
                { mins: 90, label: "Full Immersion" }
              ].map(({ mins, label }) => (
                <Card
                  key={mins}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${
                    duration === mins ? 'border-primary bg-primary/5' : ''
                  }`}
                  onClick={() => setDuration(mins)}
                >
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-heading font-bold mb-2">{mins}</div>
                    <div className="text-sm text-muted-foreground mb-1">minutes</div>
                    <div className="text-xs text-primary font-medium">({label})</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="max-w-md mx-auto mb-8">
              <CardContent className="p-6">
                <div className="text-center mb-4">
                  <span className="text-lg">Custom Duration</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Minutes"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      const mins = parseInt(customDuration);
                      if (mins > 0) setDuration(mins);
                    }}
                  >
                    Set
                  </Button>
                </div>
              </CardContent>
            </Card>

            {duration > 0 && (
              <div className="text-center animate-fade-in">
                <Button 
                  onClick={() => setCurrentStep('technique-matched')}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
                >
                  Next: See Your Technique <ChevronRight className="ml-2 w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        );

      case 'technique-matched':
        const technique = getSelectedTechnique();
        if (!technique) return null;

        return (
          <div className="animate-fade-in max-w-4xl mx-auto">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-4 text-center">
              Step 4: Your Matched Flow Technique
            </h2>
            <p className="text-lg text-muted-foreground mb-8 text-center">
              Based on your task, context, and time, here's the technique we recommend:
            </p>
            
            <Card className="mb-8 border-primary/20 bg-primary/5">
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Brain className="w-8 h-8 text-primary" />
                  <div>
                    <CardTitle className="text-2xl text-primary">
                      Technique: {technique.name}
                    </CardTitle>
                    <CardDescription className="text-lg">
                      ({taskCategories.find(cat => cat.id === selectedTask)?.subtasks.find(sub => sub.id === selectedSubtask)?.name}, {duration} min — "{userContext || 'Ready to focus'}")
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="w-fit">
                  {technique.category}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2">What It Is:</h4>
                    <p className="text-muted-foreground">{technique.whatItIs}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Why It Works:</h4>
                    <p className="text-muted-foreground">{technique.whyItWorks}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center">
              <Button 
                onClick={startSession}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg rounded-full"
              >
                Step 5: Start Your Guided Flow Session
              </Button>
            </div>
          </div>
        );

      case 'session-setup':
        if (!sessionData) return null;

        return (
          <div className="animate-fade-in max-w-3xl mx-auto">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-8 text-center">
              Your Session Plan
            </h2>
            
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Timer className="w-6 h-6" />
                  {sessionData.duration} Minutes | {taskCategories.find(cat => cat.id === sessionData.task)?.subtasks.find(sub => sub.id === sessionData.subtask)?.name}
                </CardTitle>
                <CardDescription>
                  Technique: {sessionData.technique.name}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Ready? Let's Begin:</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {sessionData.technique.phases.map((phase, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{phase.name}</div>
                        <div className="text-sm text-muted-foreground">{phase.description}</div>
                        {phase.guidance && (
                          <div className="text-xs text-primary mt-1">{phase.guidance}</div>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {phase.duration > 0 ? `${phase.duration} min` : 'Main block'}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Ambient sound selection */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Volume2 className="w-5 h-5" />
                  Background Audio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3">
                  {[
                    { id: 'silence', label: 'Silence', icon: VolumeX },
                    { id: 'rain', label: 'Rain', icon: Cloud },
                    { id: 'cafe', label: 'Cafe', icon: Coffee }
                  ].map(({ id, label, icon: Icon }) => (
                    <Button
                      key={id}
                      variant={ambientSound === id ? 'default' : 'outline'}
                      onClick={() => setAmbientSound(id as any)}
                      className="flex items-center gap-2"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="text-center">
              <Button 
                onClick={() => {
                  setCurrentStep('session-active');
                  setIsSessionActive(true);
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 text-lg rounded-full"
              >
                Start Session
              </Button>
            </div>
          </div>
        );

      case 'session-active':
        if (!sessionData) return null;

        const currentPhaseData = sessionData.technique.phases[currentPhase];
        const isMainBlock = currentPhaseData.duration === 0;
        const totalPhaseTime = isMainBlock ? (sessionData.duration - sessionData.technique.phases.reduce((acc, p) => acc + p.duration, 0)) * 60 : currentPhaseData.duration * 60;
        const progress = totalPhaseTime > 0 ? (phaseTimer / totalPhaseTime) * 100 : 0;

        return (
          <div className="animate-fade-in text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-heading font-medium text-foreground mb-8">
              Focus Session Active
            </h2>
            
            {/* Current phase indicator */}
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Target className="w-6 h-6 text-primary" />
                  <span className="text-xl font-medium">Phase {currentPhase + 1}: {currentPhaseData.name}</span>
                </div>
                <p className="text-muted-foreground mb-4">{currentPhaseData.description}</p>
                
                {/* Timer display */}
                <div className="text-6xl font-heading font-bold text-primary mb-4">
                  {formatTime(phaseTimer)}
                </div>
                
                {/* Progress bar */}
                <Progress value={progress} className="mb-4" />
                
                <p className="text-sm text-muted-foreground">
                  {isMainBlock ? `Main focus block • ${sessionData.duration - sessionData.technique.phases.reduce((acc, p) => acc + p.duration, 0)} minutes` : 
                   `${currentPhaseData.duration} minute phase`}
                </p>
              </CardContent>
            </Card>

            {/* Micro goal input for main block */}
            {isMainBlock && currentPhase === sessionData.technique.phases.findIndex(p => p.duration === 0) && !microGoal && (
              <Card className="mb-8">
                <CardHeader>
                  <CardTitle>Set Your Micro Goal</CardTitle>
                  <CardDescription>What's one small win you want from this block?</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">Example suggestions:</div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedSubtask === 'essay-writing' && [
                        "Write the intro paragraph",
                        "Clarify thesis statement", 
                        "Edit 3 sentences"
                      ].map(suggestion => (
                        <Button
                          key={suggestion}
                          variant="outline"
                          size="sm"
                          onClick={() => setMicroGoal(suggestion)}
                        >
                          "{suggestion}"
                        </Button>
                      ))}
                    </div>
                    <Input
                      placeholder="Enter your micro goal..."
                      value={microGoal}
                      onChange={(e) => setMicroGoal(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session controls */}
            <div className="flex justify-center gap-4 mb-8">
              <Button 
                onClick={() => {
                  setIsSessionActive(!isSessionActive);
                  setIsPaused(!isPaused);
                }}
                variant={isSessionActive ? "secondary" : "default"}
                className="px-6 py-3"
              >
                {isSessionActive ? <Pause className="mr-2 w-5 h-5" /> : <Play className="mr-2 w-5 h-5" />}
                {isSessionActive ? 'Pause' : 'Resume'}
              </Button>
              
              <Button 
                onClick={() => {
                  // Mid-session pulse check
                  toast({
                    title: "Still feeling on track?",
                    description: "Take a breath if needed"
                  });
                }}
                variant="outline"
                className="px-6 py-3"
              >
                Pulse Check
              </Button>

              <Button 
                onClick={() => setCurrentStep('session-complete')}
                variant="outline"
                className="px-6 py-3"
              >
                End Session
              </Button>
            </div>

            {/* Ambient sound indicator */}
            {ambientSound !== 'silence' && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Waves className="w-4 h-4" />
                Playing: {ambientSound === 'rain' ? 'Rain sounds' : 'Cafe ambience'}
              </div>
            )}
          </div>
        );

      case 'session-complete':
        return (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-8 text-center">
              Session Complete!
            </h2>
            
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>How did it go?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-center gap-2 mb-4">
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <button
                          key={rating}
                          onClick={() => setFocusRating(rating)}
                          className={`w-12 h-12 rounded-full border transition-all ${
                            focusRating === rating
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border hover:border-primary hover:bg-primary/10'
                          }`}
                        >
                          {rating}
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-sm text-muted-foreground">
                      How focused did you feel? (1 = scattered, 5 = deep flow)
                    </p>
                  </div>

                  <div>
                    <p className="text-center mb-4">Did you achieve your goal?</p>
                    <div className="flex justify-center gap-4">
                      <Button 
                        onClick={() => setGoalCompleted(true)}
                        variant={goalCompleted === true ? "default" : "outline"}
                        className="px-8"
                      >
                        Yes
                      </Button>
                      <Button 
                        onClick={() => setGoalCompleted(false)}
                        variant={goalCompleted === false ? "default" : "outline"}
                        className="px-8"
                      >
                        Almost
                      </Button>
                      <Button 
                        onClick={() => setGoalCompleted(null)}
                        variant={goalCompleted === null ? "default" : "outline"}
                        className="px-8"
                      >
                        Not Quite
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Optional journal note: What helped / what next?
                    </label>
                    <Textarea
                      placeholder="Reflect on your session..."
                      value={sessionNotes}
                      onChange={(e) => setSessionNotes(e.target.value)}
                      className="min-h-[80px]"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center gap-4">
              <Button 
                onClick={() => setCurrentStep('flow-log')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
              >
                View Flow Log
              </Button>
              
              <Button 
                onClick={() => {
                  // Reset for another session
                  setCurrentStep('choose-task');
                  setCurrentPhase(0);
                  setPhaseTimer(0);
                  setMicroGoal("");
                }}
                variant="outline"
                className="px-8 py-3 rounded-full"
              >
                Another Session
              </Button>
            </div>
          </div>
        );

      case 'flow-log':
        if (!sessionData) return null;

        return (
          <div className="animate-fade-in max-w-3xl mx-auto">
            <h2 className="text-4xl font-heading font-medium text-foreground mb-8 text-center">
              Your Flow Log
            </h2>
            
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="w-6 h-6 text-green-500" />
                  Session Logged
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="font-medium">Task:</span>
                    <span>{taskCategories.find(cat => cat.id === sessionData.task)?.subtasks.find(sub => sub.id === sessionData.subtask)?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Technique:</span>
                    <span>{sessionData.technique.name}</span>
                  </div>
                  {microGoal && (
                    <div className="flex justify-between">
                      <span className="font-medium">Micro Goal:</span>
                      <span>"{microGoal}"</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium">Outcome:</span>
                    <span>
                      {goalCompleted === true ? 'Completed' : goalCompleted === false ? 'Almost' : 'Not Quite'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Self-Rating:</span>
                    <span>"Felt in Flow" {'★'.repeat(focusRating)}{'☆'.repeat(5 - focusRating)}</span>
                  </div>
                  {sessionNotes && (
                    <div className="pt-3 border-t">
                      <span className="font-medium">Notes:</span>
                      <p className="text-muted-foreground mt-1">{sessionNotes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-8">
              <CardHeader>
                <CardTitle>AI Suggestions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-primary/5 rounded-lg">
                    <div className="font-medium mb-2">Suggested next block:</div>
                    <p className="text-muted-foreground">"Continue with body paragraphs + transition phrases"</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm">
                      "Push My Focus Edge" → Suggest more intense technique
                    </Button>
                    <Button variant="outline" size="sm">
                      "Give Me Something Softer" → Match lighter ritual
                    </Button>
                    <Button variant="outline" size="sm">
                      "Save This Combo" → Favorite your flow recipe
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="text-center">
              <Button 
                onClick={() => navigate('/index')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-12 py-4 rounded-full"
              >
                Return to Home
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-24">
      <ClearBackButton />
      
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/index")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Flow State Lab
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Progress Bar */}
      {currentStep !== 'hero' && (
        <div className="px-8 pt-6">
          <Progress value={getStepProgress()} className="mb-4" />
          <p className="text-sm text-muted-foreground text-center">
            Step {['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'].indexOf(currentStep)} of 8
          </p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 px-8 py-16 pb-32 max-w-6xl mx-auto">
        {renderCurrentStep()}
      </div>

      <MainNavigation />
    </div>
  );
};

export default FlowStateLab;