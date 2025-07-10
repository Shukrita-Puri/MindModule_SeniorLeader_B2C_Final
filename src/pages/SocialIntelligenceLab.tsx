import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import PersonaSelector from "@/components/scenario/PersonaSelector";
import FileUploadSection from "@/components/FileUploadSection";
import vibrantPracticeIllustration from "@/assets/vibrant-practice-illustration.png";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();
  const [selectedDomain, setSelectedDomain] = useState("");
  const [contextType, setContextType] = useState("");
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);
  const [customPersonas, setCustomPersonas] = useState("");
  const [scenarioContext, setScenarioContext] = useState("");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);

  const socialDomains = [
    {
      id: "peer-relationships",
      title: "Peer Relationships",
      description: "Navigate friend group dynamics and conflicts"
    },
    {
      id: "authority-figures", 
      title: "Authority Figures",
      description: "Talk to teachers, parents, counselors effectively"
    },
    {
      id: "college-interviews",
      title: "College/University Prep",
      description: "Practice admissions interviews and networking"
    },
    {
      id: "romantic-relationships",
      title: "Dating & Romance",
      description: "Navigate crushes, relationships, and boundaries"
    },
    {
      id: "group-leadership",
      title: "Group Leadership",
      description: "Lead projects, teams, and social situations"
    },
    {
      id: "difficult-conversations",
      title: "Difficult Conversations",
      description: "Handle confrontation, feedback, and tough topics"
    },
    {
      id: "custom-scenario",
      title: "Custom Scenario",
      description: "Create your own specific social situation to practice"
    }
  ];

  const contextTypes = {
    "peer-relationships": [
      "Friend Group Drama",
      "Being Left Out", 
      "Backstabbing Situation",
      "Choosing Sides",
      "Custom Situation"
    ],
    "authority-figures": [
      "Asking for Grade Change",
      "Explaining Bad Behavior",
      "Requesting Help",
      "Challenging Unfairness",
      "Custom Situation"
    ],
    "college-interviews": [
      "College Interview",
      "University Interview",
      "Scholarship Interviews",
      "Alumni Networking",
      "Custom Interview"
    ],
    "romantic-relationships": [
      "Asking Someone Out",
      "Setting Boundaries",
      "Ending a Relationship",
      "Dealing with Rejection",
      "Custom Situation"
    ],
    "group-leadership": [
      "Leading Group Project",
      "Resolving Team Conflict",
      "Delegating Tasks",
      "Motivating Others",
      "Custom Leadership"
    ],
    "difficult-conversations": [
      "Giving Critical Feedback",
      "Standing Up to Bullying",
      "Apologizing Sincerely",
      "Setting Personal Boundaries",
      "Custom Conversation"
    ],
    "custom-scenario": [
      "Describe Your Situation"
    ]
  };

  const getRelevantPersonas = (domain: string, context: string) => {
    const personaMap: Record<string, Record<string, string[]>> = {
      "peer-relationships": {
        "Friend Group Drama": ["Best Friend", "Close Friend", "Mutual Friend", "Group Leader"],
        "Being Left Out": ["Former Friend", "Popular Classmate", "Group Member", "Bystander"],
        "Backstabbing Situation": ["Best Friend", "Trusted Friend", "Gossiper", "Witness"],
        "Choosing Sides": ["Best Friend", "Other Friend", "Neutral Friend", "Group Leader"],
        "Custom Situation": ["Friend", "Best Friend", "Classmate", "Acquaintance"]
      },
      "authority-figures": {
        "Asking for Grade Change": ["Teacher", "Professor", "Academic Advisor"],
        "Explaining Bad Behavior": ["Parent", "Teacher", "Principal", "Coach"],
        "Requesting Help": ["Teacher", "Counselor", "Mentor", "Supervisor"],
        "Challenging Unfairness": ["Teacher", "Boss", "Authority Figure", "Parent"],
        "Custom Situation": ["Teacher", "Parent", "Boss", "Counselor"]
      },
      "college-interviews": {
        "College Interview": ["Admissions Officer", "Alumni Interviewer", "Dean"],
        "University Interview": ["Professor", "Department Head", "Graduate Coordinator"],
        "Scholarship Interviews": ["Scholarship Committee", "Donor Representative", "Academic Reviewer"],
        "Alumni Networking": ["Alumni", "Professional Mentor", "Industry Expert"],
        "Custom Interview": ["Interviewer", "Panel Member", "Industry Professional"]
      },
      "romantic-relationships": {
        "Asking Someone Out": ["Crush", "Classmate", "Friend"],
        "Setting Boundaries": ["Partner", "Date", "Romantic Interest"],
        "Ending a Relationship": ["Boyfriend/Girlfriend", "Partner", "Ex-Partner"],
        "Dealing with Rejection": ["Crush", "Date", "Romantic Interest"],
        "Custom Situation": ["Partner", "Crush", "Date", "Ex-Partner"]
      },
      "group-leadership": {
        "Leading Group Project": ["Team Member", "Project Partner", "Classmate"],
        "Resolving Team Conflict": ["Conflicted Member", "Mediator", "Team Member"],
        "Delegating Tasks": ["Team Member", "Volunteer", "Group Member"],
        "Motivating Others": ["Unmotivated Member", "Team Member", "Peer"],
        "Custom Leadership": ["Team Member", "Follower", "Peer Leader"]
      },
      "difficult-conversations": {
        "Giving Critical Feedback": ["Friend", "Team Member", "Colleague", "Peer"],
        "Standing Up to Bullying": ["Bully", "Bystander", "Supporter", "Authority Figure"],
        "Apologizing Sincerely": ["Hurt Friend", "Offended Person", "Victim"],
        "Setting Personal Boundaries": ["Pushy Friend", "Demanding Person", "Boundary Crosser"],
        "Custom Conversation": ["Friend", "Family Member", "Colleague", "Peer"]
      },
      "custom-scenario": {
        "Describe Your Situation": ["Friend", "Family Member", "Teacher", "Colleague", "Stranger"]
      }
    };

    return personaMap[domain]?.[context] || [];
  };

  const availablePersonas = getRelevantPersonas(selectedDomain, contextType);

  const handleDomainSelect = (domainId: string) => {
    setSelectedDomain(domainId);
    setContextType("");
    setSelectedPersonas([]);
    setCustomPersonas("");
  };

  const handleContextSelect = (context: string) => {
    setContextType(context);
    setSelectedPersonas([]);
    setCustomPersonas("");
  };

  const handlePersonaToggle = (persona: string) => {
    setSelectedPersonas(prev => 
      prev.includes(persona) 
        ? prev.filter(p => p !== persona)
        : [...prev, persona]
    );
  };

  const handleCustomPersonasChange = (value: string) => {
    setCustomPersonas(value);
  };

  const handleStartPractice = () => {
    if (selectedDomain && contextType && (selectedPersonas.length > 0 || customPersonas.trim())) {
      navigate('/simulation', { 
        state: { 
          scenarioDomain: selectedDomain,
          contextType: contextType,
          scenarioContext: scenarioContext,
          selectedPersonas: selectedPersonas,
          customPersonas: customPersonas,
          isVoiceMode: isVoiceMode,
          attachments: attachments
        } 
      });
    }
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-24">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">
          Social Intelligence
        </h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section */}
      <div className="px-8 py-16 text-center max-w-3xl mx-auto">
        <div className="w-40 h-40 mx-auto mb-12 rounded-full overflow-hidden shadow-xl border-4 border-accent/20">
          <img 
            src="/lovable-uploads/67bda649-edbb-4f39-8290-175122fe99bf.png" 
            alt="Social intelligence practice"
            className="w-full h-full object-cover"
          />
        </div>
        
        <h2 className="text-3xl font-heading font-medium text-foreground mb-4 leading-tight">
          Prepare for Real Situations
        </h2>
        
        <p className="text-lg text-muted-foreground mb-12">
          Rehearse difficult conversations in a safe space before they happen
        </p>

      </div>

      {/* Content with proper spacing */}
      <div className="flex-1 px-8 max-w-4xl mx-auto pb-8">
        {/* Domain Selection */}
        <div className="mb-12">
          <h3 className="text-2xl font-heading font-medium text-foreground mb-8 text-center">
            Choose Your Focus Area
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {socialDomains.map((domain, index) => (
              <article 
                key={domain.id}
                onClick={() => handleDomainSelect(domain.id)}
                className={`group cursor-pointer border border-border rounded-lg p-6 transition-all animate-fade-in ${
                  selectedDomain === domain.id 
                    ? 'border-primary bg-primary/5' 
                    : 'hover:border-muted-foreground/20 hover:bg-card/50'
                }`}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <h4 className={`text-lg font-heading font-medium mb-2 transition-colors ${
                  selectedDomain === domain.id ? 'text-primary' : 'text-foreground group-hover:text-primary'
                }`}>
                  {domain.title}
                </h4>
                
                <p className="text-sm text-muted-foreground leading-relaxed font-body">
                  {domain.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        {/* Scenario Selection */}
        {selectedDomain && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-xl font-heading font-medium text-foreground mb-6 text-center">
              Choose Specific Scenario
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {contextTypes[selectedDomain as keyof typeof contextTypes]?.map((context, index) => (
                <button
                  key={context}
                  onClick={() => handleContextSelect(context)}
                  className={`p-3 rounded-lg border text-center transition-all animate-fade-in text-sm ${
                    contextType === context
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {context}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Persona Selection */}
        {contextType && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-xl font-heading font-medium text-foreground mb-6 text-center">
              Choose Personas Involved
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {availablePersonas.map((persona, index) => (
                <button
                  key={persona}
                  onClick={() => handlePersonaToggle(persona)}
                  className={`p-3 rounded-lg border text-center transition-all animate-fade-in text-sm ${
                    selectedPersonas.includes(persona)
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-primary/50 hover:bg-primary/5'
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {persona}
                </button>
              ))}
            </div>
            
            <div className="mt-4">
              <label className="text-sm font-medium text-foreground mb-2 block">
                Custom Personas & Their Roles
              </label>
              <textarea
                value={customPersonas}
                onChange={(e) => handleCustomPersonasChange(e.target.value)}
                placeholder="Describe any specific personas and their roles (e.g., 'Strict teacher who doesn't like being questioned' or 'Popular classmate who tends to be judgmental')"
                className="w-full min-h-[80px] p-3 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Context Input */}
        {(selectedPersonas.length > 0 || customPersonas.trim()) && (
          <div className="mb-12 animate-fade-in">
            <h3 className="text-lg font-heading font-medium text-foreground mb-3">
              {contextType.includes('Custom') || selectedDomain === 'custom-scenario' ? 'Describe Your Situation' : 'Add Context'}
            </h3>
            <textarea
              value={scenarioContext}
              onChange={(e) => setScenarioContext(e.target.value)}
              placeholder={
                contextType.includes('Custom') || selectedDomain === 'custom-scenario'
                  ? "Describe your specific social situation... (e.g., 'I need to tell my study group that I can't contribute as much time because of my internship...')"
                  : "Add specific details about your situation... (e.g., 'My best friend has been distant since the party last weekend and I need to address it...')"
              }
              className="w-full min-h-[100px] p-4 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none text-sm mb-6"
            />
            
            {/* File Upload Section */}
            <FileUploadSection
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              maxFiles={3}
              maxFileSize={10}
            />
          </div>
        )}

        {/* Start Practice Button */}
        {(selectedPersonas.length > 0 || customPersonas.trim()) && (
          <div className="py-8 text-center animate-fade-in">
            <Button 
              onClick={handleStartPractice}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-16 py-6 text-xl font-body rounded-full shadow-lg"
            >
              Start Simulation Practice
            </Button>
          </div>
        )}
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;