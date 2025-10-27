import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectLabel } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import FileUploadSection from "@/components/FileUploadSection";
import MainNavigation from "@/components/MainNavigation";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

const SocialIntelligenceLab = () => {
  const navigate = useNavigate();
  
  // State management
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
  const [autoTaggedSkills, setAutoTaggedSkills] = useState<string[]>([]);

  // Auto-tagging logic
  const getMetaSkills = (scenario: string): string[] => {
    const skillMap: Record<string, string[]> = {
      'uncertainty': ['Adaptability', 'Decision-Making', 'Influence'],
      'balance-change': ['Adaptability', 'Resilience', 'Focus'],
      'conflict': ['Adaptability', 'Emotional Intelligence', 'Diplomacy'],
      'influence-disagree': ['Communication', 'Persuasion', 'Empathy'],
      'hidden-tensions': ['Communication', 'Power Dynamics', 'Self-Regulation'],
      'public-questions': ['Communication', 'Composure', 'Influence'],
      'difficult-convo': ['Communication', 'Emotional Regulation', 'Courage'],
      'staying-composed': ['Self-Regulation', 'Emotional Control', 'Confidence'],
      'bouncing-back': ['Resilience', 'Growth Mindset', 'Reflection'],
      'sustaining-energy': ['Self-Regulation', 'Energy Management', 'Boundaries'],
    };
    return skillMap[scenario] || [];
  };

  // Update meta skills when scenario changes
  useEffect(() => {
    if (specificScenario && specificScenario !== 'custom') {
      setAutoTaggedSkills(getMetaSkills(specificScenario));
    }
  }, [specificScenario]);

  // Background gradient based on category
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

  // Form validation
  const isFormComplete = 
    scenarioCategory && 
    specificScenario && 
    (specificScenario !== 'custom' || customScenario.trim()) &&
    personaType &&
    (personaType !== 'custom' || customPersona.trim()) &&
    personalityStyle &&
    (personalityStyle !== 'custom' || customPersonality.trim()) &&
    voicePreference;

  // Handle start dialogue
  const handleStartDialogue = () => {
    navigate('/practice/simulation', {
      state: {
        scenarioCategory,
        specificScenario: specificScenario === 'custom' ? customScenario : specificScenario,
        personaType: personaType === 'custom' ? customPersona : personaType,
        personalityStyle: personalityStyle === 'custom' ? customPersonality : personalityStyle,
        voicePreference,
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
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/executive')}
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-headline font-medium text-forest">
            Dialogue Room
          </h1>
        </div>
      </header>

      {/* Hero Section */}
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="text-center space-y-6 mb-16">
          <div className="mx-auto w-full max-w-md aspect-[4/3] rounded-2xl overflow-hidden border-2 border-forest/20 shadow-lg">
            <img 
              src="/lovable-uploads/ae4d66fb-b3ea-4ef5-bfff-f228c447224c.png"
              alt="Dialogue Room - Practice conversations with precision"
              className="w-full h-full object-cover"
            />
          </div>
          
          <p className="italic text-muted-foreground text-base max-w-2xl mx-auto">
            Rehearse the conversations in a private space, refine your influence, before they matter
          </p>
          
          <div className="text-foreground leading-relaxed space-y-3 max-w-2xl mx-auto">
            <p>Every word carries weight. Every tone, a ripple.</p>
            <p>Here, you practice the conversations that shape outcomes — before they unfold.</p>
            <p>Step inside a reflective simulation where precision meets empathy.</p>
            <p>Your AI dialogue partner is adaptive, calm, and built to sharpen your edge.</p>
          </div>
        </div>

        {/* Dropdown Form */}
        <div className="space-y-6 max-w-2xl mx-auto pb-24">
          
          {/* Step 1: Scenario Category */}
          <Card className="p-5 shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
            <h3 className="text-base font-medium text-foreground mb-3">
              Step 1: Choose Scenario Category
            </h3>
            <Select value={scenarioCategory} onValueChange={setScenarioCategory}>
              <SelectTrigger className="w-full h-14 bg-card border-border">
                <SelectValue placeholder="Choose a Scenario Category" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="leadership">Leadership Moments — inspire, align, and elevate others</SelectItem>
                <SelectItem value="difficult">Difficult Conversations — navigate tension with composure and truth</SelectItem>
                <SelectItem value="pressure">High-Pressure Situations — perform with precision under stress</SelectItem>
                <SelectItem value="change">Moments of Change — guide transitions with confidence</SelectItem>
                <SelectItem value="recovery">Recovery & Resilience — restore calm and integrity after disruption</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          {/* Step 2: Specific Scenario */}
          {scenarioCategory && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 2: Choose Specific Scenario
              </h3>
              <Select value={specificScenario} onValueChange={setSpecificScenario}>
                <SelectTrigger className="w-full h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Specific Scenario" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border max-h-[400px]">
                  <SelectLabel className="text-forest font-semibold">Navigating Uncertainty & Change</SelectLabel>
                  <SelectItem value="uncertainty">Navigating Through Uncertainty</SelectItem>
                  <SelectItem value="balance-change">Balancing Change and Stability</SelectItem>
                  <SelectItem value="conflict">Navigating Conflict</SelectItem>
                  <Separator className="my-2 border-forest/10" />
                  
                  <SelectLabel className="text-forest font-semibold">Conversations That Matter</SelectLabel>
                  <SelectItem value="influence-disagree">Influencing Someone Who Disagrees</SelectItem>
                  <SelectItem value="hidden-tensions">Managing Hidden Tensions and Egos</SelectItem>
                  <SelectItem value="difficult-convo">Having a Difficult Conversation</SelectItem>
                  <Separator className="my-2 border-forest/10" />
                  
                  <SelectLabel className="text-forest font-semibold">Performing Under Pressure</SelectLabel>
                  <SelectItem value="public-questions">Handling Public Conversations & Unexpected Questions</SelectItem>
                  <SelectItem value="staying-composed">Staying Composed Under Pressure</SelectItem>
                  <Separator className="my-2 border-forest/10" />
                  
                  <SelectLabel className="text-forest font-semibold">Recovery & Renewal</SelectLabel>
                  <SelectItem value="bouncing-back">Bouncing Back After a Setback</SelectItem>
                  <SelectItem value="sustaining-energy">Sustaining Energy Under Long-Term Pressure</SelectItem>
                  
                  <Separator className="my-3 border-forest/20" />
                  <SelectItem value="custom" className="font-semibold text-forest">✨ Customise Scenario</SelectItem>
                </SelectContent>
              </Select>

              {/* Custom Scenario Input */}
              {specificScenario === 'custom' && (
                <div className="animate-fade-in space-y-3 mt-4">
                  <Label className="text-foreground font-medium">Describe Your Scenario</Label>
                  <Textarea
                    value={customScenario}
                    onChange={(e) => setCustomScenario(e.target.value)}
                    placeholder="Describe the specific situation you want to practice... (e.g., 'Board disagreement on M&A decision requiring consensus-building')"
                    className="min-h-[120px] bg-card border-border"
                  />
                </div>
              )}
            </Card>
          )}

          {/* Step 3: Persona */}
          {specificScenario && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 3: Choose Persona
              </h3>
              <Select value={personaType} onValueChange={setPersonaType}>
                <SelectTrigger className="w-full h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Persona" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="board-member">Board Member</SelectItem>
                  <SelectItem value="board-chair">Board Chair</SelectItem>
                  <SelectItem value="colleague">Colleague</SelectItem>
                  <SelectItem value="team-member">Team Member</SelectItem>
                  <SelectItem value="self">Self (Inner Voice)</SelectItem>
                  <Separator className="my-2 border-forest/10" />
                  <SelectItem value="custom" className="font-semibold text-forest">✨ Customise Persona</SelectItem>
                </SelectContent>
              </Select>

              {/* Custom Persona Input */}
              {personaType === 'custom' && (
                <div className="animate-fade-in space-y-3 mt-4">
                  <Label className="text-foreground font-medium">Describe Custom Persona</Label>
                  <Textarea
                    value={customPersona}
                    onChange={(e) => setCustomPersona(e.target.value)}
                    placeholder="Describe the persona and their role (e.g., 'CFO who is skeptical of new tech investments and prefers proven ROI models')"
                    className="min-h-[100px] bg-card border-border"
                  />
                </div>
              )}
            </Card>
          )}

          {/* Step 4: Personality Style */}
          {personaType && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 4: Choose Personality Style
              </h3>
              <Select value={personalityStyle} onValueChange={setPersonalityStyle}>
                <SelectTrigger className="w-full h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Personality Style" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="supportive">Supportive — encouraging, collaborative, empathetic</SelectItem>
                  <SelectItem value="demanding">Demanding — high standards, results-driven</SelectItem>
                  <SelectItem value="challenging">Challenging — analytical, skeptical, probing</SelectItem>
                  <SelectItem value="aggressive">Aggressive — confrontational, blunt, dominating</SelectItem>
                  <SelectItem value="competitive">Competitive — seeks to win, compares constantly</SelectItem>
                  <SelectItem value="collaborative">Collaborative — seeks joint solutions</SelectItem>
                  <SelectItem value="passive">Passive — withdrawn, non-committal</SelectItem>
                  <SelectItem value="anxious">Anxious — nervous, easily overwhelmed</SelectItem>
                  <Separator className="my-2 border-forest/10" />
                  <SelectItem value="custom" className="font-semibold text-forest">✨ Customise Personality</SelectItem>
                </SelectContent>
              </Select>

              {/* Custom Personality Input */}
              {personalityStyle === 'custom' && (
                <div className="animate-fade-in space-y-3 mt-4">
                  <Label className="text-foreground font-medium">Describe Personality Traits</Label>
                  <Textarea
                    value={customPersonality}
                    onChange={(e) => setCustomPersonality(e.target.value)}
                    placeholder="Describe specific personality traits and communication style..."
                    className="min-h-[80px] bg-card border-border"
                  />
                </div>
              )}
            </Card>
          )}

          {/* Step 5: Voice Preference */}
          {personalityStyle && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 5: Choose Voice
              </h3>
              <Select value={voicePreference} onValueChange={setVoicePreference}>
                <SelectTrigger className="w-full h-14 bg-card border-border">
                  <SelectValue placeholder="Choose Voice" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="feminine">Feminine Tone</SelectItem>
                  <SelectItem value="masculine">Masculine Tone</SelectItem>
                  <SelectItem value="neutral">Neutral Tone</SelectItem>
                </SelectContent>
              </Select>
            </Card>
          )}

          {/* Step 6: Additional Context */}
          {voicePreference && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 6: Add Additional Context
              </h3>
              <div className="space-y-3">
                <Label className="text-foreground font-medium">Additional Context (Optional)</Label>
                <Textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Add any specific details about the situation, relationships, or background..."
                  className="min-h-[100px] bg-card border-border"
                />
                
                <FileUploadSection
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  maxFiles={3}
                  maxFileSize={10}
                />
              </div>
            </Card>
          )}

          {/* Auto-Tagged Meta Skills */}
          {specificScenario && specificScenario !== 'custom' && autoTaggedSkills.length > 0 && (
            <div className="mt-6 p-4 bg-forest/5 border border-forest/20 rounded-xl animate-fade-in">
              <p className="text-sm text-muted-foreground mb-3">This scenario develops:</p>
              <div className="flex flex-wrap gap-2">
                {autoTaggedSkills.map(skill => (
                  <Badge key={skill} variant="forest" className="bg-forest/10 border-forest/30 text-forest">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Primary CTA */}
          {voicePreference && (
            <div className="pt-8 pb-6 text-center animate-fade-in">
              <Button
                onClick={handleStartDialogue}
                disabled={!isFormComplete}
                variant="forest"
                size="lg"
                className="w-full max-w-md text-lg shadow-[0_8px_24px_rgba(61,111,95,0.2)]"
              >
                Start the Dialogue
              </Button>
            </div>
          )}
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SocialIntelligenceLab;
