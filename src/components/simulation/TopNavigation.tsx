import { ArrowLeft, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProfileSidebar from "@/components/ProfileSidebar";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface TopNavigationProps {
  backPath?: string;
}

const TopNavigation = ({ backPath }: TopNavigationProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleBack = () => {
    if (backPath) {
      navigate(backPath);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm border-b border-gold/20 shadow-sm">
      <div className="flex items-center justify-between px-5 md:px-8 py-3">
        {/* Left: Back Arrow */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleBack}
          className="hover:bg-muted/50"
        >
          <ArrowLeft size={20} className="text-foreground" />
        </Button>

        {/* Right: Menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="hover:bg-muted/50">
              <Menu size={20} className="text-foreground" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md">
            <ProfileSidebar />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default TopNavigation;
