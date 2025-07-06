
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MainNavigation from "@/components/MainNavigation";
import inkMeditationIllustration from "@/assets/ink-meditation-illustration.png";

const MentorMode = () => {
  const navigate = useNavigate();

  const mentors = [
    {
      id: "asmita",
      name: "Asmita Dubey",
      title: "Chief Digital Officer",
      company: "L'Oréal",
      image: "/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png",
      insight: "Digital transformation through human connection"
    },
    {
      id: "rishad",
      name: "Rishad Tobaccowala",
      title: "Author & Advisor",
      company: "Independent",
      image: "/lovable-uploads/b8ffb35c-7a57-47ef-a879-1aff9c47603d.png",
      insight: "Growth through continuous reinvention"
    },
    {
      id: "thomas",
      name: "Thomas Buberl",
      title: "Chief Executive",
      company: "AXA Group",
      image: "/lovable-uploads/909c474b-063c-47f3-aae1-2ef5c7098a8e.png",
      insight: "Purpose-driven leadership at scale"
    },
    {
      id: "scott",
      name: "Scott Galloway",
      title: "Professor & Founder",
      company: "NYU Stern",
      image: "/lovable-uploads/f0c69073-c184-4d25-baaa-c8e5d07cfbd9.png",
      insight: "Strategic thinking for modern business"
    }
  ];

  const handleMentorSelect = (mentorId: string) => {
    navigate('/mentor-chat', { state: { mentorId } });
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Minimal Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Wisdom
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section - Minimal */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-32 h-32 mx-auto mb-12 rounded-full bg-card border border-border overflow-hidden">
          <img 
            src={inkMeditationIllustration} 
            alt="Contemplative wisdom"
            className="w-full h-full object-contain p-4 opacity-90"
          />
        </div>
        <h2 className="text-3xl font-heading font-medium text-foreground mb-6 leading-tight">
          Learn from experience
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Engage with leaders who've navigated complex challenges
        </p>
      </div>

      {/* Mentors - Editorial Layout */}
      <div className="flex-1 px-8 max-w-2xl mx-auto">
        <div className="space-y-12">
          {mentors.map((mentor, index) => (
            <article 
              key={mentor.id}
              onClick={() => handleMentorSelect(mentor.id)}
              className="group cursor-pointer border-b border-border pb-12 last:border-b-0 animate-fade-in"
              style={{ animationDelay: `${index * 150}ms` }}
            >
              <div className="flex items-start gap-6">
                <div className="w-16 h-16 rounded-full bg-card border border-border overflow-hidden flex-shrink-0 group-hover:scale-105 transition-transform">
                  <img 
                    src={mentor.image} 
                    alt={mentor.name}
                    className="w-full h-full object-cover filter grayscale group-hover:grayscale-0 transition-all"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    <h3 className="text-lg font-heading font-medium text-foreground group-hover:text-primary transition-colors mb-1">
                      {mentor.name}
                    </h3>
                    <p className="text-sm text-muted-foreground font-body">
                      {mentor.title}, {mentor.company}
                    </p>
                  </div>
                  
                  <p className="text-sm text-foreground italic leading-relaxed font-body">
                    "{mentor.insight}"
                  </p>
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

export default MentorMode;
