import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import CoachingToastMinimal from "@/components/CoachingToastMinimal";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  emotion?: "neutral" | "positive" | "negative" | "probing";
  coachingFeedback?: {
    type: "mental-clarity" | "social-intelligence" | "resilience" | "leadership" | "adaptability" | "creative-thinking" | "ancient-wisdom";
    message: string;
    suggestion: string;
  };
}

interface CollegeAdmissionsSimulationProps {
  onEndSession: () => void;
  sessionDuration?: number;
  aiPersona?: {
    name: string;
    role: string;
  };
}

const CollegeAdmissionsSimulation = ({ 
  onEndSession, 
  sessionDuration = 15,
  aiPersona = { name: "Interviewer", role: "Admissions Officer" }
}: CollegeAdmissionsSimulationProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [aiEmotion, setAiEmotion] = useState<"neutral" | "positive" | "negative" | "probing">("neutral");
  const [timeRemaining, setTimeRemaining] = useState(sessionDuration * 60);
  const [responseTimeLeft, setResponseTimeLeft] = useState(45);
  const [isThinking, setIsThinking] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [userAnxietyLevel, setUserAnxietyLevel] = useState<"low" | "medium" | "high">("low");
  const [questionCount, setQuestionCount] = useState(0);
  // Meta skills shown from the start (MVP focus areas)
  const metaSkills = ["Social Intelligence", "Resilience", "Adaptability", "Communication"];
  const [activeToast, setActiveToast] = useState<{
    id: string;
    type: "mental-clarity" | "social-intelligence" | "resilience" | "leadership" | "adaptability" | "creative-thinking" | "ancient-wisdom";
    message: string;
    suggestion: string;
    pastLearning?: {
      context: string;
      insight: string;
    };
  } | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const responseTimerRef = useRef<NodeJS.Timeout>();

  // Meta skill mapping
  const metaSkillMap: Record<string, string> = {
    "mental-clarity": "Mental Clarity",
    "social-intelligence": "Social Intelligence",
    "resilience": "Resilience",
    "leadership": "Leadership",
    "adaptability": "Adaptability",
    "creative-thinking": "Creative Thinking",
    "ancient-wisdom": "Wisdom"
  };

  // Meta skills are shown from start, no need to track dynamically

  // Pause/Resume logic
  const pauseTimers = () => {
    setIsPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
  };

  const resumeTimers = () => {
    setIsPaused(false);
  };

  useEffect(() => {
    if (isPaused) {
      pauseTimers();
    } else {
      resumeTimers();
    }
  }, [isPaused]);

  // Reset timers when session ends
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, []);

  const getPastLearning = (feedbackType: string, questionNumber: number) => {
    const pastLearnings = {
      "mental-clarity": [
        { context: "Email patterns show you often send lengthy messages without clear structure", insight: "Practice the 'bottom line up front' approach you've been working on" },
        { context: "Calendar analysis shows back-to-back meetings", insight: "Apply your learned pause-and-breathe technique before responding" },
        { context: "Previous app conversations show you excel when given time to reflect", insight: "Take a moment to organize your thoughts before speaking" }
      ],
      "social-intelligence": [
        { context: "WhatsApp analysis shows you're great at reading social cues in text", insight: "Trust that same intuition you use in messaging when speaking face-to-face" },
        { context: "Your wearable data shows increased heart rate during social interactions", insight: "Remember the grounding techniques that help you stay centered" },
        { context: "Past conversations show you connect well through shared experiences", insight: "Draw on the storytelling strength you've developed" }
      ],
      "resilience": [
        { context: "Your fitness tracker shows consistent workout patterns despite busy schedule", insight: "Channel that same persistence and discipline you show in your fitness routine" },
        { context: "Email threads show you bounce back quickly from setbacks", insight: "Apply the reframing skills you've mastered in written communication" },
        { context: "Past app sessions show growth mindset when receiving feedback", insight: "Trust your ability to turn challenges into learning opportunities" }
      ],
      "leadership": [
        { context: "Calendar shows you organize group events and meetings", insight: "Use the same organizational confidence you show in planning" },
        { context: "Message patterns show others seek your advice frequently", insight: "Remember that people naturally trust your judgment - show that confidence here" },
        { context: "Previous simulations show improvement when you take initiative", insight: "Lead with the same authentic authority you've been developing" }
      ],
      "adaptability": [
        { context: "Schedule analysis shows you handle last-minute changes well", insight: "Apply the flexible thinking you use in daily life" },
        { context: "App usage shows you engage with diverse content types", insight: "Use your natural curiosity to explore different angles in your response" },
        { context: "Past conversations show creative problem-solving", insight: "Trust your ability to think outside conventional frameworks" }
      ],
      "creative-thinking": [
        { context: "Your browsing patterns show interest in diverse topics", insight: "Draw connections between seemingly unrelated experiences" },
        { context: "Previous responses show unique perspectives", insight: "Don't hold back your unconventional insights - they're your strength" },
        { context: "App engagement shows you thrive on complex challenges", insight: "Embrace the complexity of this question rather than simplifying" }
      ],
      "ancient-wisdom": [
        { context: "Your mindfulness app shows regular meditation practice", insight: "Apply the present-moment awareness you've cultivated" },
        { context: "Past reflections show you value philosophical thinking", insight: "Trust the wisdom traditions that resonate with your character" },
        { context: "Your journal entries reveal deep contemplation", insight: "Channel that same inner wisdom you access in quiet moments" }
      ]
    };

    const learningSet = pastLearnings[feedbackType as keyof typeof pastLearnings] || [];
    return learningSet[questionNumber % learningSet.length];
  };

  const [lastCoachingType, setLastCoachingType] = useState<string>("");
  const [coachingRotation, setCoachingRotation] = useState(0);

  const getCoachingFeedback = (userResponse: string, questionNumber: number) => {
    const responseLength = userResponse.length;
    const lowerResponse = userResponse.toLowerCase();
    
    const hasPersonalStory = lowerResponse.includes("i") && 
                            (lowerResponse.includes("when") || lowerResponse.includes("time") || lowerResponse.includes("once"));
    const hasSpecificDetails = userResponse.match(/\d/) || 
                               lowerResponse.includes("specific") || 
                               lowerResponse.includes("example") ||
                               lowerResponse.includes("exactly") ||
                               lowerResponse.includes("particular");
    const showsVulnerability = lowerResponse.includes("mistake") ||
                               lowerResponse.includes("failed") ||
                               lowerResponse.includes("learned") ||
                               lowerResponse.includes("struggle") ||
                               lowerResponse.includes("difficult") ||
                               lowerResponse.includes("challenge");
    const showsEmpathy = lowerResponse.includes("others") ||
                        lowerResponse.includes("team") ||
                        lowerResponse.includes("helped") ||
                        lowerResponse.includes("understood") ||
                        lowerResponse.includes("listened");
    const showsAdaptability = lowerResponse.includes("changed") ||
                             lowerResponse.includes("adapted") ||
                             lowerResponse.includes("different") ||
                             lowerResponse.includes("pivot") ||
                             lowerResponse.includes("flexible");
    const showsCreativity = lowerResponse.includes("creative") ||
                           lowerResponse.includes("innovative") ||
                           lowerResponse.includes("unique") ||
                           lowerResponse.includes("original") ||
                           lowerResponse.includes("unconventional");
    const mentionsLeadership = lowerResponse.includes("lead") || 
                              lowerResponse.includes("manage") ||
                              lowerResponse.includes("organize") ||
                              lowerResponse.includes("direct");
    
    const isHesitant = lowerResponse.includes("um") || 
                      lowerResponse.includes("well") ||
                      lowerResponse.includes("i guess") ||
                      lowerResponse.includes("maybe") ||
                      lowerResponse.includes("probably");
    const isConfident = lowerResponse.includes("definitely") ||
                       lowerResponse.includes("absolutely") ||
                       lowerResponse.includes("certainly") ||
                       responseLength > 150;
    const isVague = !hasSpecificDetails && responseLength < 80;

    const shouldCoach = Math.random() < 0.8;
    
    if (!shouldCoach && responseLength > 120 && hasSpecificDetails) {
      return null;
    }

    const allFeedbackOptions = [
      {
        condition: responseLength > 40 && !hasSpecificDetails,
        type: "mental-clarity" as const,
        message: "You're speaking generally, but they want to understand you specifically.",
        suggestion: "Replace abstract statements with concrete moments that reveal your character."
      },
      {
        condition: !showsEmpathy && responseLength > 50,
        type: "social-intelligence" as const,
        message: "You're focused on your own actions but missing the interpersonal dimension.",
        suggestion: "Share how you read emotions, built trust, or navigated different perspectives in this situation."
      },
      {
        condition: isHesitant && userAnxietyLevel === "high",
        type: "resilience" as const,
        message: "I can sense some nervousness. Remember, they want to see how you handle pressure.",
        suggestion: "Take a breath and draw on your past experiences overcoming challenges. Show your grit."
      },
      {
        condition: !showsVulnerability && responseLength > 80,
        type: "resilience" as const,
        message: "Good detail, but admissions officers want to see authentic growth through adversity.",
        suggestion: "Share a moment when you faced real difficulty and what you learned about yourself."
      },
      {
        condition: !hasSpecificDetails && mentionsLeadership,
        type: "leadership" as const,
        message: "You mention leadership but lack the concrete examples that make it compelling.",
        suggestion: "Describe specific decisions you made, how you influenced others, and measurable impact you created."
      },
      {
        condition: !showsAdaptability && questionNumber > 1,
        type: "adaptability" as const,
        message: "Your responses show planning but not intellectual flexibility.",
        suggestion: "Share how you adjusted when plans failed, learned from unexpected feedback, or embraced new perspectives."
      },
      {
        condition: !showsCreativity && questionNumber > 2,
        type: "creative-thinking" as const,
        message: "Solid response, but you could differentiate yourself with more original thinking.",
        suggestion: "Challenge conventional wisdom, make unexpected connections, or offer a fresh angle on familiar concepts."
      },
      {
        condition: isHesitant || userAnxietyLevel === "medium",
        type: "ancient-wisdom" as const,
        message: "Remember the Stoic teaching: 'You have power over your mind—not outside events. Realize this, and you will find strength.'",
        suggestion: "Focus on what you can control—your response, your authenticity, your presence in this moment."
      }
    ];

    const applicableOptions = allFeedbackOptions.filter(option => option.condition);
    
    if (applicableOptions.length === 0) {
      const fallbackOptions = [
        {
          type: "social-intelligence" as const,
          message: "Strong foundation - now show how you connect with and influence others.",
          suggestion: "Share how you build relationships, read social situations, or bring people together."
        },
        {
          type: "resilience" as const,
          message: "Good start - admissions officers also want to see your perseverance.",
          suggestion: "Describe a time you overcame a significant obstacle or bounced back from failure."
        },
        {
          type: "leadership" as const,
          message: "Solid response - now demonstrate your leadership potential.",
          suggestion: "Share how you've influenced others, taken initiative, or created positive change."
        }
      ];
      
      const selectedFallback = fallbackOptions[coachingRotation % fallbackOptions.length];
      setCoachingRotation(prev => prev + 1);
      
      const pastLearning = getPastLearning(selectedFallback.type, questionNumber);
      return {
        type: selectedFallback.type,
        message: selectedFallback.message,
        suggestion: selectedFallback.suggestion,
        pastLearning
      };
    }

    let selectedFeedback;
    if (applicableOptions.length > 1) {
      const varietyOptions = applicableOptions.filter(option => option.type !== lastCoachingType);
      if (varietyOptions.length > 0) {
        selectedFeedback = varietyOptions[Math.floor(Math.random() * varietyOptions.length)];
      } else {
        selectedFeedback = applicableOptions[Math.floor(Math.random() * applicableOptions.length)];
      }
    } else {
      selectedFeedback = applicableOptions[0];
    }

    setLastCoachingType(selectedFeedback.type);
    const pastLearning = getPastLearning(selectedFeedback.type, questionNumber);

    return {
      type: selectedFeedback.type,
      message: selectedFeedback.message,
      suggestion: selectedFeedback.suggestion,
      pastLearning
    };
  };

  const getAdmissionsResponse = (userResponse: string, questionNumber: number) => {
    const responseLength = userResponse.length;
    const isVague = !userResponse.includes("specific") && responseLength < 100;
    const isEvasive = userResponse.toLowerCase().includes("usually") || 
                      userResponse.toLowerCase().includes("generally") ||
                      !userResponse.toLowerCase().includes("i");

    if (isVague || isEvasive) {
      setUserAnxietyLevel("high");
    } else if (responseLength > 150) {
      setUserAnxietyLevel("low");
    } else {
      setUserAnxietyLevel("medium");
    }

    const responses = {
      supportive: [
        { text: "I appreciate your honesty. That kind of self-reflection is exactly what we're looking for. Let me ask you this: Tell me about a time when you had to stand up for something you believed in, even when it wasn't popular.", emotion: "positive" as const },
        { text: "That's a thoughtful perspective. I can see you've really considered this. Now, let's explore your leadership style - describe a situation where you had to influence others without having formal authority.", emotion: "positive" as const },
        { text: "Excellent insight. It's clear you understand the difference between opportunity and character. Here's my next question: What's something you've failed at that taught you the most about yourself?", emotion: "positive" as const }
      ],
      challenging: [
        { text: "I hear what you're saying, but I'm not entirely convinced. Many of our applicants have faced similar challenges. What makes your approach different? Give me a specific example where you created real change.", emotion: "probing" as const },
        { text: "That's interesting, but let me push back a bit. How do I know this isn't just what you think I want to hear? Tell me about a time when your values were tested and you had to make a difficult choice.", emotion: "negative" as const },
        { text: "I appreciate the response, but I'm looking for more substance. You mention growth and learning - show me. Describe a specific moment when you realized you were wrong about something important.", emotion: "probing" as const }
      ],
      gentle: [
        { text: "I can see this is an important topic for you. Take your time. Sometimes the most meaningful experiences are the hardest to articulate. What's a moment that fundamentally changed how you see yourself?", emotion: "neutral" as const },
        { text: "No need to rush. Let's approach this differently. Instead of focusing on achievements, tell me about a time when you felt truly challenged - not academically, but personally.", emotion: "neutral" as const },
        { text: "I appreciate your thoughtfulness. Here's what I'm really curious about - when was the last time you changed your mind about something significant? What led to that change?", emotion: "neutral" as const }
      ]
    };

    let responseSet;
    if (userAnxietyLevel === "high" || questionNumber <= 2) {
      responseSet = responses.gentle;
    } else if (userAnxietyLevel === "low" && questionNumber > 3) {
      responseSet = responses.challenging;
    } else {
      responseSet = responses.supportive;
    }

    return responseSet[Math.floor(Math.random() * responseSet.length)];
  };

  // Initial question
  useEffect(() => {
    if (messages.length === 0) {
      setTimeout(() => {
        const openingMessage: Message = {
          id: "opening",
          text: "Thank you for taking the time to meet with me today. I've reviewed your application, and I must say, you've clearly had access to some exceptional resources and opportunities. Now I'd like to understand the person behind these achievements. So let me start with this: You've had access to some of the best resources available—how can you assure us that you've developed personal grit and not just privilege?",
          sender: "ai",
          timestamp: new Date(),
          emotion: "probing"
        };
        setMessages([openingMessage]);
        setAiEmotion("probing");
        setIsAISpeaking(true);
        setTimeout(() => setIsAISpeaking(false), 3000);
      }, 1000);
    }
  }, [messages.length]);

  // Session timer (hidden from UI but still tracking)
  useEffect(() => {
    if (timeRemaining > 0 && !isPaused) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else if (timeRemaining <= 0) {
      onEndSession();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeRemaining, onEndSession, isPaused]);

  // Response timer (hidden from UI but still tracking)
  useEffect(() => {
    if (responseTimeLeft > 0 && !isThinking && !isPaused) {
      responseTimerRef.current = setTimeout(() => {
        setResponseTimeLeft(prev => prev - 1);
      }, 1000);
    }
    
    if (responseTimeLeft === 10 && !isPaused) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }
    
    return () => {
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, [responseTimeLeft, isThinking, isPaused]);

  const handleSendMessage = (message: string) => {
    if (!message.trim()) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: message,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, newMessage]);
    setCurrentMessage("");
    setIsThinking(true);
    setResponseTimeLeft(45);
    setQuestionCount(prev => prev + 1);
    
    const feedback = getCoachingFeedback(message, questionCount);
    
    if (feedback) {
      setActiveToast({
        id: Date.now().toString(),
        type: feedback.type,
        message: feedback.message,
        suggestion: feedback.suggestion,
        pastLearning: feedback.pastLearning
      });
    }

    setTimeout(() => {
      const response = getAdmissionsResponse(message, questionCount);
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: "ai",
        timestamp: new Date(),
        emotion: response.emotion,
        coachingFeedback: feedback || undefined
      };
      
      setMessages(prev => [...prev, aiMessage]);
      setAiEmotion(response.emotion);
      setIsThinking(false);
      setIsAISpeaking(true);
      setTimeout(() => setIsAISpeaking(false), 3000);
      
    }, Math.random() * 2000 + 2000);
  };

  const toggleListening = () => {
    if (isListening) {
      setIsListening(false);
      // Simulate voice input
      const sampleResponses = [
        "I think my experiences have really shaped who I am today. For example, when I volunteered at the local community center, I learned the importance of giving back.",
        "Well, I've always tried to challenge myself. Like when I took that advanced physics course, it pushed me to think differently about problem-solving.",
        "I believe resilience comes from facing real challenges. When our debate team lost the regional finals, I had to learn how to bounce back and motivate my teammates."
      ];
      const randomResponse = sampleResponses[Math.floor(Math.random() * sampleResponses.length)];
      handleSendMessage(randomResponse);
    } else {
      setIsListening(true);
    }
  };

  const closeToast = () => {
    setActiveToast(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-secondary/20 font-editorial relative overflow-hidden">
      {/* Floating Meta Skills - Top Right */}
      <div className="absolute top-6 right-6 z-50 flex flex-wrap gap-2 max-w-xs justify-end">
        {metaSkills.map(skill => (
          <Badge 
            key={skill}
            variant="secondary"
            className="rounded-full px-4 py-1.5 text-xs font-medium bg-primary/10 backdrop-blur-sm border border-primary/20 shadow-sm"
          >
            {skill}
          </Badge>
        ))}
      </div>

      {/* End Interview - Top Left */}
      <button
        onClick={onEndSession}
        className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors bg-muted/50 backdrop-blur-sm rounded-full border border-border shadow-sm"
      >
        <X size={16} />
        End Interview
      </button>

      {/* Main Split Content - No boxes, full page coverage */}
      <div className="flex flex-col h-screen">
        {/* AI Persona Section - Top */}
        <div className="flex-1 flex items-center justify-center py-6 px-6 relative overflow-hidden">
          {/* Depth layer - gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/10 to-transparent" />
          
          {/* Content without card wrapper */}
          <div className="relative z-10 w-full text-center space-y-6">
            {/* Persona Name */}
            <div className="space-y-1">
              <h2 className="text-2xl md:text-3xl font-heading font-medium text-foreground">
                {aiPersona.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                {aiPersona.role}
              </p>
            </div>

            {/* Waveform Visualization */}
            {(isAISpeaking || isThinking) && (
              <WaveformVisualizer 
                isActive={isAISpeaking}
                color="primary"
                className="h-20"
              />
            )}
            
            {/* AI Thinking State */}
            {isThinking && !isAISpeaking && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>Thinking...</span>
              </div>
            )}

            {/* Latest AI message preview */}
            {messages.length > 0 && messages[messages.length - 1].sender === "ai" && !isThinking && (
              <div className="bg-muted/30 backdrop-blur-sm rounded-xl p-4 text-sm text-muted-foreground italic max-h-32 overflow-y-auto mx-auto max-w-lg">
                "{messages[messages.length - 1].text.substring(0, 150)}{messages[messages.length - 1].text.length > 150 ? '...' : ''}"
              </div>
            )}
          </div>
        </div>

        {/* User Section - Bottom with extra padding to avoid nav bar */}
        <div className="flex-1 flex items-center justify-center py-6 px-6 pb-28 relative overflow-hidden">
          {/* Depth layer - different gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-accent/5 via-accent/8 to-transparent" />
          
          {/* Content without card wrapper */}
          <div className="relative z-10 w-full text-center space-y-6">
            {/* User Label */}
            <h2 className="text-2xl md:text-3xl font-heading font-medium text-foreground">
              You
            </h2>

            {/* Waveform Visualization for User */}
            {isListening && (
              <WaveformVisualizer 
                isActive={true}
                color="accent"
                className="h-20"
              />
            )}

            {/* Voice Mode Controls */}
            {isVoiceMode ? (
              <div className="space-y-4">
                <button
                  onClick={toggleListening}
                  disabled={isThinking}
                  className={cn(
                    "w-32 h-32 md:w-36 md:h-36 rounded-full mx-auto flex items-center justify-center transition-all duration-300 shadow-xl",
                    isListening 
                      ? "bg-gradient-to-br from-accent to-destructive animate-pulse scale-110" 
                      : "bg-gradient-to-br from-primary to-primary/70 hover:scale-105 active:scale-95",
                    isThinking && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isListening ? (
                    <MicOff size={40} className="text-white" />
                  ) : (
                    <Mic size={40} className="text-white" />
                  )}
                </button>
                
                <p className="text-sm text-muted-foreground">
                  {isListening ? "Listening..." : isThinking ? "Processing..." : "Tap to speak"}
                </p>

                {/* Switch to Text Mode */}
                <button
                  onClick={() => setIsVoiceMode(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Switch to text
                </button>
              </div>
            ) : (
              /* Text Mode Input */
              <div className="space-y-4 max-w-md mx-auto">
                <textarea
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder="Type your response..."
                  className="w-full min-h-[120px] p-4 bg-muted/50 backdrop-blur-sm rounded-2xl border border-border text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isThinking}
                />
                
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => handleSendMessage(currentMessage)}
                    disabled={!currentMessage.trim() || isThinking}
                    className="w-full rounded-full"
                  >
                    Send Response
                  </Button>
                  
                  <button
                    onClick={() => setIsVoiceMode(true)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Switch to voice
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Coaching Toast Overlay - Top Center */}
      {activeToast && (
        <CoachingToastMinimal
          feedback={activeToast}
          onClose={closeToast}
        />
      )}
    </div>
  );
};

export default CollegeAdmissionsSimulation;
