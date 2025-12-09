import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import TopNavigation from "@/components/simulation/TopNavigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface LocationState {
  preSelectedCategory?: string;
  preSelectedScenario?: string;
}

const PracticeConfigurePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | null;
  
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

  // Category mapping from Practice.tsx card IDs to configure page values
  const categoryMapping: Record<string, string> = {
    'academic': 'pressure',
    'social': 'difficult',
    'growth': 'leadership'
  };

  const getMetaSkills = (scenario: string): MetaSkillData[] => {
    const skillMap: Record<string, MetaSkillData[]> = {
      // Existing scenarios
      'navigating-uncertainty': [
        { cluster: "Cognitive Mastery", metaSkill: "Adaptability & Agility", subSkills: ["Decision-Making", "Ambiguity Navigation", "Adaptability"] }
      ],
      'balance-change-stability': [
        { cluster: "Cognitive Mastery", metaSkill: "Adaptability & Agility", subSkills: ["Cognitive Flexibility", "Adaptability", "Grit"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Purpose Alignment"] }
      ],
      'navigating-conflict': [
        { cluster: "Social Mastery", metaSkill: "Collaboration & Group Dynamics", subSkills: ["Conflict Resolution", "Active Listening", "Perspective-Taking"] }
      ],
      'influence-disagree': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Influence", "Persuasion", "Empathy"] }
      ],
      'managing-tensions': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Power Dynamics", "Influence", "Communication Leadership"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Emotional Mastery"] }
      ],
      'difficult-conversation': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Communication Leadership", "Stakeholder Management", "Influence"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Emotional Regulation", "Self-Awareness", "Resilience"] }
      ],
      'subtle-negotiations': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Influence", "Persuasion", "Trust-Building"] },
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Negotiation", "Stakeholder Management"] },
        { cluster: "Strategic Mastery", metaSkill: "Strategic Planning & Vision", subSkills: ["Strategic Prioritization", "Vision vs. Viability"] }
      ],
      'public-unexpected': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Leadership Presence", "Communication Leadership", "Decision-Making under Pressure"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Self-Mastery"] }
      ],
      'staying-composed': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Self-Mastery", "Integrity"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Emotional Regulation", "Resilience", "Self-Compassion"] }
      ],
      'bouncing-back': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Resilience", "Growth Mindset", "Purpose Alignment"] },
        { cluster: "Cognitive Mastery", metaSkill: "Adaptability & Agility", subSkills: ["Adaptability", "Grit", "Decision-Making"] }
      ],
      'sustaining-energy': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Purpose Alignment", "Self-Mastery"] }
      ],
      'leading-through-change': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Change Management", "Narrative Leadership", "Empowerment"] },
        { cluster: "Strategic Mastery", metaSkill: "Strategic Planning & Vision", subSkills: ["Strategic Vision", "Long-term Planning"] }
      ],
      'inspiring-alignment': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Narrative Leadership", "Persuasive Storytelling", "Leadership Presence"] },
        { cluster: "Social Mastery", metaSkill: "Collaboration & Group Dynamics", subSkills: ["Shared Goal Alignment", "Team Facilitation"] }
      ],
      'elevating-others': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Coaching", "Empowerment", "Talent Development"] },
        { cluster: "Social Mastery", metaSkill: "Collaboration & Group Dynamics", subSkills: ["Mentorship", "Psychological Safety", "Inclusive Leadership"] }
      ],
      // New student-focused scenarios
      'presenting-in-class': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Regulation", "Confidence", "Composure"] },
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Communication Leadership", "Presence", "Clarity"] }
      ],
      'university-interview': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Mastery", "Composure", "Authenticity"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Impression Management", "Persuasion", "Active Listening"] }
      ],
      'defending-ideas': [
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Emotional Regulation", "Confidence", "Resilience"] },
        { cluster: "Cognitive Mastery", metaSkill: "Critical Thinking", subSkills: ["Logical Argumentation", "Evidence-Based Reasoning"] }
      ],
      'asking-for-help': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Vulnerability", "Trust-Building", "Clear Communication"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Awareness", "Humility"] }
      ],
      'friendship-dilemma': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Empathy", "Conflict Resolution", "Perspective-Taking"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Emotional Regulation", "Self-Awareness"] }
      ],
      'group-conflict': [
        { cluster: "Social Mastery", metaSkill: "Collaboration & Group Dynamics", subSkills: ["Conflict Resolution", "Mediation", "Team Facilitation"] },
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Influence", "Communication Leadership"] }
      ],
      'peer-pressure': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Mastery", "Integrity", "Boundary Setting"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Assertiveness", "Social Awareness"] }
      ],
      'setting-boundaries': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Self-Mastery", "Integrity", "Self-Respect"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Assertiveness", "Clear Communication"] }
      ],
      'networking-internship': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Networking", "Impression Management", "Relationship Building"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Confidence", "Initiative"] }
      ],
      'making-friends-college': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Social Awareness", "Approachability", "Authenticity"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Vulnerability", "Openness"] }
      ],
      'job-interview': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Composure", "Confidence", "Authenticity"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Persuasion", "Active Listening", "Impression Management"] }
      ],
      'mentor-conversation': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Relationship Building", "Active Listening", "Gratitude"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Initiative", "Curiosity", "Humility"] }
      ],
      // Elite school-specific scenarios
      'oxbridge-interview': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Composure", "Intellectual Confidence", "Authenticity"] },
        { cluster: "Cognitive Mastery", metaSkill: "Critical Thinking", subSkills: ["Logical Argumentation", "Intellectual Curiosity", "Abstract Reasoning"] }
      ],
      'model-un-speech': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Public Speaking", "Persuasion", "Diplomatic Communication"] },
        { cluster: "Cognitive Mastery", metaSkill: "Strategic Planning & Vision", subSkills: ["Policy Analysis", "Global Awareness"] }
      ],
      'debate-tournament': [
        { cluster: "Cognitive Mastery", metaSkill: "Critical Thinking", subSkills: ["Logical Argumentation", "Quick Thinking", "Evidence Synthesis"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Persuasion", "Rebuttals", "Audience Awareness"] }
      ],
      'scholarship-interview': [
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Authenticity", "Purpose Articulation", "Composure"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Impression Management", "Storytelling", "Gratitude"] }
      ],
      'boarding-house-dynamics': [
        { cluster: "Social Mastery", metaSkill: "Collaboration & Group Dynamics", subSkills: ["Community Building", "Conflict Resolution", "Shared Living"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Empathy", "Boundary Setting", "Adaptability"] }
      ],
      'society-elections': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Campaign Strategy", "Public Speaking", "Vision Articulation"] },
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Networking", "Influence", "Trust Building"] }
      ],
      'prefect-responsibilities': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Authority", "Role Modelling", "Mentorship"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Integrity", "Responsibility", "Time Management"] }
      ],
      'sports-captain-address': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Team Motivation", "Inspirational Speaking", "Leadership Presence"] },
        { cluster: "Self Mastery", metaSkill: "Emotional Intelligence", subSkills: ["Emotional Awareness", "Resilience", "Composure Under Pressure"] }
      ],
      'head-student-interview': [
        { cluster: "Social Mastery", metaSkill: "Leadership & Execution", subSkills: ["Vision Articulation", "Leadership Presence", "Stakeholder Management"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Purpose Alignment", "Authenticity", "Service Orientation"] }
      ],
      'gap-year-planning': [
        { cluster: "Cognitive Mastery", metaSkill: "Strategic Planning & Vision", subSkills: ["Long-term Planning", "Goal Setting", "Resource Allocation"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Initiative", "Independence", "Growth Mindset"] }
      ],
      'alumni-networking': [
        { cluster: "Social Mastery", metaSkill: "Social Intelligence", subSkills: ["Professional Networking", "Relationship Building", "Career Curiosity"] },
        { cluster: "Self Mastery", metaSkill: "Self-Regulation & Motivation", subSkills: ["Confidence", "Initiative", "Gratitude"] }
      ],
    };
    return skillMap[scenario] || [];
  };

  // Handle pre-selected values from Practice.tsx
  useEffect(() => {
    if (locationState?.preSelectedCategory) {
      const mappedCategory = categoryMapping[locationState.preSelectedCategory] || locationState.preSelectedCategory;
      setScenarioCategory(mappedCategory);
    }
  }, [locationState?.preSelectedCategory]);

  // Set specific scenario after category is set
  useEffect(() => {
    if (locationState?.preSelectedScenario && scenarioCategory) {
      setSpecificScenario(locationState.preSelectedScenario);
    }
  }, [locationState?.preSelectedScenario, scenarioCategory]);

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
        scenarioContext: specificScenario === 'custom' ? customScenario : (additionalContext || specificScenario),
        personaType: personaType,
        customPersona: customPersona,
      }
    });
  };

  return (
    <div className={`min-h-screen transition-colors duration-700 ${getBackgroundGradient(scenarioCategory)}`}>
      <TopNavigation backPath="/practice" />
      
      {/* Page Title */}
      <div className="pt-20 px-4 pb-4">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-lg font-headline font-medium text-foreground">
            Configure Your Dialogue
          </h1>
          <p className="text-xs font-headline text-muted-foreground">
            Set up your practice scenario
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4 pb-24">
        <div className="space-y-6 max-w-2xl mx-auto">
          {/* Step 1: Scenario Category */}
          <Card className="p-5 shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
            <h3 className="text-base font-headline font-medium text-foreground mb-3">
              Step 1: Choose Scenario Category
            </h3>
            <Select value={scenarioCategory} onValueChange={setScenarioCategory}>
              <SelectTrigger className="h-11 bg-card border-border">
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
                  if (value !== 'custom') setCustomScenario('');
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
                      <SelectItem value="boarding-house-dynamics">Boarding House Dynamics</SelectItem>
                      <SelectItem value="society-elections">Society Elections</SelectItem>
                      <SelectItem value="peer-pressure">Handling Peer Pressure Moments</SelectItem>
                      <SelectItem value="prefect-responsibilities">Prefect Responsibilities</SelectItem>
                      <SelectSeparator />
                    </>
                  )}
                  {scenarioCategory === 'pressure' && (
                    <>
                      <SelectItem value="public-unexpected">Handling Public Conversations & Unexpected Questions</SelectItem>
                      <SelectItem value="staying-composed">Staying Composed Under Pressure</SelectItem>
                      <SelectSeparator />
                      <SelectItem value="oxbridge-interview">Oxbridge Interview</SelectItem>
                      <SelectItem value="model-un-speech">Model UN Speech</SelectItem>
                      <SelectItem value="debate-tournament">Debate Tournament</SelectItem>
                      <SelectItem value="scholarship-interview">Scholarship Interview</SelectItem>
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
                      <SelectItem value="sports-captain-address">Sports Captain Address</SelectItem>
                      <SelectItem value="head-student-interview">Head Boy/Girl Interview</SelectItem>
                      <SelectItem value="gap-year-planning">Gap Year Planning</SelectItem>
                      <SelectItem value="alumni-networking">Alumni Networking</SelectItem>
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
                  if (value !== 'custom') setCustomPersona('');
                }}
              >
                <SelectTrigger id="persona-type" className="bg-background">
                  <SelectValue placeholder="Select a persona" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="classmate">Classmate / Peer</SelectItem>
                  <SelectItem value="teacher">Teacher / Professor</SelectItem>
                  <SelectItem value="admissions">University Admissions Officer</SelectItem>
                  <SelectItem value="dean">Dean / Head of School</SelectItem>
                  <SelectItem value="student-leader">Club President / Student Leader</SelectItem>
                  <SelectItem value="parent">Parent / Guardian</SelectItem>
                  <SelectItem value="coach">Coach / Sports Mentor</SelectItem>
                  <SelectItem value="counselor">School Counselor</SelectItem>
                  <SelectItem value="alumni">Alumni / Graduate</SelectItem>
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
                  if (value !== 'custom') setCustomPersonality('');
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
                Meta-Skills You'll Practice
              </h3>
              
              <p className="text-xs font-body text-muted-foreground mb-4 leading-relaxed">
                This dialogue will develop these core mental capabilities:
              </p>
              
              <div className="space-y-3 mb-4">
                {autoTaggedSkills.map((skillData, index) => {
                  const standardName = 
                    skillData.metaSkill.includes('Adaptability') ? '⚡ Adaptive Capacity' :
                    skillData.metaSkill.includes('Social') || skillData.metaSkill.includes('Communication') ? '🤝 Social Intelligence' :
                    skillData.metaSkill.includes('Self-Regulation') ? '🎯 Self-Regulation' :
                    skillData.metaSkill.includes('Thinking') || skillData.metaSkill.includes('Strategic') ? '🧠 Thinking Clarity' :
                    skillData.metaSkill;
                    
                  return (
                    <div key={index} className="flex items-start gap-2">
                      <span className="text-sm font-semibold text-gold">{standardName}</span>
                      <div className="flex-1">
                        <div className="flex flex-wrap gap-1.5">
                          {skillData.subSkills.map(subSkill => (
                            <span key={subSkill} className="text-xs text-muted-foreground">
                              #{subSkill.replace(/\s+/g, '')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <p className="text-xs text-muted-foreground/70 italic">
                Practice strengthens these meta-skills across all life domains
              </p>
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
