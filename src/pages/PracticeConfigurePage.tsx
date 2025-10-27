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
  const [autoTaggedSkills, setAutoTaggedSkills] = useState<string[]>([]);

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
      {/* Header with back button */}
      <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/practice')}
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-headline font-medium text-forest">
              Configure Your Dialogue
            </h1>
            <p className="text-xs text-muted-foreground">
              Set up your practice scenario
            </p>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 pb-24">
        {/* Configuration Form */}
        <div className="space-y-6 max-w-2xl mx-auto">
          {/* Step 1: Scenario Category */}
          <Card className="p-5 shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
            <h3 className="text-base font-medium text-foreground mb-3">
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
          {scenarioCategory && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 2: Choose Specific Scenario
              </h3>
              <Select value={specificScenario} onValueChange={setSpecificScenario}>
                <SelectTrigger className="h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Specific Scenario" />
                </SelectTrigger>
                <SelectContent>
                  <SelectLabel className="text-forest font-medium">Navigating Uncertainty & Change</SelectLabel>
                  <SelectItem value="uncertainty">Navigating Through Uncertainty</SelectItem>
                  <SelectItem value="balance-change">Balancing Change and Stability</SelectItem>
                  <SelectItem value="conflict">Navigating Conflict</SelectItem>
                  
                  <SelectSeparator className="my-2" />
                  
                  <SelectLabel className="text-forest font-medium">Conversations That Matter</SelectLabel>
                  <SelectItem value="influence-disagree">Influencing Someone Who Disagrees</SelectItem>
                  <SelectItem value="hidden-tensions">Managing Hidden Tensions and Egos</SelectItem>
                  <SelectItem value="difficult-convo">Having a Difficult Conversation</SelectItem>
                  
                  <SelectSeparator className="my-2" />
                  
                  <SelectLabel className="text-forest font-medium">Performing Under Pressure</SelectLabel>
                  <SelectItem value="public-questions">Handling Public Conversations & Unexpected Questions</SelectItem>
                  <SelectItem value="staying-composed">Staying Composed Under Pressure</SelectItem>
                  
                  <SelectSeparator className="my-2" />
                  
                  <SelectLabel className="text-forest font-medium">Recovery & Renewal</SelectLabel>
                  <SelectItem value="bouncing-back">Bouncing Back After a Setback</SelectItem>
                  <SelectItem value="sustaining-energy">Sustaining Energy Under Long-Term Pressure</SelectItem>
                  
                  <SelectSeparator className="my-2" />
                  
                  <SelectItem value="custom">✨ Customise Scenario</SelectItem>
                </SelectContent>
              </Select>

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

          {/* Step 3: Persona Type */}
          {specificScenario && (
            <Card className="p-5 animate-fade-in shadow-[0_8px_24px_rgba(74,44,42,0.08)]">
              <h3 className="text-base font-medium text-foreground mb-3">
                Step 3: Choose Persona
              </h3>
              <Select value={personaType} onValueChange={setPersonaType}>
                <SelectTrigger className="h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Persona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="teacher">Teacher</SelectItem>
                  <SelectItem value="board-member">Board Member</SelectItem>
                  <SelectItem value="board-chair">Board Chair</SelectItem>
                  <SelectItem value="colleague">Colleague</SelectItem>
                  <SelectItem value="team-member">Team Member</SelectItem>
                  <SelectItem value="self">Self (Inner Voice)</SelectItem>
                  <SelectSeparator className="my-2" />
                  <SelectItem value="custom">✨ Customise Persona</SelectItem>
                </SelectContent>
              </Select>

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
                <SelectTrigger className="h-14 bg-card border-border">
                  <SelectValue placeholder="Choose a Personality Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supportive">Supportive — encouraging, collaborative, empathetic</SelectItem>
                  <SelectItem value="demanding">Demanding — high standards, results-driven</SelectItem>
                  <SelectItem value="challenging">Challenging — analytical, skeptical, probing</SelectItem>
                  <SelectItem value="aggressive">Aggressive — confrontational, blunt, dominating</SelectItem>
                  <SelectItem value="competitive">Competitive — seeks to win, compares constantly</SelectItem>
                  <SelectItem value="collaborative">Collaborative — seeks joint solutions</SelectItem>
                  <SelectItem value="passive">Passive — withdrawn, non-committal</SelectItem>
                  <SelectItem value="anxious">Anxious — nervous, easily overwhelmed</SelectItem>
                  <SelectSeparator className="my-2" />
                  <SelectItem value="custom">✨ Customise Personality</SelectItem>
                </SelectContent>
              </Select>

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
                <SelectTrigger className="h-14 bg-card border-border">
                  <SelectValue placeholder="Choose Voice" />
                </SelectTrigger>
                <SelectContent>
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
                Step 6: Add Additional Context (Optional)
              </h3>
              <div className="space-y-3">
                <Label className="text-foreground font-medium">Additional Context</Label>
                <Textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="Add any specific details about the situation, relationships, or background..."
                  className="min-h-[100px] bg-card border-border"
                />

                {/* File Upload */}
                <FileUploadSection
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  maxFiles={3}
                  maxFileSize={10}
                />
              </div>
            </Card>
          )}

          {/* Auto-tagged meta skills */}
          {specificScenario && autoTaggedSkills.length > 0 && (
            <Card className="p-5 bg-forest/5 border-forest/20 animate-fade-in">
              <p className="text-sm text-muted-foreground mb-3">This scenario develops:</p>
              <div className="flex flex-wrap gap-2">
                {autoTaggedSkills.map(skill => (
                  <Badge key={skill} variant="outline" className="bg-forest/10 border-forest/30 text-forest">
                    {skill}
                  </Badge>
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
              className="w-full max-w-md text-lg shadow-[0_8px_24px_rgba(61,111,95,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start the Dialogue
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default PracticeConfigurePage;
