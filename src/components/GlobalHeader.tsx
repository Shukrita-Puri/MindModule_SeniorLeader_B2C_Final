import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import ProfileSidebar from "./ProfileSidebar";

const GlobalHeader = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-0 left-0 z-50 p-4">
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
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default GlobalHeader;
