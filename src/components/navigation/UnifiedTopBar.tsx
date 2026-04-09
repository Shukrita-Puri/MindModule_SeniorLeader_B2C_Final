import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface UnifiedTopBarProps {
  backPath?: string;
  onBack?: () => void;
  hideCoach?: boolean;
}

const UnifiedTopBar = ({ backPath, onBack }: UnifiedTopBarProps) => {
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
          <ArrowLeft size={20} />
        </Button>
        <div className="w-10" />
      </div>
    </div>
  );
};

export default UnifiedTopBar;
