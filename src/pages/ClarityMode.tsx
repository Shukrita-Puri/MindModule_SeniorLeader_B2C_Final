
import { useState, useEffect } from "react";
import { ArrowLeft, Archive, Tag, Search, Calendar, Pin, FileText, Mail, Image, Clock, Send, X, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import MainNavigation from "@/components/MainNavigation";
import clarityImage from "@/assets/vibrant-growth-illustration.png";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  tags?: string[];
  recommendations?: Array<{
    id: string;
    type: "article" | "podcast" | "video" | "framework" | "quote" | "visual";
    title: string;
    description: string;
    content?: string;
    author?: string;
    duration?: string;
  }>;
}

interface Session {
  id: string;
  timestamp: Date;
  messages: Message[];
  tags: string[];
  title: string;
  mode: "conversation" | "journal";
  isPinned?: boolean;
}

const ClarityMode = () => {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<"entry" | "session" | "archive">("entry");
  const [mode, setMode] = useState<"conversation" | "journal">("conversation");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const prompts = [
    "What's been heavy lately?",
    "Where do you feel stuck?",
    "What would courage look like here?",
    "What are you carrying that isn't yours?",
    "How do you want to grow from this?",
    "What needs your attention right now?",
    "What would your wisest self say?",
    "What patterns do you notice?",
    "What's asking for space in your mind?",
    "How are you feeling beneath the surface?"
  ];

  const domains = [
    "Mental Clarity", "Inner Calibration", "Social Intelligence", 
    "Flow State", "Self-Directed Growth", "Time & Energy Management", 
    "Resilience & Identity"
  ];

  const emotions = [
    "anxious", "overwhelmed", "excited", "doubtful", "focused", 
    "frustrated", "hopeful", "confused", "motivated", "tired"
  ];

  // Rotate prompts every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPromptIndex((prev) => (prev + 1) % prompts.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const autoTagMessage = (text: string): string[] => {
    const tags: string[] = [];
    
    // Emotion detection
    emotions.forEach(emotion => {
      if (text.toLowerCase().includes(emotion)) {
        tags.push(emotion);
      }
    });
    
    // Topic detection (basic keywords)
    const topicKeywords = {
      "academics": ["study", "exam", "grade", "school", "homework", "test"],
      "relationships": ["friend", "parent", "family", "relationship", "social"],
      "future": ["career", "college", "future", "goals", "ambition"],
      "pressure": ["stress", "pressure", "overwhelm", "burden", "expectation"],
      "identity": ["who am i", "identity", "self", "worth", "confidence"]
    };
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => text.toLowerCase().includes(keyword))) {
        tags.push(topic);
      }
    });
    
    return tags.slice(0, 3); // Limit to 3 tags
  };

  const generateAIResponse = (userMessage: string): Message => {
    const responses = [
      {
        text: "I hear the weight in your words. This reminds me of what Viktor Frankl wrote about finding meaning in difficulty...",
        recommendations: [
          {
            id: "1",
            type: "quote" as const,
            title: "Viktor Frankl on Meaning",
            description: "When we are no longer able to change a situation, we are challenged to change ourselves.",
            content: "Everything can be taken from a man but one thing: the last of human freedoms—to choose one's attitude in any given set of circumstances.",
            author: "Viktor Frankl, Holocaust survivor & psychiatrist"
          },
          {
            id: "2",
            type: "framework" as const,
            title: "The Stoic Dichotomy of Control",
            description: "Ancient wisdom for modern pressure. Separate what you can and cannot influence.",
            content: "Focus your energy only on what you can control: your thoughts, actions, and responses.",
            author: "Epictetus, Stoic philosopher"
          }
        ]
      },
      {
        text: "There's something profound happening in what you're sharing. Research shows that acknowledging difficulty is the first step toward clarity...",
        recommendations: [
          {
            id: "3",
            type: "article" as const,
            title: "The Neuroscience of Emotional Regulation",
            description: "How naming emotions reduces their intensity. From UCLA's research lab.",
            author: "Dr. Matthew Lieberman, UCLA",
            duration: "5 min read"
          },
          {
            id: "4",
            type: "framework" as const,
            title: "RAIN Technique",
            description: "Recognize, Allow, Investigate, Non-attachment. A mindfulness approach to difficult emotions.",
            content: "1. Recognize what's happening\n2. Allow the experience to be there\n3. Investigate with kindness\n4. Non-attachment to the outcome",
            author: "Tara Brach, psychologist"
          }
        ]
      },
      {
        text: "Your mind is doing what minds do—trying to solve everything at once. Let's create some space here...",
        recommendations: [
          {
            id: "5",
            type: "visual" as const,
            title: "The Mind as Sky Meditation",
            description: "A visualization to create perspective on thoughts and emotions.",
            content: "Imagine your thoughts as clouds passing through the vast sky of your awareness. You are the sky, not the clouds.",
            author: "Tibetan Buddhist tradition"
          },
          {
            id: "6",
            type: "podcast" as const,
            title: "Cal Newport on Deep Work and Mental Clarity",
            description: "How elite students manage cognitive load and maintain focus under pressure.",
            author: "The Tim Ferriss Show",
            duration: "18 min"
          }
        ]
      }
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    return {
      id: Date.now().toString(),
      text: randomResponse.text,
      sender: "ai",
      timestamp: new Date(),
      recommendations: randomResponse.recommendations,
      tags: autoTagMessage(userMessage)
    };
  };

  const handleSendMessage = () => {
    if (!currentInput.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: currentInput,
      sender: "user",
      timestamp: new Date(),
      tags: autoTagMessage(currentInput)
    };

    setMessages(prev => [...prev, userMessage]);
    setCurrentInput("");

    // In journal mode, don't generate AI response
    if (mode === "journal") {
      return;
    }

    // Generate AI response after delay
    setIsTyping(true);
    setTimeout(() => {
      const aiResponse = generateAIResponse(currentInput);
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 2000);
  };

  const handleEndSession = () => {
    if (messages.length === 0) return;

    const allTags = messages.flatMap(m => m.tags || []);
    const uniqueTags = [...new Set(allTags)];
    
    const newSession: Session = {
      id: Date.now().toString(),
      timestamp: new Date(),
      messages,
      tags: uniqueTags,
      title: messages[0]?.text.slice(0, 50) + "..." || "Untitled Session",
      mode
    };

    setSessions(prev => [newSession, ...prev]);
    setMessages([]);
    setCurrentView("archive");
  };

  const handlePromptClick = (prompt: string) => {
    setCurrentInput(prompt);
  };

  const renderRecommendation = (rec: any) => (
    <Card key={rec.id} className="mb-4 border-l-4 border-l-primary bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <Badge variant="secondary" className="text-xs">
            {rec.type}
          </Badge>
          {rec.duration && (
            <span className="text-xs text-muted-foreground">{rec.duration}</span>
          )}
        </div>
        <h4 className="font-serif text-sm font-medium mb-1">{rec.title}</h4>
        <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
        {rec.content && (
          <p className="text-sm italic border-l-2 border-muted pl-3 text-foreground/80">
            {rec.content}
          </p>
        )}
        {rec.author && (
          <p className="text-xs text-muted-foreground mt-2">— {rec.author}</p>
        )}
      </CardContent>
    </Card>
  );

  if (currentView === "archive") {
    return (
      <div className="min-h-screen bg-background font-serif">
        {/* Archive Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              onClick={() => setCurrentView("entry")}
              className="text-foreground hover:bg-muted"
            >
              <ArrowLeft size={16} className="mr-2" />
              Back to Clarity
            </Button>
            <h1 className="text-xl font-serif font-medium">Memory Archive</h1>
            <div className="w-20" />
          </div>
          
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search your sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[...new Set(sessions.flatMap(s => s.tags))].slice(0, 8).map(tag => (
                <Badge
                  key={tag}
                  variant={selectedTags.includes(tag) ? "default" : "secondary"}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    setSelectedTags(prev => 
                      prev.includes(tag) 
                        ? prev.filter(t => t !== tag)
                        : [...prev, tag]
                    );
                  }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions List */}
        <div className="p-6 max-w-4xl mx-auto">
          <div className="grid gap-4">
            {sessions
              .filter(session => 
                (!searchQuery || session.title.toLowerCase().includes(searchQuery.toLowerCase())) &&
                (selectedTags.length === 0 || selectedTags.some(tag => session.tags.includes(tag)))
              )
              .map(session => (
                <Card key={session.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-serif font-medium text-foreground mb-1">
                          {session.title}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock size={12} />
                          {session.timestamp.toLocaleDateString()}
                          <Badge variant="outline" className="text-xs">
                            {session.mode}
                          </Badge>
                        </div>
                      </div>
                      {session.isPinned && <Pin size={16} className="text-primary" />}
                    </div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {session.tags.slice(0, 5).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {session.messages.length} messages
                    </p>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      </div>
    );
  }

  if (currentView === "session") {
    return (
      <div className="min-h-screen bg-background flex flex-col font-serif">
        {/* Session Header */}
        <div className="border-b border-border p-4 bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-xs font-medium">
                {mode === "journal" ? "Private Journal" : "Clarity Conversation"}
              </Badge>
              <div className="flex gap-1">
                {messages.flatMap(m => m.tags || []).slice(0, 3).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/memory-archive")}
              >
                <Archive size={16} />
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEndSession}
                >
                  End Session
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-3xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="text-center py-16">
              <h2 className="text-2xl font-serif font-medium text-foreground mb-4">
                {mode === "journal" ? "Your Private Space" : "What's on Your Mind?"}
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                {mode === "journal" 
                  ? "Write freely. Your thoughts are safe here." 
                  : "Share what you're thinking about, and I'll offer insights and wisdom to help you find clarity."
                }
              </p>
            </div>
          )}

          <div className="space-y-8">
            {messages.map((message) => (
              <div key={message.id} className={`${message.sender === "user" ? "ml-8" : "mr-8"}`}>
                <div className={`${
                  message.sender === "user" 
                    ? "bg-primary/5 border-l-4 border-l-primary" 
                    : "bg-muted/30"
                } p-6 rounded-lg`}>
                  <p className="text-foreground leading-relaxed font-serif">
                    {message.text}
                  </p>
                  {message.tags && message.tags.length > 0 && (
                    <div className="flex gap-1 mt-3">
                      {message.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommendations */}
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="mt-6 ml-6">
                    <h4 className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wide">
                      Recommended Resources
                    </h4>
                    <div className="space-y-4">
                      {message.recommendations.map(renderRecommendation)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isTyping && (
            <div className="mr-8 mt-8">
              <div className="bg-muted/30 p-6 rounded-lg">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: "0.2s"}} />
                  <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: "0.4s"}} />
                  <span className="ml-2 text-sm">Reflecting...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-background/95 backdrop-blur p-6 pb-24">
          <div className="max-w-3xl mx-auto">
            {/* Recommended Questions */}
            <div className="mb-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide text-center">
                Recommended Questions
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handlePromptClick("How can I manage academic pressure better?")}
                  className="text-left p-2 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-serif"
                >
                  How can I manage academic pressure better?
                </button>
                <button
                  onClick={() => handlePromptClick("What's causing my overthinking lately?")}
                  className="text-left p-2 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-serif"
                >
                  What's causing my overthinking lately?
                </button>
                <button
                  onClick={() => handlePromptClick("How do I balance expectations and self-care?")}
                  className="text-left p-2 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-serif"
                >
                  How do I balance expectations and self-care?
                </button>
                <button
                  onClick={() => handlePromptClick("What would help me feel more confident?")}
                  className="text-left p-2 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-serif"
                >
                  What would help me feel more confident?
                </button>
              </div>
            </div>

            {/* Rotating Prompts */}
            <div className="text-center mb-4">
              <button
                onClick={() => handlePromptClick(prompts[currentPromptIndex])}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors italic font-serif"
              >
                "{prompts[currentPromptIndex]}"
              </button>
            </div>

            {/* Input Field */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Textarea
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  placeholder="Type your thoughts..."
                  className="resize-none border-border focus:border-primary bg-background font-serif"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  title="Add attachments (Gmail, Calendar, Photos, Files)"
                >
                  <Plus size={16} />
                </Button>
                <Button
                  onClick={handleSendMessage}
                  disabled={!currentInput.trim()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Send size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Bottom Navigation */}
        <MainNavigation />
      </div>
    );
  }

  // Entry Screen
  return (
    <div className="min-h-screen bg-background font-serif">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/inner-architect")}
            className="text-foreground hover:bg-muted"
          >
            <ArrowLeft size={16} className="mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-serif font-medium">Clarity</h1>
          <div className="w-20" />
        </div>
      </div>

      {/* Entry Content */}
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        {/* Circular Image */}
        <div className="w-32 h-32 mx-auto mb-8 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <img 
            src={clarityImage} 
            alt="Mental Clarity" 
            className="w-24 h-24 object-contain"
          />
        </div>
        
        <h2 className="text-3xl font-serif font-medium text-foreground mb-6">
          Mental Clarity
        </h2>
        
        <p className="text-lg text-muted-foreground leading-relaxed mb-12">
          A space for thinking clearly, feeling grounded, and growing intentionally.
        </p>

        {/* Mode Selection */}
        <div className="flex justify-center gap-4 mb-12">
          <Button
            variant={mode === "conversation" ? "default" : "outline"}
            onClick={() => setMode("conversation")}
            className="px-8 py-4 text-base font-serif"
          >
            Conversation
          </Button>
          <Button
            variant={mode === "journal" ? "default" : "outline"}
            onClick={() => setMode("journal")}
            className="px-8 py-4 text-base font-serif"
          >
            Journal
          </Button>
        </div>

        <div className="text-center mb-8">
          <p className="text-sm text-muted-foreground mb-4">
            {mode === "conversation" 
              ? "Share your thoughts and receive insights backed by science, wisdom traditions, and real experience."
              : "Private writing space with optional gentle insights and mental models."
            }
          </p>
        </div>

        <Button
          onClick={() => setCurrentView("session")}
          className="px-12 py-4 text-lg font-serif bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Begin {mode === "conversation" ? "Conversation" : "Journaling"}
        </Button>
      </div>
    </div>
  );
};

export default ClarityMode;
