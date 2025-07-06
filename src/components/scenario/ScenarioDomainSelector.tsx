
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ScenarioDomainSelectorProps {
  scenarioDomain: string;
  onDomainChange: (domain: string) => void;
  scenarioDomains: string[];
}

const ScenarioDomainSelector = ({ scenarioDomain, onDomainChange, scenarioDomains }: ScenarioDomainSelectorProps) => {
  return (
    <div className="px-4 py-4">
      <h3 className="text-gray-800 text-lg font-bold leading-tight tracking-tight pb-3">
        Select Scenario Domain
      </h3>
      <Select value={scenarioDomain} onValueChange={onDomainChange}>
        <SelectTrigger className="w-full h-14 bg-white border-gray-300 focus:ring-0 text-base focus:border-hyper-coral">
          <SelectValue placeholder="Choose the type of scenario" />
        </SelectTrigger>
        <SelectContent className="bg-white border-gray-200">
          {scenarioDomains.map(domain => (
            <SelectItem key={domain} value={domain}>{domain}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default ScenarioDomainSelector;
