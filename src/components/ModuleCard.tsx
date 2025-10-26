
import { LucideIcon } from "lucide-react";

interface ModuleCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  onClick: () => void;
  accentColor?: 'cyan' | 'emerald' | 'fuchsia';
}

const ModuleCard = ({ title, subtitle, description, onClick }: ModuleCardProps) => {
  return (
    <div 
      className="relative bg-card rounded-sm p-8 hover:bg-muted/30 transition-all duration-500 cursor-pointer border border-border min-h-[280px] flex flex-col group"
      onClick={onClick}
    >
      {/* Dusted Gold accent line on hover */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gold opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="mb-6">
          <h3 className="text-foreground text-2xl font-headline font-bold leading-tight mb-3">
            {title}
          </h3>
          <p className="text-secondary text-base font-body font-normal leading-normal mb-4">
            {subtitle}
          </p>
        </div>
        <p className="text-muted-foreground text-sm font-body leading-relaxed flex-1">
          {description}
        </p>
      </div>
      
      {/* Subtle lift indicator */}
      <div className="absolute bottom-0 right-0 w-8 h-8 border-r border-b border-gold opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-sm" />
    </div>
  );
};

export default ModuleCard;
