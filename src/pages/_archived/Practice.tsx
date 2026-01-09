import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/_archived/MainNavigation";
import TopNavigation from "@/components/simulation/TopNavigation";
import dialogueAcademicConfidence from "@/assets/dialogue-academic-confidence.jpg";
import dialogueSocialNavigation from "@/assets/dialogue-social-navigation.jpg";
import dialogueGrowthOpportunity from "@/assets/dialogue-growth-opportunity.jpg";

interface ScenarioChip {
  id: string;
  label: string;
  category: string;
}

interface CategoryCard {
  id: string;
  title: string;
  description: string;
  image: string;
  metaSkill: string;
  scenarios: ScenarioChip[];
}

const Practice = () => {
  const navigate = useNavigate();

  const categories: CategoryCard[] = [
    {
      id: "academic",
      title: "Academic Confidence",
      description: "Present ideas with clarity, defend your work, and speak with authority in academic settings.",
      image: dialogueAcademicConfidence,
      metaSkill: "Self Mastery",
      scenarios: [
        { id: "oxbridge-interview", label: "Oxbridge Interview", category: "academic" },
        { id: "model-un-speech", label: "Model UN Speech", category: "academic" },
        { id: "debate-tournament", label: "Debate Tournament", category: "academic" },
        { id: "scholarship-interview", label: "Scholarship Interview", category: "academic" },
        { id: "apprenticeship-interview", label: "Apprenticeship Interview", category: "academic" },
      ]
    },
    {
      id: "social",
      title: "Social Navigation",
      description: "Handle friendships, group dynamics, and peer relationships with emotional intelligence.",
      image: dialogueSocialNavigation,
      metaSkill: "Social Mastery",
      scenarios: [
        { id: "boarding-house-dynamics", label: "Boarding House Dynamics", category: "social" },
        { id: "society-elections", label: "Society Elections", category: "social" },
        { id: "peer-pressure", label: "Peer Pressure Moments", category: "social" },
        { id: "prefect-responsibilities", label: "Prefect Responsibilities", category: "social" },
      ]
    },
    {
      id: "growth",
      title: "Growth & Opportunity",
      description: "Seize opportunities, build connections, and navigate transitions with confidence.",
      image: dialogueGrowthOpportunity,
      metaSkill: "Both",
      scenarios: [
        { id: "sports-captain-address", label: "Sports Captain Address", category: "growth" },
        { id: "head-student-interview", label: "Head Boy/Girl Interview", category: "growth" },
        { id: "gap-year-planning", label: "Gap Year Planning", category: "growth" },
        { id: "alumni-networking", label: "Alumni Networking", category: "growth" },
      ]
    }
  ];

  const handleScenarioClick = (scenario: ScenarioChip) => {
    navigate('/practice/configure', {
      state: {
        preSelectedCategory: scenario.category,
        preSelectedScenario: scenario.id
      }
    });
  };

  const handleCreateOwn = (categoryId: string) => {
    navigate('/practice/configure', {
      state: {
        preSelectedCategory: categoryId,
        preSelectedScenario: 'custom'
      }
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNavigation backPath="/executive-home" />
      
      {/* Hero Banner */}
      <div className="relative h-auto py-16 pt-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-card to-background" />
        
        <div className="relative h-full flex flex-col items-center justify-center px-4 text-center z-10 space-y-3">
          <h1 className="text-5xl font-headline mb-2 text-foreground tracking-tight">
            Dialogue Studio
          </h1>
          <p className="text-lg font-subheadline italic text-muted-foreground">
            Rehearse. Respond. Rise.
          </p>
          <p className="text-sm text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Practice real conversations with an AI partner. Build confidence for the moments that matter — from classroom presentations to life-changing interviews.
          </p>
          <button
            onClick={() => navigate('/practice/history')}
            className="mt-4 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          >
            View Practice History →
          </button>
        </div>
      </div>

      {/* Category Cards */}
      <div className="flex-1 px-6 md:px-8 max-w-5xl mx-auto pb-32 pt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10 auto-rows-fr">
          {categories.map((category, index) => (
            <article 
              key={category.id}
              className="group animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="h-full bg-card/85 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_20px_rgba(0,217,255,0.1)] flex flex-col">
                {/* Image Container */}
                <div className="relative w-full aspect-[4/3] overflow-hidden bg-card">
                  <img 
                    src={category.image} 
                    alt={category.title}
                    className="w-full h-full object-cover img-card img-taupe-overlay group-hover:scale-105 transition-all duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card/60 via-transparent to-transparent" />
                  
                  {/* Meta Skill Badge */}
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 text-xs font-medium bg-background/80 backdrop-blur-sm rounded-full text-muted-foreground">
                      {category.metaSkill}
                    </span>
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-6 space-y-4 flex-1 flex flex-col">
                  <div>
                    <h3 className="text-xl font-headline font-semibold text-foreground mb-2">
                      {category.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed font-body">
                      {category.description}
                    </p>
                  </div>
                  
                  {/* Scenario Chips */}
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground/70 mb-3 font-medium uppercase tracking-wide">
                      Quick Start Scenarios
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {category.scenarios.map((scenario) => (
                        <button
                          key={scenario.id}
                          onClick={() => handleScenarioClick(scenario)}
                          className="px-3 py-1.5 text-xs font-body bg-muted/50 hover:bg-primary/10 hover:text-primary border border-border/50 hover:border-primary/30 rounded-full transition-all duration-300"
                        >
                          {scenario.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Create Own Link */}
                  <button
                    onClick={() => handleCreateOwn(category.id)}
                    className="text-xs text-primary/70 hover:text-primary font-medium transition-colors duration-300 text-left"
                  >
                    + Create your own scenario
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default Practice;
