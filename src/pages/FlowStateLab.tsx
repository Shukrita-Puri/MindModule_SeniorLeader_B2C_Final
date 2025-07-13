import { useState, useEffect } from "react";
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Brain, Timer, Target, ChevronRight, RotateCcw, CheckCircle, Coffee, Cloud, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Core state - sync with URL params
  const [currentStep, setCurrentStep] = useState<FlowStep>(() => {
    const stepParam = searchParams.get('step');
    const validSteps: FlowStep[] = ['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'];
    return validSteps.includes(stepParam as FlowStep) ? stepParam as FlowStep : 'hero';
  });
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
    'info-chunk-synthesis': {
      name: 'Info Chunk + Synthesis Block',
      category: 'Modern Productivity + Hermeneutic Circle',
      whatItIs: 'Consume information in focused chunks, then synthesize insights through structured reflection.',
      whyItWorks: 'Combines focused intake with deliberate processing, preventing information overload while building understanding.',
      phases: [
        { name: 'Chunk Preparation', duration: 1, description: 'Define what information you will process and your synthesis goal' },
        { name: 'Focused Intake', duration: 0, description: 'Deep information processing with minimal distraction' },
        { name: 'Synthesis Reflection', duration: 3, description: 'Connect ideas, identify patterns, and extract key insights' }
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
    },
    'loop-layer': {
      name: 'Loop + Layer',
      category: 'Deliberate Practice + Nada Yoga',
      whatItIs: 'Practice in focused repetitive cycles, adding complexity layers gradually.',
      whyItWorks: 'Builds muscle memory and deep competence through mindful repetition with progressive challenge.',
      phases: [
        { name: 'Base Loop Setup', duration: 2, description: 'Establish your core practice pattern and rhythm' },
        { name: 'Layered Practice', duration: 0, description: 'Repeat with incremental complexity additions' },
        { name: 'Integration Review', duration: 2, description: 'Consolidate new layers into your practice' }
      ]
    },
    'scene-flowboard': {
      name: 'Scene Flowboard',
      category: 'Visual Storyboarding + Agile Task Framing',
      whatItIs: 'Create visual sequences of your work process, breaking complex tasks into scene-like segments.',
      whyItWorks: 'Makes abstract work tangible and creates clear progression milestones that maintain motivation.',
      phases: [
        { name: 'Scene Mapping', duration: 3, description: 'Break your work into visual scenes or chapters' },
        { name: 'Scene Execution', duration: 0, description: 'Work through scenes sequentially with clear transitions' },
        { name: 'Flow Review', duration: 2, description: 'Assess scene effectiveness and adjust sequence' }
      ]
    },
    'rapid-frame-challenge': {
      name: 'Rapid Frame Challenge',
      category: 'Mindfulness in Action + Visual Iteration',
      whatItIs: 'Generate multiple quick visual or conceptual frames of your solution in rapid succession.',
      whyItWorks: 'Prevents overthinking and perfectionism while building creative momentum through iterative refinement.',
      phases: [
        { name: 'Frame Setup', duration: 1, description: 'Define your challenge and frame parameters' },
        { name: 'Rapid Generation', duration: 0, description: 'Create multiple solution frames quickly without judgment' },
        { name: 'Frame Selection', duration: 2, description: 'Review and refine your strongest frames' }
      ]
    },
    'speaking-burst-recall': {
      name: 'Speaking Burst + Flash Recall',
      category: 'Neuroscience + Vedic Repetition',
      whatItIs: 'Alternate between speaking aloud what you know and rapid recall testing.',
      whyItWorks: 'Verbal processing strengthens memory pathways while flash recall builds retrieval strength.',
      phases: [
        { name: 'Burst Preparation', duration: 1, description: 'Organize key concepts for verbal practice' },
        { name: 'Speak-Recall Cycles', duration: 0, description: 'Alternate between explaining aloud and testing recall' },
        { name: 'Mastery Check', duration: 2, description: 'Final fluency test and gap identification' }
      ]
    },
    'code-test-explain': {
      name: 'Code–Test–Explain',
      category: 'Test-Driven Development + Feynman Technique',
      whatItIs: 'Write code, test it immediately, then explain how it works in simple terms.',
      whyItWorks: 'Combines practical application with deep understanding verification through teaching.',
      phases: [
        { name: 'Code Setup', duration: 2, description: 'Plan your coding approach and testing criteria' },
        { name: 'Code-Test Cycles', duration: 0, description: 'Write, test, and iterate in short cycles' },
        { name: 'Explain & Document', duration: 3, description: 'Explain your solution clearly and document insights' }
      ]
    },
    'loop-shift-reset': {
      name: 'Loop, Shift, Reset',
      category: 'Bach Repetition + Somatic Tuning',
      whatItIs: 'Practice in focused loops, shift perspective or approach, then reset to fresh awareness.',
      whyItWorks: 'Prevents plateaus through systematic variation while maintaining focused attention.',
      phases: [
        { name: 'Initial Loop', duration: 0, description: 'Practice your core pattern with full attention' },
        { name: 'Perspective Shift', duration: 2, description: 'Change your approach, tempo, or focus point' },
        { name: 'Reset Integration', duration: 1, description: 'Return to practice with fresh awareness' }
      ]
    },
    'micro-drills-peak': {
      name: 'Micro Drills + Peak Set',
      category: 'Sports Psychology + Warrior Tradition',
      whatItIs: 'Practice specific micro-skills, then combine them in one peak performance set.',
      whyItWorks: 'Builds precise competence through isolation, then integrates skills under optimal challenge.',
      phases: [
        { name: 'Drill Isolation', duration: 0, description: 'Practice individual skills with precision focus' },
        { name: 'Skill Integration', duration: 2, description: 'Combine drills into flowing sequences' },
        { name: 'Peak Performance', duration: 0, description: 'Execute your best possible integrated performance' }
      ]
    },
    'segment-voice-anchor': {
      name: 'Segment Practice + Voice Anchor',
      category: 'Classical Rhetoric + NLP Anchoring',
      whatItIs: 'Break content into segments, practice with vocal anchoring phrases that trigger recall.',
      whyItWorks: 'Creates strong memory anchors through multi-sensory encoding and structured segmentation.',
      phases: [
        { name: 'Segment Mapping', duration: 2, description: 'Break content into logical segments with voice anchors' },
        { name: 'Anchor Practice', duration: 0, description: 'Practice segments with consistent vocal anchoring' },
        { name: 'Flow Integration', duration: 2, description: 'Link segments into smooth, anchored delivery' }
      ]
    },
    'milestone-mapping': {
      name: 'Milestone Mapping',
      category: 'Project Management + Pilgrimage Pathways',
      whatItIs: 'Map your work as a journey with meaningful milestones that create momentum and meaning.',
      whyItWorks: 'Transforms work into a purposeful journey, maintaining motivation through meaningful progress markers.',
      phases: [
        { name: 'Journey Design', duration: 3, description: 'Map your work journey with meaningful milestones' },
        { name: 'Milestone Travel', duration: 0, description: 'Work toward milestones with pilgrimage mindset' },
        { name: 'Milestone Celebration', duration: 2, description: 'Honor achievement and prepare for next milestone' }
      ]
    },
    'energy-match-blocks': {
      name: '3–Block Energy Match',
      category: 'Chronobiology + Ayurveda Rhythms',
      whatItIs: 'Align three work blocks with your natural energy rhythms throughout the day.',
      whyItWorks: 'Maximizes productivity by matching task demands with optimal energy states.',
      phases: [
        { name: 'Energy Assessment', duration: 2, description: 'Identify your current energy state and rhythm' },
        { name: 'Matched Work Blocks', duration: 0, description: 'Execute tasks aligned with energy levels' },
        { name: 'Rhythm Review', duration: 1, description: 'Note energy patterns for future optimization' }
      ]
    },
    'zone-five-item': {
      name: 'Zone + 5–Item Rule',
      category: 'Minimalism + Zen Tidy Practice',
      whatItIs: 'Create a focused work zone with only 5 essential items, maintaining clarity through simplicity.',
      whyItWorks: 'Eliminates distractions and decision fatigue while creating a mindful, intentional work environment.',
      phases: [
        { name: 'Zone Clearing', duration: 2, description: 'Clear space and select your 5 essential items' },
        { name: 'Focused Work', duration: 0, description: 'Work within your simplified, intentional environment' },
        { name: 'Clarity Review', duration: 1, description: 'Assess how simplicity affected your focus' }
      ]
    },
    'visual-cue-board': {
      name: 'Visual Cue Board',
      category: 'Vision Psychology + Sankalpa/Vow Setting',
      whatItIs: 'Create a visual board with images and symbols that anchor your intention and progress.',
      whyItWorks: 'Engages visual processing to reinforce goals and creates powerful subconscious anchoring.',
      phases: [
        { name: 'Cue Creation', duration: 3, description: 'Design visual cues that represent your goals and process' },
        { name: 'Cue-Anchored Work', duration: 0, description: 'Work with visual cues actively guiding focus' },
        { name: 'Vision Integration', duration: 2, description: 'Update cues based on insights and progress' }
      ]
    },
    'reverse-roadmap': {
      name: 'Reverse Roadmap',
      category: 'Backward Design + Stoic End-Mapping',
      whatItIs: 'Start from your desired end result and work backward to create your action path.',
      whyItWorks: 'Clarifies essential steps by working from clarity rather than confusion, ensuring purposeful action.',
      phases: [
        { name: 'End Visioning', duration: 3, description: 'Clearly define and visualize your desired outcome' },
        { name: 'Backward Mapping', duration: 2, description: 'Work backward to identify necessary steps' },
        { name: 'Forward Execution', duration: 0, description: 'Execute your reverse-engineered action plan' }
      ]
    }
  };

  // Task categories with matched techniques (defaults - enhanced matching happens in getSelectedTechnique)
  const taskCategories: TaskCategory[] = [
    {
      id: "academic-work",
      title: "Academic Work",
      emoji: "",
      subtasks: [
        { id: "essay-writing", name: "Essay Writing", technique: flowTechniques['scene-flowboard'] },
        { id: "math-problems", name: "Math Problem Sets", technique: flowTechniques['problem-looping'] },
        { id: "reading-analysis", name: "Reading & Analysis", technique: flowTechniques['info-chunk-synthesis'] },
        { id: "test-prep", name: "Test or Exam Preparation", technique: flowTechniques['retrieval-sprints'] },
        { id: "research", name: "Research Projects", technique: flowTechniques['info-chunk-synthesis'] },
        { id: "memorization", name: "Memorization & Recall", technique: flowTechniques['speaking-burst-recall'] },
        { id: "presentation-prep", name: "Presentation Preparation", technique: flowTechniques['segment-voice-anchor'] }
      ]
    },
    {
      id: "creative-projects",
      title: "Creative Projects", 
      emoji: "",
      subtasks: [
        { id: "art-design", name: "Art & Design", technique: flowTechniques['constraint-challenge'] },
        { id: "creative-writing", name: "Creative Writing", technique: flowTechniques['timed-freewriting'] },
        { id: "music-practice", name: "Music Practice", technique: flowTechniques['loop-shift-reset'] },
        { id: "video-creation", name: "Video Creation", technique: flowTechniques['scene-flowboard'] },
        { id: "photography", name: "Photography", technique: flowTechniques['rapid-frame-challenge'] },
        { id: "brainstorming", name: "Ideation & Brainstorming", technique: flowTechniques['rapid-frame-challenge'] }
      ]
    },
    {
      id: "skill-development",
      title: "Skill Development",
      emoji: "",
      subtasks: [
        { id: "language-learning", name: "Language Learning", technique: flowTechniques['segment-voice-anchor'] },
        { id: "coding-practice", name: "Coding Practice", technique: flowTechniques['code-test-explain'] },
        { id: "instrument-mastery", name: "Instrument Mastery", technique: flowTechniques['loop-shift-reset'] },
        { id: "sport-training", name: "Sport Training", technique: flowTechniques['micro-drills-peak'] },
        { id: "public-speaking", name: "Public Speaking", technique: flowTechniques['segment-voice-anchor'] },
        { id: "technical-skills", name: "Technical Skills Practice", technique: flowTechniques['loop-layer'] }
      ]
    },
    {
      id: "planning-organizing", 
      title: "Planning & Organizing",
      emoji: "",
      subtasks: [
        { id: "college-apps", name: "College Applications", technique: flowTechniques['milestone-mapping'] },
        { id: "schedule-planning", name: "Schedule Planning", technique: flowTechniques['energy-match-blocks'] },
        { id: "room-organization", name: "Room Organization", technique: flowTechniques['zone-five-item'] },
        { id: "goal-setting", name: "Goal Setting", technique: flowTechniques['visual-cue-board'] },
        { id: "project-planning", name: "Project Planning", technique: flowTechniques['reverse-roadmap'] },
        { id: "life-design", name: "Life Design & Vision", technique: flowTechniques['reverse-roadmap'] }
      ]
    },
    {
      id: "focus-clarity",
      title: "Focus & Mental Clarity",
      emoji: "",
      subtasks: [
        { id: "deep-work", name: "Deep Work Sessions", technique: flowTechniques['zone-five-item'] },
        { id: "meditation-practice", name: "Mindfulness Practice", technique: flowTechniques['energy-match-blocks'] },
        { id: "decision-making", name: "Decision Making", technique: flowTechniques['info-chunk-synthesis'] },
        { id: "problem-solving", name: "Complex Problem Solving", technique: flowTechniques['reverse-roadmap'] }
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
            updateStep('session-complete');
            setIsSessionActive(false);
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, isPaused, currentStep, sessionData, currentPhase, phaseTimer, toast]);

  const getSelectedTechnique = (): FlowTechnique | null => {
    // Enhanced triangulation logic based on activity, time, and context
    const context = userContext.toLowerCase();
    
    // Time categorization
    const timePreferences = {
      short: (duration <= 15),
      medium: (duration > 15 && duration <= 45),
      long: (duration > 45)
    };
    
    // Enhanced context detection with specific indicators
    const contextPatterns = {
      timeStress: /urgent|deadline|tomorrow|cramming|last.minute|quick|rushed/,
      examPrep: /exam|test|final|midterm|assessment|quiz|evaluation/,
      memoryWork: /memorize|recall|remember|facts|vocabulary|definitions|terms/,
      mathContext: /\b(math|calculus|algebra|geometry|statistics|mathematical|equation|formula|theorem)\b/,
      writingContext: /essay|paper|writing|draft|argument|thesis|composition/,
      creativeContext: /creative|design|brainstorm|innovative|art|visual|imagination/,
      analyticalContext: /analyze|logic|reasoning|critical|systematic|detailed/,
      practiceContext: /practice|drill|repeat|skill|technique|training|exercise/,
      planningContext: /plan|organize|structure|goal|roadmap|strategy|project/,
      complexContext: /complex|advanced|difficult|challenging|comprehensive|deep/,
      focusNeeded: /focus|concentrate|attention|clarity|distraction|noise/,
      energyLevel: /tired|fatigue|energy|motivation|momentum|alert|fresh/
    };
    
    // Debug logging to track triangulation
    console.log('Flow Lab Triangulation:', {
      selectedSubtask,
      duration,
      timeCategory: timePreferences.short ? 'short' : timePreferences.medium ? 'medium' : 'long',
      context: context,
      patterns: {
        examPrep: contextPatterns.examPrep.test(context),
        mathContext: contextPatterns.mathContext.test(context),
        memoryWork: contextPatterns.memoryWork.test(context),
        timeStress: contextPatterns.timeStress.test(context),
        complexContext: contextPatterns.complexContext.test(context)
      }
    });
    
    // Helper function to check multiple patterns
    const hasPattern = (patterns: RegExp[]) => patterns.some(pattern => pattern.test(context));
    
    // Advanced triangulation for test preparation - prioritize test-prep techniques
    if (selectedSubtask === 'test-prep') {
      console.log('Test-prep triangulation triggered');
      
      if (timePreferences.short) {
        if (contextPatterns.memoryWork.test(context)) return flowTechniques['speaking-burst-recall'];
        if (contextPatterns.timeStress.test(context)) return flowTechniques['micro-drills-peak'];
        return flowTechniques['speaking-burst-recall'];
      } else if (timePreferences.medium) {
        // For medium duration (25-45min), prioritize test-specific techniques
        if (contextPatterns.memoryWork.test(context)) return flowTechniques['segment-voice-anchor'];
        if (contextPatterns.timeStress.test(context)) return flowTechniques['retrieval-sprints'];
        if (contextPatterns.complexContext.test(context)) return flowTechniques['active-margin-tagging'];
        // Only use math techniques if it's clearly math-focused AND test prep
        if (contextPatterns.mathContext.test(context) && context.includes('math')) return flowTechniques['problem-looping'];
        return flowTechniques['active-margin-tagging'];
      } else {
        // For long duration (45+ min), use comprehensive test prep techniques
        if (contextPatterns.complexContext.test(context)) return flowTechniques['info-chunk-synthesis'];
        if (contextPatterns.memoryWork.test(context)) return flowTechniques['loop-layer'];
        // Only use math techniques if it's clearly math-focused AND test prep
        if (contextPatterns.mathContext.test(context) && context.includes('math')) return flowTechniques['problem-looping'];
        return flowTechniques['milestone-mapping'];
      }
    }
    
    // Enhanced essay writing triangulation
    if (selectedSubtask === 'essay-writing') {
      if (timePreferences.short) {
        if (contextPatterns.creativeContext.test(context)) return flowTechniques['rapid-frame-challenge'];
        if (contextPatterns.timeStress.test(context)) return flowTechniques['constraint-challenge'];
        return flowTechniques['timed-freewriting'];
      } else if (timePreferences.medium) {
        if (contextPatterns.analyticalContext.test(context)) return flowTechniques['scene-flowboard'];
        if (contextPatterns.complexContext.test(context)) return flowTechniques['info-chunk-synthesis'];
        if (contextPatterns.creativeContext.test(context)) return flowTechniques['constraint-challenge'];
        return flowTechniques['scene-flowboard'];
      } else {
        if (contextPatterns.complexContext.test(context)) return flowTechniques['reverse-roadmap'];
        if (contextPatterns.planningContext.test(context)) return flowTechniques['milestone-mapping'];
        return flowTechniques['scene-flowboard'];
      }
    }
    
    // Enhanced math problems triangulation
    if (selectedSubtask === 'math-problems') {
      if (timePreferences.short) {
        if (contextPatterns.practiceContext.test(context)) return flowTechniques['micro-drills-peak'];
        if (contextPatterns.timeStress.test(context)) return flowTechniques['speaking-burst-recall'];
        return flowTechniques['micro-drills-peak'];
      } else if (timePreferences.medium) {
        if (contextPatterns.complexContext.test(context)) return flowTechniques['loop-shift-reset'];
        if (contextPatterns.practiceContext.test(context)) return flowTechniques['loop-layer'];
        return flowTechniques['problem-looping'];
      } else {
        if (contextPatterns.complexContext.test(context)) return flowTechniques['code-test-explain'];
        return flowTechniques['problem-looping'];
      }
    }
    
    // Enhanced reading & analysis triangulation
    if (selectedSubtask === 'reading-analysis') {
      if (timePreferences.short) {
        if (contextPatterns.focusNeeded.test(context)) return flowTechniques['zone-five-item'];
        return flowTechniques['active-margin-tagging'];
      } else if (timePreferences.medium) {
        if (contextPatterns.complexContext.test(context)) return flowTechniques['info-chunk-synthesis'];
        if (contextPatterns.analyticalContext.test(context)) return flowTechniques['active-margin-tagging'];
        return flowTechniques['active-margin-tagging'];
      } else {
        return flowTechniques['info-chunk-synthesis'];
      }
    }
    
    // Creative work triangulation
    if (selectedSubtask.includes('creative') || selectedSubtask.includes('design') || selectedSubtask.includes('art')) {
      if (timePreferences.short) {
        if (contextPatterns.timeStress.test(context)) return flowTechniques['constraint-challenge'];
        return flowTechniques['rapid-frame-challenge'];
      } else if (timePreferences.medium) {
        if (contextPatterns.planningContext.test(context)) return flowTechniques['visual-cue-board'];
        if (contextPatterns.complexContext.test(context)) return flowTechniques['constraint-challenge'];
        return flowTechniques['rapid-frame-challenge'];
      } else {
        return flowTechniques['visual-cue-board'];
      }
    }
    
    // Coding/Programming triangulation
    if (selectedSubtask.includes('coding') || selectedSubtask.includes('programming')) {
      if (timePreferences.short) {
        if (contextPatterns.practiceContext.test(context)) return flowTechniques['micro-drills-peak'];
        return flowTechniques['time-block-micro-goal'];
      } else if (timePreferences.medium) {
        if (contextPatterns.complexContext.test(context)) return flowTechniques['code-test-explain'];
        return flowTechniques['problem-looping'];
      } else {
        return flowTechniques['code-test-explain'];
      }
    }
    
    // Context-first overrides (when context is very specific)
    if (contextPatterns.memoryWork.test(context)) {
      if (timePreferences.short) return flowTechniques['speaking-burst-recall'];
      if (timePreferences.medium) return flowTechniques['segment-voice-anchor'];
      return flowTechniques['loop-layer'];
    }
    
    if (contextPatterns.creativeContext.test(context)) {
      if (timePreferences.short) return flowTechniques['rapid-frame-challenge'];
      if (timePreferences.medium) return flowTechniques['constraint-challenge'];
      return flowTechniques['visual-cue-board'];
    }
    
    if (contextPatterns.timeStress.test(context)) {
      if (timePreferences.short) return flowTechniques['time-block-micro-goal'];
      if (timePreferences.medium) return flowTechniques['constraint-challenge'];
      return flowTechniques['milestone-mapping'];
    }
    
    if (contextPatterns.practiceContext.test(context)) {
      if (timePreferences.short) return flowTechniques['micro-drills-peak'];
      if (timePreferences.medium) return flowTechniques['loop-layer'];
      return flowTechniques['loop-shift-reset'];
    }
    
    if (contextPatterns.planningContext.test(context)) {
      if (timePreferences.short) return flowTechniques['time-block-micro-goal'];
      if (timePreferences.medium) return flowTechniques['milestone-mapping'];
      return flowTechniques['reverse-roadmap'];
    }
    
    if (contextPatterns.complexContext.test(context)) {
      if (timePreferences.short) return flowTechniques['zone-five-item'];
      if (timePreferences.medium) return flowTechniques['info-chunk-synthesis'];
      return flowTechniques['reverse-roadmap'];
    }
    
    if (contextPatterns.focusNeeded.test(context)) {
      if (timePreferences.short) return flowTechniques['zone-five-item'];
      return flowTechniques['energy-match-blocks'];
    }
    
    // Enhanced activity-specific matching with improved triangulation
    const activityType = `${selectedTask}-${selectedSubtask}`;
    
    switch (activityType) {
      case 'academic-work-research':
        if (timePreferences.short) return flowTechniques['time-block-micro-goal'];
        if (timePreferences.medium) return flowTechniques['active-margin-tagging'];
        return flowTechniques['info-chunk-synthesis'];
        
      case 'academic-work-memorization':
        if (timePreferences.short) return flowTechniques['speaking-burst-recall'];
        if (timePreferences.medium) return flowTechniques['segment-voice-anchor'];
        return flowTechniques['loop-layer'];
        
      case 'creative-projects-music-practice':
        if (timePreferences.short) return flowTechniques['micro-drills-peak'];
        if (timePreferences.medium) return flowTechniques['loop-layer'];
        return flowTechniques['loop-shift-reset'];
        
      case 'skill-development-language-learning':
        if (timePreferences.short) return flowTechniques['speaking-burst-recall'];
        if (timePreferences.medium) return flowTechniques['segment-voice-anchor'];
        return flowTechniques['loop-layer'];
        
      case 'planning-organizing-college-apps':
        if (timePreferences.short) return flowTechniques['time-block-micro-goal'];
        if (timePreferences.medium) return flowTechniques['milestone-mapping'];
        return flowTechniques['reverse-roadmap'];
        
      case 'planning-organizing-goal-setting':
        if (timePreferences.short) return flowTechniques['visual-cue-board'];
        if (timePreferences.medium) return flowTechniques['milestone-mapping'];
        return flowTechniques['reverse-roadmap'];
        
      default:
        // Intelligent fallback based on time and general context
        if (timePreferences.short) {
          if (hasPattern([contextPatterns.creativeContext])) return flowTechniques['rapid-frame-challenge'];
          if (hasPattern([contextPatterns.memoryWork])) return flowTechniques['speaking-burst-recall'];
          if (hasPattern([contextPatterns.practiceContext])) return flowTechniques['micro-drills-peak'];
          return flowTechniques['time-block-micro-goal'];
        } else if (timePreferences.medium) {
          if (hasPattern([contextPatterns.complexContext])) return flowTechniques['info-chunk-synthesis'];
          if (hasPattern([contextPatterns.creativeContext])) return flowTechniques['visual-cue-board'];
          if (hasPattern([contextPatterns.planningContext])) return flowTechniques['milestone-mapping'];
          return flowTechniques['energy-match-blocks'];
        } else {
          if (hasPattern([contextPatterns.complexContext])) return flowTechniques['reverse-roadmap'];
          if (hasPattern([contextPatterns.creativeContext])) return flowTechniques['milestone-mapping'];
          return flowTechniques['energy-match-blocks'];
        }
    }
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
    updateStep('session-setup');
  };

  // Sync currentStep with URL
  useEffect(() => {
    const stepParam = searchParams.get('step');
    const validSteps: FlowStep[] = ['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'];
    if (stepParam && validSteps.includes(stepParam as FlowStep) && stepParam !== currentStep) {
      setCurrentStep(stepParam as FlowStep);
    }
  }, [searchParams, currentStep]);

  const updateStep = (newStep: FlowStep) => {
    setCurrentStep(newStep);
    setSearchParams({ step: newStep });
  };

  const goBack = () => {
    const stepOrder: FlowStep[] = ['hero', 'choose-task', 'add-context', 'choose-duration', 'technique-matched', 'session-setup', 'session-active', 'session-complete', 'flow-log'];
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (currentIndex > 0) {
      updateStep(stepOrder[currentIndex - 1]);
    } else {
      navigate('/inner-architect');
    }
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
              onClick={() => updateStep('choose-task')}
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
                  onClick={() => updateStep('add-context')}
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
                onClick={() => updateStep('choose-duration')}
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
                  onClick={() => updateStep('technique-matched')}
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
                  updateStep('session-active');
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
                onClick={() => updateStep('session-complete')}
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
                onClick={() => updateStep('flow-log')}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full"
              >
                View Flow Log
              </Button>
              
              <Button 
                onClick={() => {
                  // Reset for another session
                  updateStep('choose-task');
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