import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send, RotateCcw, Plus, Mic, Archive, BookOpen, Lightbulb, Target, Brain } from "lucide-react";
import ClearBackButton from "@/components/ClearBackButton";
import SessionFeedback from "@/components/SessionFeedback";
// Removed RecommendationModal import - using inline modal instead

interface Message {
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  tags?: string[];
  recommendations?: any[];
  insights?: {
    mentalModels?: string[];
    ancientWisdom?: string[];
    modernScience?: string[];
    frameworks?: string[];
    resources?: { type: string; title: string; description: string }[];
  };
}

const ClarityConversation = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(0);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);

  const prompts = [
    "What's on your mind right now?",
    "What challenge are you facing today?",
    "How are you feeling in this moment?",
    "What would you like to explore together?",
    "What's been weighing on you lately?"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPrompt(prev => (prev + 1) % prompts.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const autoTagMessage = (text: string): string[] => {
    const tags: string[] = [];
    
    // Emotion detection
    if (/anxious|worried|stress|nervous|fear/.test(text.toLowerCase())) tags.push('anxiety');
    if (/sad|down|depressed|low/.test(text.toLowerCase())) tags.push('sadness');
    if (/angry|mad|furious|irritated/.test(text.toLowerCase())) tags.push('anger');
    if (/happy|joy|excited|great/.test(text.toLowerCase())) tags.push('happiness');
    
    // Topic detection
    if (/work|job|career|boss|colleague/.test(text.toLowerCase())) tags.push('work');
    if (/relationship|friend|family|partner/.test(text.toLowerCase())) tags.push('relationships');
    if (/health|sick|tired|energy/.test(text.toLowerCase())) tags.push('health');
    if (/goal|future|plan|dream/.test(text.toLowerCase())) tags.push('goals');
    
    return tags;
  };

  const generateAIResponse = (userMessage: string): Message => {
    const tags = autoTagMessage(userMessage);
    
    const responses = [
      "I hear you. That sounds like a significant experience. What aspect of this feels most important to you right now?",
      "Thank you for sharing that with me. How long has this been on your mind?",
      "That's a meaningful reflection. What do you think might be driving these feelings?",
      "I appreciate your openness. What would it look like if this situation improved?",
      "That sounds challenging. What resources or strengths do you already have that might help?",
      "I can sense the importance of this for you. What's one small step that feels manageable right now?"
    ];

    const recommendations = [
      {
        type: 'practice',
        title: 'Breathing Reset',
        description: 'Quick 2-minute breathing exercise',
        icon: '🫁',
        action: () => navigate('/recalibrate/breathwork')
      },
      {
        type: 'reflection',
        title: 'Explore Deeper',
        description: 'Journal about this topic',
        icon: '📝',
        action: () => navigate('/clarity/journal')
      },
      {
        type: 'scenario',
        title: 'Practice Response',
        description: 'Simulate handling this situation',
        icon: '🎭',
        action: () => navigate('/scenario-lab')
      }
    ];

    // Generate insights based on conversation
    const insights = {
      mentalModels: [
        "Growth Mindset: Challenges are opportunities to learn",
        "Cognitive Reframing: Changing perspective on difficult situations"
      ],
      ancientWisdom: [
        "Stoicism: Focus on what you can control",
        "Buddhist Mindfulness: Observe thoughts without judgment"
      ],
      modernScience: [
        "Neuroplasticity: Your brain can change and adapt",
        "Cognitive Behavioral Therapy: Thoughts influence feelings and actions"
      ],
      frameworks: [
        "STOP Technique: Stop, Take a breath, Observe, Proceed",
        "5-4-3-2-1 Grounding: Use your senses to stay present"
      ],
      resources: [
        { type: 'podcast', title: 'The Tim Ferriss Show', description: 'Interview on mental resilience' },
        { type: 'article', title: 'Harvard Business Review', description: 'Managing stress and uncertainty' },
        { type: 'video', title: 'TED Talk', description: 'The power of vulnerability by Brené Brown' }
      ]
    };

    return {
      text: responses[Math.floor(Math.random() * responses.length)],
      sender: 'ai',
      timestamp: new Date(),
      tags,
      recommendations: Math.random() > 0.5 ? recommendations.slice(0, 2) : [],
      insights: Math.random() > 0.3 ? insights : undefined
    };
  };

  const handleSendMessage = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      text: input,
      sender: 'user',
      timestamp: new Date(),
      tags: autoTagMessage(input)
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const aiResponse = generateAIResponse(input);
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handleEndSession = () => {
    setShowFeedback(true);
  };

  const handleFeedbackSubmit = (feedback: any) => {
    setShowFeedback(false);
    navigate('/clarity/summary', { state: { messages } });
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    navigate('/clarity/summary', { state: { messages } });
  };

  const renderRecommendation = (rec: any) => (
    <div 
      key={rec.title}
      className="bg-muted/50 border border-border rounded-lg p-4 cursor-pointer hover:bg-muted transition-colors"
      onClick={() => setSelectedRecommendation(rec)}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-xl">{rec.icon}</span>
        <span className="font-medium text-foreground">{rec.title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{rec.description}</p>
    </div>
  );

  if (showFeedback) {
    return (
      <SessionFeedback
        onSubmit={handleFeedbackSubmit}
        onSkip={handleFeedbackSkip}
        sessionType="conversation"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background font-editorial flex flex-col pb-32">
      <ClearBackButton />
      
      {/* Header */}
      <div className="px-8 py-8 text-center border-b border-border relative">
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-full px-6 py-3 mx-auto max-w-xs">
          <div className="flex items-center justify-center gap-2">
            <MessageCircle size={16} className="text-primary" />
            <h1 className="text-sm font-medium text-foreground">
              Clarity Conversation
            </h1>
          </div>
        </div>
        <button
          onClick={() => navigate('/memory-archive')}
          className="absolute top-8 right-8 flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
          title="Memory Archive"
        >
          <Archive size={18} className="text-muted-foreground hover:text-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
        <div className="space-y-6">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-4 ${
                message.sender === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-card border border-border'
              }`}>
                <p className="font-body leading-relaxed">{message.text}</p>
                
                {message.insights && (
                  <div className="mt-6 space-y-4">
                    {message.insights.mentalModels && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Brain size={16} className="text-primary" />
                          <span className="text-sm font-medium text-foreground">Mental Models</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => console.log('Save to library')}
                          >
                            Save
                          </Button>
                        </div>
                        {message.insights.mentalModels.map((model, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground mb-1">{model}</p>
                        ))}
                      </div>
                    )}
                    
                    {message.insights.ancientWisdom && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb size={16} className="text-primary" />
                          <span className="text-sm font-medium text-foreground">Ancient Wisdom</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => console.log('Save to library')}
                          >
                            Save
                          </Button>
                        </div>
                        {message.insights.ancientWisdom.map((wisdom, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground mb-1">{wisdom}</p>
                        ))}
                      </div>
                    )}

                    {message.insights.modernScience && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Target size={16} className="text-primary" />
                          <span className="text-sm font-medium text-foreground">Modern Science</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => console.log('Save to library')}
                          >
                            Save
                          </Button>
                        </div>
                        {message.insights.modernScience.map((science, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground mb-1">{science}</p>
                        ))}
                      </div>
                    )}

                    {message.insights.frameworks && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen size={16} className="text-primary" />
                          <span className="text-sm font-medium text-foreground">Frameworks</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => console.log('Save to library')}
                          >
                            Save
                          </Button>
                        </div>
                        {message.insights.frameworks.map((framework, idx) => (
                          <p key={idx} className="text-xs text-muted-foreground mb-1">{framework}</p>
                        ))}
                      </div>
                    )}

                    {message.insights.resources && (
                      <div className="bg-muted/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BookOpen size={16} className="text-primary" />
                          <span className="text-sm font-medium text-foreground">Resources</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-auto h-6 text-xs"
                            onClick={() => console.log('Save to library')}
                          >
                            Save All
                          </Button>
                        </div>
                        {message.insights.resources.map((resource, idx) => (
                          <div key={idx} className="flex items-center gap-2 mb-2">
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">{resource.type}</span>
                            <div className="flex-1">
                              <p className="text-xs font-medium text-foreground">{resource.title}</p>
                              <p className="text-xs text-muted-foreground">{resource.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {message.recommendations && message.recommendations.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {message.recommendations.map(renderRecommendation)}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="sticky bottom-32 px-6 py-4 bg-background border-t border-border">
        <div className="max-w-2xl mx-auto">
          {messages.length === 0 && (
            <div className="mb-4 text-center">
              <p className="text-muted-foreground font-body text-sm transition-opacity duration-1000">
                {prompts[currentPrompt]}
              </p>
            </div>
          )}
          
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Share what's on your mind..."
                className="min-h-[50px] resize-none pr-20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  title="Add documents"
                >
                  <Plus size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  title="Voice input"
                >
                  <Mic size={16} />
                </Button>
              </div>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isTyping}
              className="px-4"
            >
              <Send size={16} />
            </Button>
          </div>
          
          {messages.length > 0 && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={handleEndSession}
                className="text-sm"
              >
                End session
              </Button>
            </div>
          )}
        </div>
      </div>

      {selectedRecommendation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-heading font-medium text-foreground">{selectedRecommendation.title}</h3>
              <Button
                onClick={() => setSelectedRecommendation(null)}
                variant="ghost"
                size="sm"
              >
                ✕
              </Button>
            </div>
            <p className="text-muted-foreground mb-6">{selectedRecommendation.description}</p>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  selectedRecommendation.action();
                  setSelectedRecommendation(null);
                }}
                className="flex-1"
              >
                Start {selectedRecommendation.title}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ClarityConversation;