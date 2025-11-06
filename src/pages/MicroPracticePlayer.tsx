import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import UnifiedTopBar from "@/components/navigation/UnifiedTopBar";
import { getAllContent } from "@/data/practicesAndSoundscapes";

const MicroPracticePlayer = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const allContent = getAllContent();
  const practice = allContent.find(item => item.id === id && item.contentType === 'micro-practice');

  if (!practice) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Practice not found</p>
      </div>
    );
  }

  const handleComplete = () => {
    // Store completion in localStorage
    const history = JSON.parse(localStorage.getItem("practiceHistory") || "[]");
    history.push({
      id: practice.id,
      title: practice.title,
      type: "micro-practice",
      outcome: practice.category,
      completedAt: new Date().toISOString(),
      duration: practice.duration
    });
    localStorage.setItem("practiceHistory", JSON.stringify(history));
    
    navigate("/recalibrate");
  };

  return (
    <div className="min-h-screen bg-background">
      <UnifiedTopBar backPath="/micro-practices" />
      
      <div className="pt-20 px-6 max-w-4xl mx-auto pb-12">
        {/* Hero Image */}
        <div 
          className="h-64 rounded-xl bg-cover bg-center mb-8"
          style={{ backgroundImage: `url('${practice.thumbnail}')` }}
        >
          <div className="h-full bg-gradient-to-b from-transparent to-mocha/80 rounded-xl flex items-end p-6">
            <div>
              <h1 className="text-3xl font-serif text-cream mb-2">{practice.title}</h1>
              <p className="text-cream/80 text-sm">{practice.creator}</p>
            </div>
          </div>
        </div>

        {/* Story Hook */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <p className="text-sm leading-relaxed text-muted-foreground">{practice.storyHook}</p>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="mb-8">
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Practice Instructions</h2>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Follow these simple steps to complete this {practice.duration}-minute practice:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Find a comfortable position</li>
                <li>Take a deep breath and center yourself</li>
                <li>Follow the guided practice</li>
                <li>Notice how you feel afterwards</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Complete Button */}
        <Button 
          onClick={handleComplete}
          className="w-full"
          size="lg"
        >
          <CheckCircle2 className="h-5 w-5 mr-2" />
          Mark Complete
        </Button>
      </div>
    </div>
  );
};

export default MicroPracticePlayer;
