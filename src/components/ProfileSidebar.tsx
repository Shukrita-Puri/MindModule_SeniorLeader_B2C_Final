import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import PrivacyDashboard from "./PrivacyDashboard";
import { useAuth } from "@/hooks/useAuth";

const ProfileSidebar = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/signup');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-semibold">Profile & Settings</h2>
      </div>

      {/* Privacy Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <PrivacyDashboard />
      </div>

      {/* Sign Out Button */}
      {user && (
        <div className="p-6 border-t border-border">
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
    </div>
  );
};

export default ProfileSidebar;
