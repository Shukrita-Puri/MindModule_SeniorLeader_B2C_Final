import { useState } from "react";
import { ArrowLeft, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ProfileSidebar from "@/components/ProfileSidebar";

interface UnifiedTopBarProps {
  backPath?: string;
  onBack?: () => void;
}

const UnifiedTopBar = ({ backPath, onBack }: UnifiedTopBarProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Left: Back Button */}
        <Button
          variant="glass"
          size="sm"
          onClick={handleBack}
          className="hover:bg-white/10"
        >
          <ArrowLeft size={20} />
        </Button>

        {/* Right: Menu (Profile & Settings) */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="glass" size="sm" className="hover:bg-white/10">
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:max-w-[540px] p-0 bg-card/95 backdrop-blur-xl border-white/10">
            <ProfileSidebar />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default UnifiedTopBar;
