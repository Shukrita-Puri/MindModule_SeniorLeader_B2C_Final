
import { Button } from "@/components/ui/button";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Shield, BookOpen, Archive, Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import PrivacyDashboard from "./PrivacyDashboard";

const ProfileSidebar = () => {
  const navigate = useNavigate();

  return (
    <>
      <SheetHeader className="p-6 border-b">
        <SheetTitle className="flex items-center gap-2">
          <User size={20} />
          Profile & Settings
        </SheetTitle>
      </SheetHeader>
      
      <Tabs defaultValue="privacy" className="flex-1">
        <TabsList className="grid w-full grid-cols-3 m-4 mb-0">
          <TabsTrigger value="privacy" className="text-xs">
            <Shield size={14} className="mr-1" />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">
            <Archive size={14} className="mr-1" />
            Tools
          </TabsTrigger>
          <TabsTrigger value="library" className="text-xs">
            <BookOpen size={14} className="mr-1" />
            Library
          </TabsTrigger>
        </TabsList>
        
        <div className="p-4 h-[calc(100vh-120px)] overflow-y-auto">
          <TabsContent value="privacy" className="mt-0">
            <PrivacyDashboard />
          </TabsContent>
          
          <TabsContent value="tools" className="mt-0 space-y-4">
            <div className="space-y-4">
              <h3 className="font-medium">Personal Tools</h3>
              
              {/* Memory Archive */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-red-50">
                    <Archive size={16} className="text-hyper-coral" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Memory Archive</h4>
                    <p className="text-sm text-gray-600">Archive and revisit your growth journey</p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/memory-archive')}
                  variant="outline"
                  size="sm"
                  className="w-full border-gray-300 text-gray-700"
                >
                  Access Archive
                </Button>
              </div>

              {/* Smart Nudges */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-red-50">
                    <Bell size={16} className="text-hyper-coral" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Smart Nudges</h4>
                    <p className="text-sm text-gray-600">Configure intelligent notifications</p>
                  </div>
                </div>
                <Button
                  onClick={() => navigate('/nudge-settings')}
                  variant="outline"
                  size="sm"
                  className="w-full border-gray-300 text-gray-700"
                >
                  Settings
                </Button>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="library" className="mt-0">
            <div className="space-y-4">
              <h3 className="font-medium">Knowledge Library</h3>
              <p className="text-sm text-gray-600">Store summaries from conversations, articles, podcasts and knowledge drops for future reference.</p>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">Coming soon - Your personal knowledge vault</p>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
};

export default ProfileSidebar;
