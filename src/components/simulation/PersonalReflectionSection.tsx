import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface PersonalReflectionSectionProps {
  personalNotes: string;
  setPersonalNotes: (notes: string) => void;
  onSaveNotes: () => void;
}

const PersonalReflectionSection = ({ personalNotes, setPersonalNotes, onSaveNotes }: PersonalReflectionSectionProps) => {
  return (
    <div className="bg-gradient-to-br from-background to-muted/20 rounded-lg p-6 border border-border/10 shadow-sm">
      <div className="border-b border-gold/20 pb-3 mb-6">
        <h3 className="text-2xl font-heading font-medium text-foreground mb-1">
          Your Reflection
        </h3>
        <p className="text-sm text-muted-foreground font-body">
          What insights will you carry forward?
        </p>
      </div>
      <div className="space-y-4">
        <Textarea
          value={personalNotes}
          onChange={(e) => setPersonalNotes(e.target.value)}
          placeholder="Capture your key learnings, commitments, and next actions..."
          className="min-h-[120px] border-border/20 focus:border-forest bg-background/50 font-body"
        />
        <Button 
          onClick={onSaveNotes}
          className="w-full bg-forest hover:bg-forest/90 text-white"
        >
          <BookOpen size={16} className="mr-2" />
          Save to Learning Archive
        </Button>
      </div>
    </div>
  );
};

export default PersonalReflectionSection;