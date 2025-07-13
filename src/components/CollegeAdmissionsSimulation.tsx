import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, MessageCircle, Timer, GraduationCap, Brain, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  const getCoachingFeedback = (userResponse: string, questionNumber: number) => {
    const responseLength = userResponse.length;
    const hasPersonalStory = userResponse.toLowerCase().includes("i") && 
                            (userResponse.includes("when") || userResponse.includes("time"));
    const hasSpecificDetails = userResponse.match(/\d/) || 
                               userResponse.includes("specific") || 
                               userResponse.includes("example");
    const showsVulnerability = userResponse.toLowerCase().includes("mistake") ||
                               userResponse.toLowerCase().includes("failed") ||
                               userResponse.toLowerCase().includes("learned") ||
                               userResponse.toLowerCase().includes("struggle");
    const showsEmpathy = userResponse.toLowerCase().includes("others") ||
                        userResponse.toLowerCase().includes("team") ||
                        userResponse.toLowerCase().includes("helped");
    const showsAdaptability = userResponse.toLowerCase().includes("changed") ||
                             userResponse.toLowerCase().includes("adapted") ||
                             userResponse.toLowerCase().includes("different");
    const showsCreativity = userResponse.toLowerCase().includes("creative") ||
                           userResponse.toLowerCase().includes("innovative") ||
                           userResponse.toLowerCase().includes("unique");

    let feedbackType: "mental-clarity" | "social-intelligence" | "resilience" | "leadership" | "adaptability" | "creative-thinking";
    let message: string;
    let suggestion: string;

    // Rotate through different feedback types to show variety
    const feedbackOptions = [
      {
        condition: responseLength < 50,
        type: "mental-clarity" as const,
        message: "Your response could benefit from more depth and structure.",
        suggestion: "Try the STAR method: Situation, Task, Action, Result. This helps organize complex thoughts clearly."
      },
      {
        condition: !showsEmpathy && questionNumber % 6 === 1,
        type: "social-intelligence" as const,
        message: "Consider how your response demonstrates emotional awareness and social connection.",
        suggestion: "Share how you read the room, understood others' perspectives, or built trust with teammates."
      },
      {
        condition: !showsVulnerability && questionNumber % 6 === 2,
        type: "resilience" as const,
        message: "Strong responses show how you bounce back from setbacks and regulate stress.",
        suggestion: "Mention specific strategies you use to stay calm under pressure or recover from failures."
      },
      {
        condition: !hasSpecificDetails && questionNumber % 6 === 3,
        type: "leadership" as const,
        message: "Leadership isn't just about titles - it's about influence and inspiring others.",
        suggestion: "Describe how you motivated others, facilitated collaboration, or took initiative when no one else would."
      },
      {
        condition: !showsAdaptability && questionNumber % 6 === 4,
        type: "adaptability" as const,
        message: "Admissions officers value students who thrive in changing environments.",
        suggestion: "Highlight how you pivoted when plans changed, learned new skills quickly, or found creative solutions."
      },
      {
        condition: !showsCreativity && questionNumber % 6 === 5,
        type: "creative-thinking" as const,
        message: "Show your ability to think outside conventional frameworks.",
        suggestion: "Connect seemingly unrelated ideas, challenge assumptions, or describe unconventional approaches you've taken."
      }
    ];

    // Find the first applicable feedback or default to positive reinforcement
    const applicableFeedback = feedbackOptions.find(option => option.condition);
    
    if (applicableFeedback) {
      feedbackType = applicableFeedback.type;
      message = applicableFeedback.message;
      suggestion = applicableFeedback.suggestion;
    } else {
      // Positive reinforcement with growth mindset
      const positiveOptions = [
        {
          type: "mental-clarity" as const,
          message: "Excellent clarity and structure in your response!",
          suggestion: "Your organized thinking is evident. Consider adding one more concrete detail to make it even more compelling."
        },
        {
          type: "social-intelligence" as const,
          message: "Great demonstration of emotional intelligence and social awareness!",
          suggestion: "You're showing strong people skills. Think about how this translates to building community on campus."
        },
        {
          type: "resilience" as const,
          message: "Your growth mindset and ability to learn from challenges really shines through!",
          suggestion: "This resilience will serve you well in college. Consider sharing how you'll apply these lessons going forward."
        }
      ];
      
      const randomPositive = positiveOptions[questionNumber % positiveOptions.length];
      feedbackType = randomPositive.type;
      message = randomPositive.message;
      suggestion = randomPositive.suggestion;
    }

    const pastLearning = getPastLearning(feedbackType, questionNumber);

    return {
      type: feedbackType,
      message,
      suggestion,
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
    
    // Get coaching feedback
    const feedback = getCoachingFeedback(message, questionCount);
    
    // Show custom toast with coaching feedback and pause timers
    setActiveToast({
      id: Date.now().toString(),
      type: feedback.type,
      message: feedback.message,
      suggestion: feedback.suggestion,
      pastLearning: feedback.pastLearning
    });
    setIsPaused(true);

    setTimeout(() => {
      const response = getAdmissionsResponse(message, questionCount);
      
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.text,
        sender: "ai",
        timestamp: new Date(),
        emotion: response.emotion,
        coachingFeedback: feedback
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
          
          {/* Demo Toast Buttons */}
          <div className="flex gap-1 flex-wrap">
            <Button
              onClick={() => {
                setActiveToast({
                  id: "demo-social",
                  type: "social-intelligence",
                  message: "Your response shows good awareness, but consider demonstrating deeper emotional intelligence.",
                  suggestion: "Try acknowledging the interviewer's perspective and show how you build rapport with different personality types.",
                  pastLearning: {
                    context: "WhatsApp analysis shows you excel at reading social cues in group chats",
                    insight: "Apply that same social radar you use in digital conversations to face-to-face interactions"
                  }
                });
                setIsPaused(true);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Social
            </Button>
            
            <Button
              onClick={() => {
                setActiveToast({
                  id: "demo-resilience",
                  type: "resilience",
                  message: "Great start! Now show how you regulate stress and bounce back from setbacks.",
                  suggestion: "Share specific techniques you use to stay calm under pressure and how you reframe challenges as growth opportunities.",
                  pastLearning: {
                    context: "Heart rate data shows you've improved stress management during exam periods",
                    insight: "Use those same breathing techniques that helped you stay centered during finals"
                  }
                });
                setIsPaused(true);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Resilience
            </Button>
            
            <Button
              onClick={() => {
                setActiveToast({
                  id: "demo-leadership",
                  type: "leadership",
                  message: "You're touching on leadership, but dig deeper into your influence style.",
                  suggestion: "Describe how you motivate others without formal authority and how you handle conflict within teams.",
                  pastLearning: {
                    context: "Calendar shows you consistently organize study groups and social events",
                    insight: "Draw on that natural organizing ability that makes people want to follow your lead"
                  }
                });
                setIsPaused(true);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Leadership
            </Button>
            
            <Button
              onClick={() => {
                setActiveToast({
                  id: "demo-adaptability",
                  type: "adaptability",
                  message: "Excellent! Now showcase your cognitive flexibility and openness to change.",
                  suggestion: "Share a time when you had to pivot quickly, learn something completely new, or challenge your own assumptions.",
                  pastLearning: {
                    context: "App usage shows you quickly adapt to new features and workflows",
                    insight: "Transfer that same curiosity and quick learning you show with technology to human situations"
                  }
                });
                setIsPaused(true);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Adaptability
            </Button>
            
            <Button
              onClick={() => {
                setActiveToast({
                  id: "demo-creative",
                  type: "creative-thinking",
                  message: "I can sense your creativity! Push beyond conventional thinking patterns.",
                  suggestion: "Connect seemingly unrelated concepts, challenge the premise of the question, or offer a completely fresh perspective.",
                  pastLearning: {
                    context: "Search history shows diverse interests from quantum physics to ancient philosophy",
                    insight: "Use that cross-domain thinking that helps you see patterns others miss"
                  }
                });
                setIsPaused(true);
              }}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              Creative
            </Button>
          </div>
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