import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import MainNavigation from "@/components/MainNavigation";
import FileUploadSection from "@/components/FileUploadSection";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

const PracticeConfigurePage = () => {
  const navigate = useNavigate();
  
  const [scenarioCategory, setScenarioCategory] = useState("");
  const [specificScenario, setSpecificScenario] = useState("");
  const [customScenario, setCustomScenario] = useState("");
  const [personaType, setPersonaType] = useState("");
  const [customPersona, setCustomPersona] = useState("");
  const [personalityStyle, setPersonalityStyle] = useState("");
  const [customPersonality, setCustomPersonality] = useState("");
  const [voicePreference, setVoicePreference] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  interface MetaSkillData {
    cluster: string;
    metaSkill: string;
    subSkills: string[];
  }

  const [autoTaggedSkills, setAutoTaggedSkills] = useState<MetaSkillData[]>([]);

  const getMetaSkills = (scenario: string): MetaSkillData[] => {
    const skillMap: Record<string, MetaSkillData[]> = {
      'navigating-uncertainty': [
        {
          cluster: "Cognitive Mastery",
          metaSkill: "Adaptability & Agility",
          subSkills: ["Decision-Making", "Ambiguity Navigation", "Adaptability"]
        }
      ],
      'balance-change-stability': [
        {
          cluster: "Cognitive Mastery",
          metaSkill: "Adaptability & Agility",
          subSkills: ["Cognitive Flexibility", "Adaptability", "Grit"]
        },
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Self-Regulation", "Purpose Alignment"]
        }
      ],
      'navigating-conflict': [
        {
          cluster: "Social Mastery",
          metaSkill: "Collaboration & Group Dynamics",
          subSkills: ["Conflict Resolution", "Active Listening", "Perspective-Taking"]
        }
      ],
      'influence-disagree': [
        {
          cluster: "Social Mastery",
          metaSkill: "Social Intelligence",
          subSkills: ["Influence", "Persuasion", "Empathy"]
        }
      ],
      'managing-tensions': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Power Dynamics", "Influence", "Communication Leadership"]
        },
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Self-Regulation", "Emotional Mastery"]
        }
      ],
      'difficult-conversation': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Communication Leadership", "Stakeholder Management", "Influence"]
        },
        {
          cluster: "Self Mastery",
          metaSkill: "Emotional Intelligence",
          subSkills: ["Emotional Regulation", "Self-Awareness", "Resilience"]
        }
      ],
      'subtle-negotiations': [
        {
          cluster: "Social Mastery",
          metaSkill: "Social Intelligence",
          subSkills: ["Influence", "Persuasion", "Trust-Building"]
        },
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Negotiation", "Stakeholder Management"]
        },
        {
          cluster: "Strategic Mastery",
          metaSkill: "Strategic Planning & Vision",
          subSkills: ["Strategic Prioritization", "Vision vs. Viability"]
        }
      ],
      'public-unexpected': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Leadership Presence", "Communication Leadership", "Decision-Making under Pressure"]
        },
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Self-Regulation", "Self-Mastery"]
        }
      ],
      'staying-composed': [
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Self-Regulation", "Self-Mastery", "Integrity"]
        },
        {
          cluster: "Self Mastery",
          metaSkill: "Emotional Intelligence",
          subSkills: ["Emotional Regulation", "Resilience", "Self-Compassion"]
        }
      ],
      'bouncing-back': [
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Resilience", "Growth Mindset", "Purpose Alignment"]
        },
        {
          cluster: "Cognitive Mastery",
          metaSkill: "Adaptability & Agility",
          subSkills: ["Adaptability", "Grit", "Decision-Making"]
        }
      ],
      'sustaining-energy': [
        {
          cluster: "Self Mastery",
          metaSkill: "Self-Regulation & Motivation",
          subSkills: ["Self-Regulation", "Purpose Alignment", "Self-Mastery"]
        }
      ],
      'leading-through-change': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Change Management", "Narrative Leadership", "Empowerment"]
        },
        {
          cluster: "Strategic Mastery",
          metaSkill: "Strategic Planning & Vision",
          subSkills: ["Strategic Vision", "Long-term Planning"]
        }
      ],
      'inspiring-alignment': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Narrative Leadership", "Persuasive Storytelling", "Leadership Presence"]
        },
        {
          cluster: "Social Mastery",
          metaSkill: "Collaboration & Group Dynamics",
          subSkills: ["Shared Goal Alignment", "Team Facilitation"]
        }
      ],
      'elevating-others': [
        {
          cluster: "Social Mastery",
          metaSkill: "Leadership & Execution",
          subSkills: ["Coaching", "Empowerment", "Talent Development"]
        },
        {
          cluster: "Social Mastery",
          metaSkill: "Collaboration & Group Dynamics",
          subSkills: ["Mentorship", "Psychological Safety", "Inclusive Leadership"]
        }
      ],
    };
    return skillMap[scenario] || [];
  };

  useEffect(() => {
    if (specificScenario && specificScenario !== 'custom') {
      setAutoTaggedSkills(getMetaSkills(specificScenario));
    } else {
      setAutoTaggedSkills([]);
    }
  }, [specificScenario]);

  const getBackgroundGradient = (category: string) => {
    const gradients: Record<string, string> = {
      'leadership': 'bg-gradient-to-br from-card via-background to-gold/5',
      'difficult': 'bg-gradient-to-br from-card via-background to-forest/5',
      'pressure': 'bg-gradient-to-br from-card via-background to-primary/5',
      'change': 'bg-gradient-to-br from-card via-background to-lavender/5',
      'recovery': 'bg-gradient-to-br from-card via-background to-blue-500/5',
    };

    return gradients[category] || 'bg-background';
  };

  const isFormComplete = 
    scenarioCategory && 
    specificScenario && 
    (specificScenario !== 'custom' || customScenario.trim()) &&
    personaType &&
    (personaType !== 'custom' || customPersona.trim()) &&
    personalityStyle &&
    (personalityStyle !== 'custom' || customPersonality.trim()) &&
    voicePreference;

  const handleStartDialogue = () => {
    navigate('/practice/simulation', {
      state: {
        scenarioCategory,
        specificScenario: specificScenario === 'custom' ? customScenario : specificScenario,
        aiPersona: {
          type: personaType === 'custom' ? customPersona : personaType,
          personality: personalityStyle === 'custom' ? customPersonality : personalityStyle,
          voicePreference: voicePreference,
        },
        additionalContext,
        metaSkills: autoTaggedSkills,
        attachments,
        contextType: specificScenario,
        scenarioDomain: scenarioCategory,
      }
    });
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${getBackgroundGradient(scenarioCategory)}`}>
      {/* Header with back button */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/practice')}
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-headline font-medium text-forest">
              Configure Your Dialogue
            </h1>
            <p className="text-xs font-headline text-muted-foreground mb-2">
              Set up your practice scenario
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 pb-24">
        {/* Configuration Form */}
        <div className="space-y-6 max-w-2xl mx-auto">
          {/* Step 1: Scenario Category */}
          <Card className="p-5 shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
            <h3 className="text-base font-headline font-medium text-foreground mb-3">
              Step 1: Choose Scenario Category
            </h3>
            <Select value={scenarioCategory} onValueChange={setScenarioCategory}>
              <SelectTrigger className="h-14 bg-card border-border">
                <SelectValue placeholder="Choose a Scenario Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leadership">Leadership Moments — inspire, align, and elevate others</SelectItem>
                <SelectItem value="difficult">Difficult Conversations — navigate tension with composure and truth</SelectItem>
                <SelectItem value="pressure">High-Pressure Situations — perform with precision under stress</SelectItem>
                <SelectItem value="change">Moments of Change — guide transitions with confidence</SelectItem>
                <SelectItem value="recovery">Recovery & Resilience — restore calm and integrity after disruption</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          {/* Step 2: Specific Scenario */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <Label htmlFor="specific-scenario" className="text-base font-headline font-medium text-foreground">
                  Step 2: Choose a Specific Scenario
                </Label>
                <p className="text-xs font-headline text-muted-foreground mt-1">
                  What situation do you want to prepare for?
                </p>
              </div>

              <Select
                value={specificScenario}
                onValueChange={(value) => {
                  setSpecificScenario(value);
                  if (value !== 'custom') {
                    setCustomScenario('');
                  }
                }}
                disabled={!scenarioCategory}
              >
                <SelectTrigger id="specific-scenario" className="bg-card border-border">
                  <SelectValue placeholder={!scenarioCategory ? "First select a category above" : "Select a scenario"} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-[100]">
                  {scenarioCategory === 'change' && (
                    <>
                      <SelectItem value="navigating-uncertainty">Navigating Through Uncertainty</SelectItem>
                      <SelectItem value="balance-change-stability">Balancing Change and Stability</SelectItem>
                      <SelectItem value="navigating-conflict">Navigating Conflict</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory === 'difficult' && (
                    <>
                      <SelectItem value="influence-disagree">Influencing Someone Who Disagrees</SelectItem>
                      <SelectItem value="managing-tensions">Managing Hidden Tensions</SelectItem>
                      <SelectItem value="difficult-conversation">Having a Difficult Conversation</SelectItem>
                      <SelectItem value="subtle-negotiations">Subtle Negotiations: Finding Win-Win</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory === 'pressure' && (
                    <>
                      <SelectItem value="public-unexpected">Handling Public Conversations & Unexpected Questions</SelectItem>
                      <SelectItem value="staying-composed">Staying Composed Under Pressure</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory === 'recovery' && (
                    <>
                      <SelectItem value="bouncing-back">Bouncing Back After a Setback</SelectItem>
                      <SelectItem value="sustaining-energy">Sustaining Energy Under Long-Term Pressure</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory === 'leadership' && (
                    <>
                      <SelectItem value="leading-through-change">Leading Through Change</SelectItem>
                      <SelectItem value="inspiring-alignment">Inspiring Team Alignment</SelectItem>
                      <SelectItem value="elevating-others">Elevating Others' Performance</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory && <SelectItem value="custom">Customise Scenario</SelectItem>}
                </SelectContent>
              </Select>

              {specificScenario === 'custom' && (
                <div className="animate-fade-in">
                  <Textarea
                    placeholder="Describe your custom scenario..."
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    className="min-h-[100px] bg-background"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Step 3: Persona Type */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <Label htmlFor="persona-type" className="text-base font-headline font-medium text-foreground">
                  Step 3: Who Are You Speaking With?
                </Label>
                <p className="text-xs font-headline text-muted-foreground mt-1">
                  Select the type of person you'll be conversing with
                </p>
              </div>

              <Select
                value={personaType}
                onValueChange={(value) => {
                  setPersonaType(value);
                  if (value !== 'custom') {
                    setCustomPersona('');
                  }
                }}
              >
                <SelectTrigger id="persona-type" className="bg-background">
                  <SelectValue placeholder="Select a persona" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="interviewer">Interviewer / Admissions Officer</SelectItem>
                  <SelectItem value="mentor">Mentor / Advisor</SelectItem>
                  <SelectItem value="peer">Peer / Colleague</SelectItem>
                  <SelectItem value="authority">Authority Figure</SelectItem>
                  <SelectItem value="custom">Customise Persona</SelectItem>
                </SelectContent>
              </Select>

              {personaType === 'custom' && (
                <div className="animate-fade-in">
                  <Textarea
                    placeholder="Describe the person you'll be speaking with..."
                    value={customPersona}
                    onChange={(e) => setCustomPersona(e.target.value)}
                    className="min-h-[80px] bg-background"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Step 4: Personality Style */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <Label htmlFor="personality-style" className="text-base font-headline font-medium text-foreground">
                  Step 4: Their Personality Style
                </Label>
                <p className="text-xs font-headline text-muted-foreground mt-1">
                  How would you describe their communication style?
                </p>
              </div>

              <Select
                value={personalityStyle}
                onValueChange={(value) => {
                  setPersonalityStyle(value);
                  if (value !== 'custom') {
                    setCustomPersonality('');
                  }
                }}
              >
                <SelectTrigger id="personality-style" className="bg-background">
                  <SelectValue placeholder="Select a personality style" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="warm-supportive">Warm & Supportive</SelectItem>
                  <SelectItem value="analytical-direct">Analytical & Direct</SelectItem>
                  <SelectItem value="challenging-probing">Challenging & Probing</SelectItem>
                  <SelectItem value="neutral-professional">Neutral & Professional</SelectItem>
                  <SelectItem value="custom">Customise Personality</SelectItem>
                </SelectContent>
              </Select>

              {personalityStyle === 'custom' && (
                <div className="animate-fade-in">
                  <Textarea
                    placeholder="Describe their personality and communication style..."
                    value={customPersonality}
                    onChange={(e) => setCustomPersonality(e.target.value)}
                    className="min-h-[80px] bg-background"
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Step 5: Voice Style Preference */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <Label htmlFor="voice-preference" className="text-base font-headline font-medium text-foreground">
                  Step 5: Voice Style Preference
                </Label>
                <p className="text-xs font-headline text-muted-foreground mt-1">
                  Choose the voice style for the AI persona
                </p>
              </div>

              <Select value={voicePreference} onValueChange={setVoicePreference}>
                <SelectTrigger id="voice-preference" className="bg-background">
                  <SelectValue placeholder="Select voice style" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="masculine">Masculine</SelectItem>
                  <SelectItem value="feminine">Feminine</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Step 6: Additional Context */}
          <Card className="p-5">
            <div className="space-y-3">
              <div>
                <Label htmlFor="additional-context" className="text-base font-headline font-medium text-foreground">
                  Step 6: Additional Context (Optional)
                </Label>
                <p className="text-xs font-headline text-muted-foreground mt-1">
                  Any specific details, background, or goals for this conversation?
                </p>
              </div>

              <Textarea
                id="additional-context"
                placeholder="E.g., 'I want to emphasize my leadership experience' or 'I'm nervous about discussing my GPA'"
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="min-h-[120px] bg-background"
              />

              {/* File Attachments */}
              <FileUploadSection
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
            </div>
          </Card>

          {/* Auto-tagged meta skills */}
          {specificScenario && autoTaggedSkills.length > 0 && (
            <Card className="p-5 bg-gradient-to-br from-gold/5 via-background to-forest/5 border-gold/20 animate-fade-in">
              <h3 className="text-base font-headline font-semibold text-foreground mb-2">
                Meta skills this dialogue will develop
              </h3>
              
              {/* Explanation of Meta Skills */}
              <p className="text-xs font-body text-muted-foreground mb-4 leading-relaxed">
                Meta skills are the elevated cognitive and interpersonal capacities that transcend domain-specific expertise—they represent the architecture of exceptional performance across contexts.
              </p>
              
              {/* Meta-Skills in one row - Gold pill badges */}
              <div className="flex flex-wrap gap-2 mb-3">
                {autoTaggedSkills.map((skillData, index) => (
                  <Badge 
                    key={index}
                    variant="metaskill" 
                    className="bg-gold/10 border-gold text-gold px-3 py-1 text-xs font-semibold"
                  >
                    {skillData.metaSkill}
                  </Badge>
                ))}
              </div>
              
              {/* Explanation of Sub-Skills */}
              <p className="text-xs font-body text-muted-foreground mb-2 leading-relaxed">
                Sub-skills are the refined dimensions within each meta skill—the specific capabilities you'll cultivate through deliberate practice.
              </p>
              
              {/* Sub-Skills as hashtags */}
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(autoTaggedSkills.flatMap(skill => skill.subSkills))).map(subSkill => (
                  <span 
                    key={subSkill} 
                    className="text-xs font-medium text-muted-foreground"
                  >
                    #{subSkill.replace(/\s+/g, '')}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Start Dialogue Button */}
          <div className="pt-8 pb-6 text-center">
            <Button
              onClick={handleStartDialogue}
              disabled={!isFormComplete}
              variant="forest"
              size="lg"
              className="w-full max-w-md text-base font-headline shadow-[0_8px_24px_rgba(61,111,95,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Engage with Intention
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PracticeConfigurePage;
