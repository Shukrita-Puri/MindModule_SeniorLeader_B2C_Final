
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ScenarioContextSectionProps {
  scenarioContext: string;
  onContextChange: (value: string) => void;
  selectedPersonas: string[];
  customPersonas: string;
}

const ScenarioContextSection = ({ 
  scenarioContext, 
  onContextChange, 
  selectedPersonas, 
  customPersonas 
}: ScenarioContextSectionProps) => {
  if (selectedPersonas.length === 0 && !customPersonas.trim()) return null;

  return (
    <div className="px-4 py-4">
      <h3 className="text-gray-800 text-lg font-bold leading-tight tracking-tight pb-3">
        Scenario Context & Brief
      </h3>
      <Textarea
        value={scenarioContext}
        onChange={(e) => onContextChange(e.target.value)}
        placeholder="Provide additional context, background, objectives, and any specific details about the scenario you want to practice..."
        className="w-full min-h-[120px] border-gray-300 focus:border-hyper-coral bg-white"
      />
      
      <div className="mt-4">
        <label className="text-gray-800 text-sm font-medium mb-2 block">Upload Supporting Documents</label>
        <Button variant="outline" className="w-full bg-white text-gray-800 border-gray-800 hover:bg-gray-50">
          <Upload size={16} className="mr-2" />
          Upload Context Documents, Emails, Reports
        </Button>
        <p className="text-xs text-gray-600 mt-2">Upload relevant materials to enhance scenario realism and persona accuracy</p>
      </div>
    </div>
  );
};

export default ScenarioContextSection;
