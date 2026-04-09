import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface TopNavigationProps {
  backPath?: string;
  transparent?: boolean;
}

const TopNavigation = ({ backPath, transparent = false }: TopNavigationProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`fixed top-0 left-0 right-0 z-50 safe-area-top ${transparent ? 'bg-gradient-to-b from-black/60 to-transparent backdrop-blur-md border-b border-white/10' : 'bg-background/80 backdrop-blur-sm border-b border-gold/20'} shadow-sm`}>
      <div className="flex items-center justify-between px-5 md:px-8 py-2">
        {/* Left: Back Arrow */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className={transparent ? "hover:bg-white/10" : "hover:bg-muted/50"}
        >
          <ArrowLeft size={20} className={transparent ? "text-white" : "text-foreground"} />
        </Button>
        <div className="w-10" />
      </div>
    </div>
  );
};

export default TopNavigation;
