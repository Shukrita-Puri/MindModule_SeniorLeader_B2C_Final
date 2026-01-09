import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Compass, Sun, Bell } from "lucide-react";
import PrivacyDashboard from "./PrivacyDashboard";
import { useAuth } from "@/hooks/useAuth";

const ProfileSidebar = () => {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/signup');
  };

  const quickActions = [
    {
      label: "Recalibrate Studio",
      icon: Compass,
      path: "/recalibrate",
      description: "Shift your energy state"
    },
    {
      label: "Daily Check-In",
      icon: Sun,
      path: "/daily-check-in",
      description: "Log your current state"
    },
    {
      label: "Nudge Settings",
      icon: Bell,
      path: "/nudge-settings",
      description: "Configure reminders"
    }
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-semibold">Profile & Settings</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Quick Actions Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Quick Actions</h3>
          <div className="space-y-2">
            {quickActions.map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border" />

        {/* Privacy Dashboard Content */}
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
