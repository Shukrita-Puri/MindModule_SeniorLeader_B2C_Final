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

  // Determine back path based on category
  const backPath = practice.category 
    ? `/recalibrate/${practice.category}` 
    : "/micro-practices";

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
      <UnifiedTopBar backPath={backPath} />
      
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

        {/* Origin Quote */}
        {practice.origin && (
          <Card className="mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-6">
              <p className="text-sm leading-relaxed italic text-foreground">{practice.origin}</p>
            </CardContent>
          </Card>
        )}

        {/* Essence, Parallel, Cue, Used For */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {practice.essence && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Essence</h3>
                <p className="text-sm text-foreground">{practice.essence}</p>
              </CardContent>
            </Card>
          )}
          {practice.parallel && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Parallel</h3>
                <p className="text-sm text-foreground">{practice.parallel}</p>
              </CardContent>
            </Card>
          )}
          {practice.cue && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cue</h3>
                <p className="text-sm font-medium text-foreground">{practice.cue}</p>
              </CardContent>
            </Card>
          )}
          {practice.usedBy && (
            <Card className="bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
              <CardContent className="pt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Used For</h3>
                <p className="text-sm text-foreground">{practice.usedBy}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* What to Actually Do */}
        {practice.instructions && practice.instructions.length > 0 && (
          <Card className="mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-6 space-y-4">
              <h2 className="text-lg font-semibold">What to Actually Do</h2>
              <ol className="space-y-4">
                {practice.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                      {index + 1}
                    </span>
                    <p className="text-sm text-foreground pt-1">{instruction}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {/* Real Examples */}
        {practice.realExamples && practice.realExamples.length > 0 && (
          <Card className="mb-6 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-6 space-y-6">
              <h2 className="text-lg font-semibold">Real Examples</h2>
              {practice.realExamples.map((example, index) => (
                <div key={index} className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0">
                  <h3 className="text-sm font-semibold text-foreground">Scenario {index + 1}: {example.scenario}</h3>
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">The trigger:</span> {example.trigger}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Use the space:</span> {example.response}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Why This Works */}
        {practice.whyThisWorks && (
          <Card className="mb-8 bg-background shadow-[0_0_30px_rgba(0,0,0,0.08)]">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold mb-3">Why This Works</h2>
              <p className="text-sm leading-relaxed text-foreground">{practice.whyThisWorks}</p>
            </CardContent>
          </Card>
        )}

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
