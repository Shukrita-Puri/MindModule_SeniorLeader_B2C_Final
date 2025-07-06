
import { useState } from "react";
import { ArrowLeft, Calendar, Check, Download } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ModeDial from "@/components/ModeDial";
import MainNavigation from "@/components/MainNavigation";

interface CraftSection {
  title: string;
  content: string;
  actionSteps?: string[];
}

const ClaritySummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const messages = location.state?.messages || [];
  
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [customAction, setCustomAction] = useState("");

  // Generate CRAFT summary from conversation
  const craftSummary: CraftSection[] = [
    {
      title: "Context",
      content: "What was the situation or challenge you brought to this conversation?",
    },
    {
      title: "Reflection", 
      content: "What emotions, beliefs, or patterns did you discover during our dialogue?",
    },
    {
      title: "Awareness",
      content: "What new insights or perspectives emerged about yourself or the situation?",
      actionSteps: [
        "Take 3 deep breaths before challenging conversations with friends",
        "Set aside 15 minutes each Sunday for self-reflection",
        "Write down your top 3 values and post them where you'll see them daily",
        "Find a trusted adult mentor for monthly check-ins"
      ]
    },
    {
      title: "Future",
      content: "What do you want to do differently moving forward?",
      actionSteps: [
        "Practice saying 'no' to commitments that don't align with priorities",
        "Create study boundaries (no phone during focused work time)",
        "Have honest conversations about expectations with parents/teachers",
        "Build in buffer time between activities to avoid rushing"
      ]
    },
    {
      title: "Transformation",
      content: "What specific practices or rituals will help you embody these insights?",
      actionSteps: [
        "Daily 5-minute morning intention setting before school",
        "Weekly journaling on academic and social challenges",
        "Monthly progress review with study buddy or mentor",
        "Create seasonal goals aligned with school calendar"
      ]
    }
  ];

  const handleActionToggle = (action: string) => {
    setSelectedActions(prev => 
      prev.includes(action) 
        ? prev.filter(a => a !== action)
        : [...prev, action]
    );
  };

  const handleSetReminders = () => {
    console.log("Setting reminders for:", selectedActions);
    if (customAction) {
      console.log("Custom action:", customAction);
    }
    // Here you would integrate with calendar API
    navigate("/clarity");
  };

  const handleNewConversation = () => {
    navigate("/clarity");
  };

  const handleDownload = () => {
    console.log("Downloading clarity summary...");
    // TODO: Implement download functionality
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-white font-manrope pb-20">
      {/* Header */}
      <div className="flex items-center bg-white p-4 py-2 justify-between border-b border-gray-100">
        <button
          onClick={() => navigate("/clarity")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h2 className="text-lg font-bold text-black">Clarity Summary</h2>
        <div className="relative">
          <ModeDial />
        </div>
      </div>

      {/* Download Button */}
      <div className="px-4 py-2 border-b border-gray-100">
        <Button 
          onClick={handleDownload}
          variant="outline"
          className="ml-auto flex items-center gap-2 border-hyper-coral text-hyper-coral hover:bg-red-50"
        >
          <Download size={16} />
          Download Summary
        </Button>
      </div>

      <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
        <h1 className="text-2xl font-bold text-black mb-6 text-center">
          Your Clarity Journey
        </h1>
        
        <p className="text-gray-600 mb-8 text-center">
          Here's a structured summary of your insights using the C.R.A.F.T framework
        </p>

        {/* CRAFT Summary */}
          <div className="space-y-6 mb-8 pb-32">
            {craftSummary.map((section, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-hyper-coral mb-2">
                  {section.title}
                </h3>
                <p className="text-gray-700 mb-3">{section.content}</p>
                
                {section.actionSteps && (
                  <div>
                    <h4 className="font-medium text-black mb-2">Suggested Action Steps:</h4>
                    <div className="space-y-2">
                      {section.actionSteps.map((action, actionIndex) => (
                        <label key={actionIndex} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedActions.includes(action)}
                            onChange={() => handleActionToggle(action)}
                            className="w-4 h-4 text-hyper-coral rounded focus:ring-hyper-coral accent-hyper-coral"
                          />
                          <span className="text-sm text-gray-700">{action}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

        {/* Custom Action */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-black mb-2">Add Your Own Action or Ritual</h3>
          <Textarea
            placeholder="Write your own action step or ritual you'd like to be reminded about..."
            value={customAction}
            onChange={(e) => setCustomAction(e.target.value)}
            className="w-full border-gray-200 focus:border-hyper-coral"
          />
        </div>

        {/* Set Reminders Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="text-hyper-coral" size={24} />
            <h3 className="text-lg font-semibold text-black">Set Calendar Reminders</h3>
          </div>
          <p className="text-gray-600 mb-4">
            Would you like to set reminders for your selected action steps and rituals?
          </p>
          
          {selectedActions.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-black mb-2">Selected actions:</h4>
              <ul className="space-y-1">
                {selectedActions.map((action, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={16} className="text-hyper-coral" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex gap-3">
            <Button 
              onClick={handleSetReminders}
              disabled={selectedActions.length === 0 && !customAction}
              className="bg-hyper-coral hover:bg-red-600 text-white border-0"
            >
              <Calendar size={16} className="mr-2" />
              Set Reminders
            </Button>
            <Button 
              onClick={handleNewConversation}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Start New Conversation
            </Button>
          </div>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default ClaritySummary;
