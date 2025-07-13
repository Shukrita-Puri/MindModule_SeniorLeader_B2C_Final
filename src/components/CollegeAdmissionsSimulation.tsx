import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, MessageCircle, Timer, GraduationCap, Brain, Target } from "lucide-react";
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
  
  const { toast } = useToast();
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
    if (timeRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setTimeRemaining(prev => prev - 1);
      }, 1000);
    } else {
      onEndSession();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeRemaining, onEndSession]);

  // Response timer
  useEffect(() => {
    if (responseTimeLeft > 0 && !isThinking) {
      responseTimerRef.current = setTimeout(() => {
        setResponseTimeLeft(prev => prev - 1);
      }, 1000);
    }
    
    if (responseTimeLeft === 10) {
      if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    }
    
    return () => {
      if (responseTimerRef.current) clearTimeout(responseTimerRef.current);
    };
  }, [responseTimeLeft, isThinking]);

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

    // Analyze response for coaching feedback
    if (responseLength < 50) {
      return {
        type: "mental-clarity" as const,
        message: "Your response could benefit from more depth and detail.",
        suggestion: "Try expanding with a specific example or personal story. Admissions officers want to see your thought process."
      };
    }

    if (!hasPersonalStory && questionNumber > 2) {
      return {
        type: "social-intelligence" as const,
        message: "Consider sharing a personal experience to connect with the interviewer.",
        suggestion: "Stories help admissions officers understand who you really are beyond your achievements."
      };
    }

    if (!hasSpecificDetails) {
      return {
        type: "leadership" as const,
        message: "Adding concrete details would strengthen your response.",
        suggestion: "Specific examples, numbers, or outcomes show the real impact of your actions."
      };
    }

    if (questionNumber > 3 && !showsVulnerability) {
      return {
        type: "resilience" as const,
        message: "Great response! Consider showing more authenticity by sharing challenges or growth.",
        suggestion: "Admissions officers value students who can reflect on their struggles and learning."
      };
    }

    return {
      type: "creative-thinking" as const,
      message: "Excellent response! You're demonstrating strong self-awareness.",
      suggestion: "Keep this level of authenticity and depth throughout the interview."
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
    
    // Show toast with coaching feedback
    toast({
      title: `💡 ${feedback.type.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} Coaching`,
      description: `${feedback.message} ${feedback.suggestion}`,
      duration: 8000
    });

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

  return (
    <div className="flex flex-col h-full bg-background">
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