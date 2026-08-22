import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import mmLogo from "@/assets/brand/mm-logo-circle.png";

interface UnifiedTopBarProps {
  backPath?: string;
  onBack?: () => void;
  hideCoach?: boolean;
  showBrand?: boolean;
}

const UnifiedTopBar = ({ backPath, onBack, showBrand }: UnifiedTopBarProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 safe-area-top bg-white/85 backdrop-blur-[30px] border-b border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Back Button */}
        <Button variant="glass" size="sm" onClick={handleBack}>
          <ChevronLeft size={20} />
        </Button>
        {showBrand ? (
          <div className="flex items-center gap-2 pr-1">
            <img src={mmLogo} alt="" aria-hidden className="w-6 h-6 rounded-full" />
            <div className="flex flex-col items-end leading-none">
              <span className="text-[11px] font-headline font-bold tracking-[0.18em] text-[#1a1712]">
                MIND MODULE
              </span>
              <span className="text-[8px] tracking-[0.25em] uppercase text-[#7a7060] mt-0.5">
                Executive
              </span>
            </div>
          </div>
        ) : (
          <div className="w-10" />
        )}
      </div>
    </div>
  );
};

export default UnifiedTopBar;
