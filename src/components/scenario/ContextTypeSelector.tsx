
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ContextTypeSelectorProps {
  contextType: string;
  onContextChange: (context: string) => void;
  scenarioDomain: string;
  contextTypes: Record<string, string[]>;
}

const ContextTypeSelector = ({ contextType, onContextChange, scenarioDomain, contextTypes }: ContextTypeSelectorProps) => {
  if (!scenarioDomain) return null;

  return (
    <div className="px-4 py-4">
      <h3 className="text-gray-800 text-lg font-bold leading-tight tracking-tight pb-3">
        Select Context Type
      </h3>
      <Select value={contextType} onValueChange={onContextChange}>
        <SelectTrigger className="w-full h-14 bg-white border-gray-300 focus:ring-0 text-base focus:border-hyper-coral">
          <SelectValue placeholder="Choose the specific context" />
        </SelectTrigger>
        <SelectContent className="bg-white border-gray-200">
          {contextTypes[scenarioDomain as keyof typeof contextTypes]?.map(context => (
            <SelectItem key={context} value={context}>{context}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ContextTypeSelector;
