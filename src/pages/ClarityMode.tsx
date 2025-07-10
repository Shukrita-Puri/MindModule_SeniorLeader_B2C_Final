import { useNavigate } from "react-router-dom";
import useScrollToTop from "@/hooks/useScrollToTop";
import { MessageCircle, BookOpen } from "lucide-react";
import MainNavigation from "@/components/MainNavigation";

const ClarityMode = () => {
  const navigate = useNavigate();
  useScrollToTop(); // Scroll to top when this page loads

  return (
    <div className="min-h-screen bg-background font-editorial flex flex-col pb-32">
      {/* Custom back button that goes to /inner-architect */}
      <div className="flex items-center p-6">
        <button
          onClick={() => navigate('/inner-architect')}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <span className="text-foreground">←</span>
        </button>
      </div>
      
      {/* Header */}
      <div className="px-8 py-12 text-center">
        <h1 className="text-3xl font-heading font-medium text-foreground mb-4">
          Strengthen your Mental Clarity
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Clear your Mind. Ground Yourself. Grow Intentionally.
        </p>
      </div>

      {/* Mode Selection - Simple Ovals */}
      <div className="flex-1 px-6 py-8 max-w-md mx-auto w-full">
        <div className="space-y-6">
          
          {/* Conversation Mode */}
          <button
            onClick={() => navigate('/clarity/conversation')}
            className="w-full p-6 rounded-full border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-center group"
          >
            <div className="flex items-center justify-center gap-3">
              <MessageCircle size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                Conversation
              </span>
            </div>
          </button>

          {/* Journal Mode */}
          <button
            onClick={() => navigate('/clarity/journal')}
            className="w-full p-6 rounded-full border-2 border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-center group"
          >
            <div className="flex items-center justify-center gap-3">
              <BookOpen size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                Journal
              </span>
            </div>
          </button>

        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClarityMode;