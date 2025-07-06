import { useState } from "react";
import { ArrowLeft, Mic, MicOff, Volume2, VolumeX, Brain } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import vibrantExecutivePreparation from "@/assets/vibrant-executive-preparation.png";
import inkExecutiveOrb from "@/assets/ink-executive-orb.png";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
}

// Full Screen Voice Interface Component
const VoiceInterface = ({ isActive, onToggle, scenarioContext }: { 
  isActive: boolean; 
  onToggle: () => void;
  scenarioContext?: string;
}) => {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      {/* Hero Visual */}
      <div className="relative h-64 w-full overflow-hidden">
        <img 
          src={vibrantExecutivePreparation} 
          alt="Executive simulation preparation" 
          className="w-full h-full object-cover opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
      </div>

      {/* Voice Orb Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="relative mb-8">
          <img 
            src={inkExecutiveOrb} 
            alt="Executive command orb" 
            className={`w-40 h-40 transition-all duration-500 ${
              isActive ? 'scale-110 opacity-90' : 'opacity-70'
            }`}
          />
          <button
            onClick={onToggle}
            className={`absolute inset-0 w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${
              isActive 
                ? 'bg-primary/20 shadow-xl' 
                : 'bg-background/20 hover:bg-primary/10'
            }`}
          >
            {isActive ? (
              <div className="flex items-center justify-center">
                <div className="flex space-x-1">
                  <div className="w-1 h-6 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-1 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-1 h-8 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-4 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                  <div className="w-1 h-6 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            ) : (
              <Mic size={32} className="text-primary" />
            )}
          </button>
        </div>

        <div className="text-center max-w-sm">
          <h3 className="text-xl font-heading font-medium text-foreground mb-2">
            {isActive ? 'Recording' : 'Ready for simulation'}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isActive 
              ? 'Describe the situation and context' 
              : 'Tap to begin your executive rehearsal'
            }
          </p>
        </div>

        {scenarioContext && (
          <div className="mt-8 p-4 bg-card/50 rounded-lg border border-border max-w-md">
            <p className="text-sm text-foreground/80 text-center leading-relaxed">
              {scenarioContext}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Floating Clarity Engine Component - Positioned Higher
const FloatingClarityEngine = ({ messages }: { messages: Message[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="fixed bottom-32 right-4 z-40">
      {isExpanded ? (
        <Card className="w-72 max-h-48 overflow-y-auto animate-fade-in">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Brain size={12} className="text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Clarity Engine</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsExpanded(false)}
                className="h-5 w-5 p-0 text-xs"
              >
                ×
              </Button>
            </div>
            
            <div className="space-y-2">
              <div className="bg-primary/5 p-2 rounded text-xs">
                <div className="font-medium text-primary mb-1">Active Framework</div>
                <div className="text-foreground">Strategic Empathy</div>
              </div>
              
              <div className="bg-accent/5 p-2 rounded text-xs">
                <div className="font-medium text-accent mb-1">Live Coaching</div>
                <div className="text-foreground">Pause and breathe deeply</div>
              </div>
              
              <div className="pt-1 border-t border-border">
                <div className="text-xs text-muted-foreground">
                  {messages.length} exchanges analyzed
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsExpanded(true)}
          className="w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        >
          <Brain size={16} />
        </Button>
      )}
    </div>
  );
};

const Simulation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, isVoiceMode } = location.state || {};
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

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
    setIsSimulating(true);
    
    setTimeout(() => {
      const response: Message = {
        id: (Date.now() + 1).toString(),
        text: "I understand your perspective. Let me share some concerns about the timeline and resource allocation. How do you plan to address the potential risks?",
        sender: "ai",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, response]);
      setIsSimulating(false);
    }, 2000);
  };

  const handleEndSession = () => {
    navigate('/simulation-insights', { 
      state: { 
        scenarioDomain, 
        contextType,
        scenarioContext,
        messages,
        sessionDuration: "12 minutes"
      } 
    });
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Show full-screen voice interface initially
  if (messages.length === 0) {
    return (
      <div className="relative flex min-h-screen flex-col bg-background font-editorial">
        {/* Minimal Floating Header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-30">
          <button
            onClick={() => navigate("/scenario-lab")}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-muted transition-colors"
          >
            <ArrowLeft size={18} className="text-foreground" />
          </button>
          <button
            onClick={toggleMute}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border hover:bg-muted transition-colors"
          >
            {isMuted ? <VolumeX size={18} className="text-foreground" /> : <Volume2 size={18} className="text-foreground" />}
          </button>
        </div>

        <VoiceInterface 
          isActive={isRecording} 
          onToggle={toggleRecording}
          scenarioContext={scenarioContext}
        />

        <FloatingClarityEngine messages={messages} />
        <MainNavigation />
      </div>
    );
  }

  // Show conversation interface after messages start
  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Minimal Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/social-intelligence-lab")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div className="text-center">
          <h2 className="text-xl font-heading font-medium text-foreground">
            Social Practice
          </h2>
          <p className="text-sm text-muted-foreground">
            {contextType}
          </p>
        </div>
        <div className="w-10"></div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-40">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${
              message.sender === 'user' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted'
            }`}>
              <p className="text-sm">{message.text}</p>
            </div>
          </div>
        ))}

        {isSimulating && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-1 h-1 bg-primary rounded-full animate-pulse"></div>
                  <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-1 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span className="text-xs text-muted-foreground">Thinking...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Input Area */}
      <div className="fixed bottom-20 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-6">
        <div className="flex items-center gap-3 max-w-4xl mx-auto">
          <div className="flex-1">
            <textarea
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder="Type your response in this conversation..."
              className="w-full min-h-[44px] max-h-24 p-4 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none text-sm leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(currentMessage);
                }
              }}
            />
          </div>
          
          <Button
            onClick={() => handleSendMessage(currentMessage)}
            disabled={!currentMessage.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg"
          >
            Send
          </Button>
        </div>
        
        <div className="pt-4 max-w-4xl mx-auto">
          <Button 
            onClick={handleEndSession}
            variant="outline"
            className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            End Practice & Get Insights
          </Button>
        </div>
      </div>

      <FloatingClarityEngine messages={messages} />
      <MainNavigation />
    </div>
  );
};

export default Simulation;