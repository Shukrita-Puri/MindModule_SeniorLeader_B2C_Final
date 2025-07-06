
import { Textarea } from "@/components/ui/textarea";

interface PersonaSelectorProps {
  selectedPersonas: string[];
  customPersonas: string;
  onPersonaToggle: (persona: string) => void;
  onCustomPersonasChange: (value: string) => void;
  availablePersonas: string[];
  contextType: string;
}

const PersonaSelector = ({ 
  selectedPersonas, 
  customPersonas, 
  onPersonaToggle, 
  onCustomPersonasChange, 
  availablePersonas,
  contextType 
}: PersonaSelectorProps) => {
  if (!contextType) return null;

  return (
    <div className="px-4 py-4">
      <h3 className="text-gray-800 text-lg font-bold leading-tight tracking-tight pb-3">
        Select Personas Involved
      </h3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {availablePersonas.map(persona => (
          <button
            key={persona}
            onClick={() => onPersonaToggle(persona)}
            className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
              selectedPersonas.includes(persona)
                ? 'bg-hyper-coral text-white border-hyper-coral'
                : 'bg-white text-gray-800 border-gray-300 hover:border-hyper-coral'
            }`}
          >
            {persona}
          </button>
        ))}
      </div>
      
      <div className="mt-4">
        <label className="text-gray-800 text-sm font-medium mb-2 block">
          Custom Personas & Their Roles
        </label>
        <Textarea
          value={customPersonas}
          onChange={(e) => onCustomPersonasChange(e.target.value)}
          placeholder="Describe any specific personas and their roles (e.g., 'CFO who is skeptical of new tech investments and prefers proven ROI models')"
          className="w-full border-gray-300 focus:border-hyper-coral bg-white"
          rows={3}
        />
      </div>
    </div>
  );
};

export default PersonaSelector;
