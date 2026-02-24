import { useState } from "react";
import { Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ProfileSidebar from "./ProfileSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const GlobalHeader = () => {
  const [open, setOpen] = useState(false);
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    setOpen(false);
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed left-0 z-50 p-4 top-0 safe-area-top">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="bg-card/80 backdrop-blur-sm border border-gold/20 hover:bg-card"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
          <ProfileSidebar />
          {user && (
            <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-border">
              <Button 
                onClick={handleSignOut}
                variant="outline" 
                className="w-full"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default GlobalHeader;
