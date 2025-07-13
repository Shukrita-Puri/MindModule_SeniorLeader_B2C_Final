import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, MessageCircle, Timer, GraduationCap, Brain, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  emotion?: "neutral" | "positive" | "negative" | "probing";
  coachingFeedback?: {
    type: "mental-clarity" | "social-intelligence" | "resilience" | "leadership" | "adaptability" | "creative-thinking";
    message: string;
    suggestion: string;
  };
}

interface CollegeAdmissionsSimulationProps {
  onEndSession: () => void;
  sessionDuration?: number; // in minutes
}

const CollegeAdmissionsSimulation = ({ 
  onEndSession, 
  sessionDuration = 15 
}: CollegeAdmissionsSimulationProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVoiceMode, setIsVoiceMode] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [currentMessage, setCurrentMessage] = useState("");
  const [aiEmotion, setAiEmotion] = useState<"neutral" | "positive" | "negative" | "probing">("neutral");
  const [timeRemaining, setTimeRemaining] = useState(sessionDuration * 60);
  const [responseTimeLeft, setResponseTimeLeft] = useState(45); // 45 seconds for admissions responses
  const [isThinking, setIsThinking] = useState(false);
  const [userAnxietyLevel, setUserAnxietyLevel] = useState<"low" | "medium" | "high">("low");
  const [questionCount, setQuestionCount] = useState(0);
  const [activeToast, setActiveToast] = useState<{
    id: string;
    type: "mental-clarity" | "social-intelligence" | "resilience" | "leadership" | "adaptability" | "creative-thinking";
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
  const { dismiss } = useToast();

  // Clear any existing toasts when component mounts
  useEffect(() => {
    dismiss();
  }, [dismiss]);

  const emotionIcons = {
    neutral: "🎓",
    positive: "😊", 
    negative: "🤔",
    probing: "🧐"
  };

  const emotionColors = {
    neutral: "bg-blue-100 text-blue-700",
    positive: "bg-green-100 text-green-700",
    negative: "bg-gray-100 text-gray-700",
    probing: "bg-yellow-100 text-yellow-700"
  };

  // Initial question when component mounts
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
      }, 1000);
    }
  }, [messages.length]);

  // Session timer
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

  // Response timer
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

  const getPastLearning = (feedbackType: string, questionNumber: number) => {
    // Simulate past learning insights based on user patterns and context
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
      ]
    };

    const learningSet = pastLearnings[feedbackType as keyof typeof pastLearnings] || [];
    return learningSet[questionNumber % learningSet.length];
  };

  // Add coaching type rotation to ensure variety
  const [lastCoachingType, setLastCoachingType] = useState<string>("");
  const [coachingRotation, setCoachingRotation] = useState(0);

  const getCoachingFeedback = (userResponse: string, questionNumber: number) => {
    const responseLength = userResponse.length;
    const lowerResponse = userResponse.toLowerCase();
    
    // Enhanced response analysis
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
    
    // Anxiety and confidence indicators
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

    // Intelligence-based feedback triggering - higher chance to show variety
    const shouldCoach = Math.random() < 0.8; // 80% chance to show coaching
    
    if (!shouldCoach && responseLength > 120 && hasSpecificDetails) {
      // Skip coaching for excellent responses sometimes
      return null;
    }

    // All coaching types with equal priority - randomized selection
    const allFeedbackOptions = [
      // Mental Clarity coaching
      {
        condition: responseLength > 40 && !hasSpecificDetails,
        type: "mental-clarity" as const,
        message: "You're speaking generally, but they want to understand you specifically.",
        suggestion: "Replace abstract statements with concrete moments that reveal your character."
      },
      
      // Social Intelligence coaching
      {
        condition: !showsEmpathy && responseLength > 50,
        type: "social-intelligence" as const,
        message: "You're focused on your own actions but missing the interpersonal dimension.",
        suggestion: "Share how you read emotions, built trust, or navigated different perspectives in this situation."
      },
      {
        condition: mentionsLeadership && !showsEmpathy,
        type: "social-intelligence" as const,
        message: "You mention leadership but haven't shown your people skills.",
        suggestion: "Describe how you connected with others, understood their motivations, or resolved conflicts."
      },
      {
        condition: questionNumber > 1 && !lowerResponse.includes("others") && !lowerResponse.includes("team"),
        type: "social-intelligence" as const,
        message: "Your stories sound isolated. Colleges value collaborative intelligence.",
        suggestion: "Show how you worked with others, influenced peers, or built meaningful relationships."
      },
      
      // Resilience coaching
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
        condition: questionNumber > 2 && !lowerResponse.includes("difficult") && !lowerResponse.includes("challenge"),
        type: "resilience" as const,
        message: "Your responses show success but not struggle. They want to see your resilience.",
        suggestion: "Describe a time you failed, faced rejection, or had to persevere through real difficulty."
      },
      
      // Leadership coaching
      {
        condition: !hasSpecificDetails && mentionsLeadership,
        type: "leadership" as const,
        message: "You mention leadership but lack the concrete examples that make it compelling.",
        suggestion: "Describe specific decisions you made, how you influenced others, and measurable impact you created."
      },
      {
        condition: questionNumber > 2 && !mentionsLeadership && responseLength > 60,
        type: "leadership" as const,
        message: "You're showing individual capability but missing leadership potential.",
        suggestion: "Share how you've guided others, taken initiative, or created positive change in a group setting."
      },
      {
        condition: isConfident && responseLength > 100 && !mentionsLeadership,
        type: "leadership" as const,
        message: "Strong response, but colleges want to see your leadership readiness.",
        suggestion: "Describe a time you stepped up when others hesitated or rallied people around a shared goal."
      },
      
      // Adaptability coaching
      {
        condition: !showsAdaptability && questionNumber > 1,
        type: "adaptability" as const,
        message: "Your responses show planning but not intellectual flexibility.",
        suggestion: "Share how you adjusted when plans failed, learned from unexpected feedback, or embraced new perspectives."
      },
      {
        condition: lowerResponse.includes("plan") && !showsAdaptability,
        type: "adaptability" as const,
        message: "You mention planning, but colleges value those who can pivot when needed.",
        suggestion: "Show how you handled uncertainty, changed course when new information emerged, or thrived in ambiguity."
      },
      {
        condition: questionNumber > 3 && !lowerResponse.includes("change") && responseLength > 70,
        type: "adaptability" as const,
        message: "You're demonstrating consistency but missing adaptability.",
        suggestion: "Describe how you've evolved your thinking, learned from mistakes, or succeeded in unfamiliar situations."
      },
      
      // Creative Thinking coaching
      {
        condition: !showsCreativity && questionNumber > 2,
        type: "creative-thinking" as const,
        message: "Solid response, but you could differentiate yourself with more original thinking.",
        suggestion: "Challenge conventional wisdom, make unexpected connections, or offer a fresh angle on familiar concepts."
      },
      {
        condition: responseLength > 100 && !showsCreativity && questionNumber > 3,
        type: "creative-thinking" as const,
        message: "You're giving thoughtful answers but playing it safe. Take an intellectual risk.",
        suggestion: "Share an unconventional insight, connect disparate ideas, or reveal how you think differently."
      },
      {
        condition: questionNumber > 4 && !lowerResponse.includes("unique") && !lowerResponse.includes("different"),
        type: "creative-thinking" as const,
        message: "Your responses blend into the typical applicant pool. Show your unique perspective.",
        suggestion: "Reveal an unexpected passion, an unusual connection you've made, or a creative solution you've devised."
      }
    ];

    // Filter applicable feedback options
    const applicableOptions = allFeedbackOptions.filter(option => option.condition);
    
    // If no specific conditions met, add fallback options based on rotation
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
        },
        {
          type: "adaptability" as const,
          message: "Nice work - colleges also value intellectual flexibility.",
          suggestion: "Show how you've adapted to new situations, changed your mind, or learned from feedback."
        },
        {
          type: "creative-thinking" as const,
          message: "Good foundation - distinguish yourself with original thinking.",
          suggestion: "Share an unconventional insight, unexpected connection, or creative approach you've taken."
        },
        {
          type: "mental-clarity" as const,
          message: "Clear communication - now add more depth and structure.",
          suggestion: "Use specific examples with situation, action, and result to make your points more compelling."
        }
      ];
      
      // Use rotation to ensure variety
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

    // Smart selection: avoid repeating the same coaching type
    let selectedFeedback;
    if (applicableOptions.length > 1) {
      // Filter out the last coaching type to ensure variety
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
    // Analyze user response for anxiety/evasiveness
    const responseLength = userResponse.length;
    const isVague = !userResponse.includes("specific") && responseLength < 100;
    const isEvasive = userResponse.toLowerCase().includes("usually") || 
                      userResponse.toLowerCase().includes("generally") ||
                      !userResponse.toLowerCase().includes("i");

    // Adjust anxiety level based on response quality
    if (isVague || isEvasive) {
      setUserAnxietyLevel("high");
    } else if (responseLength > 150) {
      setUserAnxietyLevel("low");
    } else {
      setUserAnxietyLevel("medium");
    }

    // Admissions officer responses based on question progression and user anxiety
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

    // Choose response type based on user anxiety and question progression
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
    
    // Get coaching feedback (now returns null sometimes)
    const feedback = getCoachingFeedback(message, questionCount);
    
    // Only show toast if coaching is triggered
    if (feedback) {
      setActiveToast({
        id: Date.now().toString(),
        type: feedback.type,
        message: feedback.message,
        suggestion: feedback.suggestion,
        pastLearning: feedback.pastLearning
      });
      setIsPaused(true);
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
      
    }, Math.random() * 2000 + 2000); // 2-4 second delay for realism
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
  };

  const startListening = () => {
    setIsListening(true);
    setTimeout(() => {
      setIsListening(false);
    }, 3000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const responseProgress = ((45 - responseTimeLeft) / 45) * 100;

  const closeToast = () => {
    setActiveToast(null);
    setIsPaused(false);
  };

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Custom Toast Overlay */}
      {activeToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop blur */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeToast} />
          
          {/* Toast content */}
          <div className={cn(
            "relative p-6 rounded-xl shadow-2xl max-w-md mx-4 border backdrop-blur-sm",
            activeToast.type === "mental-clarity" && "bg-gradient-to-br from-blue-100 to-blue-200 text-blue-900 border-blue-300",
            activeToast.type === "social-intelligence" && "bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-900 border-emerald-300", 
            activeToast.type === "resilience" && "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-900 border-orange-300",
            activeToast.type === "leadership" && "bg-gradient-to-br from-violet-100 to-violet-200 text-violet-900 border-violet-300",
            activeToast.type === "adaptability" && "bg-gradient-to-br from-teal-100 to-teal-200 text-teal-900 border-teal-300",
            activeToast.type === "creative-thinking" && "bg-gradient-to-br from-rose-100 to-rose-200 text-rose-900 border-rose-300"
          )}>
            <button
              onClick={closeToast}
              className="absolute top-2 right-2 p-1 hover:bg-black/10 rounded-full transition-colors"
            >
              <X size={16} className="text-current" />
            </button>
            
            <div className="mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Brain size={20} />
                {activeToast.type.split('-').map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Coaching
              </h3>
            </div>
            
            <div className="space-y-3">
              <p className="text-sm font-medium">{activeToast.message}</p>
              <p className="text-sm opacity-80">{activeToast.suggestion}</p>
              
              {activeToast.pastLearning && (
                <div className="bg-black/5 rounded-lg p-3 border border-black/10">
                  <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                    <Target size={12} />
                    Mind Module Intelligence
                  </p>
                  <p className="text-xs opacity-70 mb-2 italic">Pattern from: {activeToast.pastLearning.context}</p>
                  <p className="text-xs font-medium text-current">{activeToast.pastLearning.insight}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Header with Timer */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="text-xs flex items-center gap-1">
            <GraduationCap size={12} />
            College Interview
          </Badge>
          
          <Button
            onClick={onEndSession}
            variant="default"
            size="sm"
            className="px-4 py-2 text-sm rounded-lg hover:scale-105 active:scale-95 transition-all duration-200"
          >
            End Interview
          </Button>
          
        </div>
        
        <div className="flex items-center gap-4">
          {/* Session Timer */}
          <div className="flex items-center gap-2">
            <Timer size={16} className="text-muted-foreground" />
            <span className="text-sm font-mono text-foreground">
              {formatTime(timeRemaining)}
            </span>
          </div>
          
          {/* Response Timer Circle */}
          <div className="relative w-8 h-8">
            <svg className="w-8 h-8 transform -rotate-90">
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-muted-foreground/20"
              />
              <circle
                cx="16"
                cy="16"
                r="14"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 14}`}
                strokeDashoffset={`${2 * Math.PI * 14 * (1 - responseProgress / 100)}`}
                className={cn(
                  "transition-all duration-1000",
                  responseTimeLeft <= 10 ? "text-yellow-500" : "text-primary"
                )}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-mono">
              {responseTimeLeft}
            </span>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-80 min-h-0">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex",
              message.sender === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] p-3 rounded-lg",
                message.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              )}
            >
              <p className="text-sm leading-relaxed">{message.text}</p>
              <p className="text-xs opacity-70 mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-card border border-border p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-100"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse delay-200"></div>
                <span className="text-sm text-muted-foreground ml-2">Interviewer is thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="fixed bottom-24 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-3 pb-4 z-40 shadow-lg">
        <div className="flex items-center gap-3 max-w-xl mx-auto">
          {/* Text Input Area */}
          <div className="flex-1">
            {!isVoiceMode ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(currentMessage);
                    }
                  }}
                  placeholder="Share your thoughtful response..."
                  className="flex-1 px-3 py-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary bg-background text-foreground text-sm touch-manipulation"
                />
                <Button
                  onClick={() => handleSendMessage(currentMessage)}
                  disabled={!currentMessage.trim()}
                  size="sm"
                  className="px-4 py-3 min-h-[48px] touch-manipulation"
                >
                  Respond
                </Button>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-2">
                <Button
                  onClick={startListening}
                  disabled={isListening}
                  className={cn(
                    "min-w-[56px] min-h-[56px] w-14 h-14 rounded-full transition-all duration-300 shadow-lg touch-manipulation",
                    isListening 
                      ? "bg-red-500 hover:bg-red-600 scale-110 animate-pulse" 
                      : "bg-primary hover:bg-primary/90 hover:scale-105 active:scale-95"
                  )}
                >
                  {isListening ? (
                    <div className="w-4 h-4 bg-white rounded-full animate-pulse"></div>
                  ) : (
                    <Mic size={24} />
                  )}
                </Button>
                <p className="text-xs mt-1">
                  {isListening ? "Listening..." : "Tap to speak"}
                </p>
              </div>
            )}
          </div>

          {/* Voice Mode Toggle */}
          <Button
            onClick={toggleVoiceMode}
            variant="secondary"
            size="lg"
            className="min-w-[48px] min-h-[48px] w-12 h-12 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 touch-manipulation"
          >
            {isVoiceMode ? (
              <MessageCircle size={20} className="text-primary" />
            ) : (
              <Mic size={20} className="text-primary" />
            )}
          </Button>

          {/* Interviewer Avatar with Emotion */}
          <div className="relative">
            <Button
              className={cn(
                "min-w-[48px] min-h-[48px] w-12 h-12 rounded-full text-base shadow-lg transition-all duration-300 touch-manipulation",
                emotionColors[aiEmotion]
              )}
            >
              {emotionIcons[aiEmotion]}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollegeAdmissionsSimulation;