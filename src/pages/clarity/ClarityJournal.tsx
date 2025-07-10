import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, Save, RotateCcw } from "lucide-react";
import MainNavigation from "@/components/MainNavigation";
import ClearBackButton from "@/components/ClearBackButton";
import SessionFeedback from "@/components/SessionFeedback";

const ClarityJournal = () => {
  const navigate = useNavigate();
  const [entry, setEntry] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const prompts = [
    "What am I feeling right now, and what might be causing these feelings?",
    "What patterns do I notice in my thoughts or behaviors lately?",
    "What am I grateful for today, and why does it matter to me?",
    "What challenge am I facing, and what strengths do I have to address it?",
    "What would I tell a friend who was in my situation?",
    "What does my ideal day look like, and what's one step toward that?",
    "What boundaries do I need to set or maintain for my wellbeing?",
    "What accomplishment am I proud of, no matter how small?"
  ];

  const handleTextChange = (value: string) => {
    setEntry(value);
    setWordCount(value.trim().split(/\s+/).filter(word => word.length > 0).length);
  };

  const handleSaveEntry = () => {
    if (!entry.trim()) return;
    
    // In a real app, this would save to a database
    const savedEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
    const newEntry = {
      id: Date.now(),
      text: entry,
      timestamp: new Date().toISOString(),
      wordCount: wordCount
    };
    savedEntries.push(newEntry);
    localStorage.setItem('journalEntries', JSON.stringify(savedEntries));
    
    setShowFeedback(true);
  };

  const handleEndSession = () => {
    if (entry.trim()) {
      handleSaveEntry();
    } else {
      setShowFeedback(true);
    }
  };

  const handleFeedbackSubmit = (feedback: any) => {
    setShowFeedback(false);
    navigate('/clarity');
  };

  const handleFeedbackSkip = () => {
    setShowFeedback(false);
    navigate('/clarity');
  };

  const usePrompt = (prompt: string) => {
    if (entry.trim()) {
      setEntry(entry + "\n\n" + prompt + "\n");
    } else {
      setEntry(prompt + "\n");
    }
    setWordCount(entry.trim().split(/\s+/).filter(word => word.length > 0).length);
  };

  if (showFeedback) {
    return (
      <SessionFeedback
        onSubmit={handleFeedbackSubmit}
        onSkip={handleFeedbackSkip}
        sessionType="journal"
      />
    );
  }

  return (
    <div className="min-h-screen bg-background font-editorial flex flex-col pb-32">
      <ClearBackButton />
      
      {/* Header */}
      <div className="px-8 py-16 text-center border-b border-border">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-card border border-border flex items-center justify-center">
          <BookOpen size={24} className="text-primary" />
        </div>
        <h1 className="text-2xl font-heading font-medium text-foreground mb-2">
          Private Journal
        </h1>
        <p className="text-muted-foreground font-body">
          A safe space for your thoughts and reflections
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-8 max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Journal Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-heading font-medium text-foreground">
                  Today's Entry
                </h3>
                <div className="text-sm text-muted-foreground">
                  {wordCount} words
                </div>
              </div>
              
              <Textarea
                value={entry}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Start writing... let your thoughts flow freely."
                className="min-h-[400px] lg:min-h-[500px] resize-none font-body leading-relaxed"
                autoFocus
              />
            </div>
            
            <div className="flex gap-3 justify-center">
              <Button
                onClick={handleSaveEntry}
                disabled={!entry.trim()}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                Save Entry
              </Button>
              
              <Button
                variant="outline"
                onClick={handleEndSession}
              >
                End Session
              </Button>
            </div>
          </div>

          {/* Prompts Sidebar */}
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-heading font-medium text-foreground mb-4">
                Journal Prompts
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Use these prompts to get started or explore deeper
              </p>
            </div>
            
            <div className="space-y-3">
              {prompts.map((prompt, index) => (
                <div
                  key={index}
                  className="group cursor-pointer bg-card border border-border rounded-lg p-4 hover:border-primary/20 transition-colors"
                  onClick={() => usePrompt(prompt)}
                >
                  <p className="text-sm font-body leading-relaxed text-foreground group-hover:text-primary transition-colors">
                    {prompt}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="pt-6 border-t border-border">
              <div className="text-center text-xs text-muted-foreground space-y-2">
                <p>🔒 Your entries are private</p>
                <p>All data stays on your device</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClarityJournal;