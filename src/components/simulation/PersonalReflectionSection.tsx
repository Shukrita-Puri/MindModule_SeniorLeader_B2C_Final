import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PersonalReflectionSectionProps {
  personalNotes: string;
  setPersonalNotes: (notes: string) => void;
  onSaveNotes: () => void;
}

const PersonalReflectionSection = ({ personalNotes, setPersonalNotes, onSaveNotes }: PersonalReflectionSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className="space-y-6">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer group pb-3">
            <div>
              <h3 className="text-lg md:text-xl font-heading font-bold text-forest mb-1">
                Your Reflection
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground font-body">
                What insights will you carry forward?
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-forest">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-4 mt-4">
            <Textarea
              value={personalNotes}
              onChange={(e) => setPersonalNotes(e.target.value)}
              placeholder="Capture your key learnings, commitments, and next actions..."
              className="min-h-[120px] border-gold/40 focus:border-gold bg-background/50 font-body text-sm"
            />
            <Button 
              onClick={onSaveNotes}
              className="w-full bg-forest hover:bg-forest/90 text-white"
            >
              <BookOpen size={16} className="mr-2" />
              Save to My Archive
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default PersonalReflectionSection;