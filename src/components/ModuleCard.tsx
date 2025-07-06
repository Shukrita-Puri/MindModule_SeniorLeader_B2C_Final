
import { LucideIcon } from "lucide-react";

interface ModuleCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
  onClick: () => void;
  accentColor?: 'cyan' | 'emerald' | 'fuchsia';
}

const ModuleCard = ({ title, subtitle, description, onClick, accentColor = 'cyan' }: ModuleCardProps) => {
  const accentColors = {
    cyan: 'bg-cyan-100',
    emerald: 'bg-emerald-100', 
    fuchsia: 'bg-fuchsia-100'
  };

  return (
    <div 
      className="relative bg-white rounded-xl p-8 hover:bg-slate-50 transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md border border-slate-200 min-h-[280px] flex flex-col"
      onClick={onClick}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-3 rounded-xl overflow-hidden">
        <div className={`absolute top-4 right-4 w-32 h-32 ${accentColors[accentColor]} rounded-full`}></div>
        <div className="absolute bottom-4 left-4 w-24 h-24 bg-slate-100 rounded-full"></div>
      </div>
      
      <div className="relative z-10 flex-1 flex flex-col">
        <div className="mb-6">
          <h3 className="text-slate-800 text-2xl font-bold leading-tight mb-3 font-manrope">
            {title}
          </h3>
          <p className="text-slate-700 text-base font-normal leading-normal font-manrope mb-4">
            {subtitle}
          </p>
        </div>
        <p className="text-slate-500 text-sm font-normal leading-relaxed font-manrope flex-1">
          {description}
        </p>
      </div>
    </div>
  );
};

export default ModuleCard;
