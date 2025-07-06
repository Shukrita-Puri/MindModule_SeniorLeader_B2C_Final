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
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-xl font-heading text-foreground">Your Reflection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              What insights will you carry forward?
            </label>
            <Textarea
              value={personalNotes}
              onChange={(e) => setPersonalNotes(e.target.value)}
              placeholder="Capture your key learnings, commitments, and next actions..."
              className="min-h-[120px] border-border focus:border-primary"
            />
          </div>
          <Button 
            onClick={onSaveNotes}
            className="w-full bg-primary hover:bg-primary/90"
          >
            <BookOpen size={16} className="mr-2" />
            Save to Learning Archive
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PersonalReflectionSection;