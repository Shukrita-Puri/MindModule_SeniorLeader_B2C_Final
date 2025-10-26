import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import vibrantMentorIllustration from "@/assets/vibrant-mentor-illustration.png";

const FlowStateSession = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen font-body">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/recalibrate")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-headline font-medium text-foreground">
          Flow State
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Content */}
      <div className="px-8 py-12 max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-full max-w-sm aspect-square mx-auto mb-8 rounded-sm border border-gold/20 overflow-hidden shadow-lg">
            <img 
              src={vibrantMentorIllustration} 
              alt="Flow State"
              className="w-full h-full object-cover"
            />
          </div>
          
          <h2 className="text-2xl font-headline font-medium text-foreground mb-4 leading-tight">
            Deep Focus Sessions
          </h2>
          
          <p className="text-muted-foreground font-body leading-relaxed">
            Enter a state of peak performance and sustained concentration
          </p>
        </div>

        {/* Session placeholder */}
        <div className="bg-card border border-gold/20 rounded-sm p-8 text-center shadow-md">
          <p className="text-muted-foreground font-body mb-6">
            Select a flow state session from the previous screen to begin your deep focus practice.
          </p>
          
          <Button
            onClick={() => navigate("/recalibrate")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-full font-body"
          >
            Back to Recalibrate
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FlowStateSession;
