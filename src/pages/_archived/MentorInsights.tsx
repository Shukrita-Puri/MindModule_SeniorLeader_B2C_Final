
import { useState } from "react";
import { ArrowLeft, Download, Calendar, BookOpen, Star, Target, Lightbulb } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import MainNavigation from "@/components/_archived/MainNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const MentorInsights = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { messages = [], stakeholderName = "Mentor", sessionFeedback } = location.state || {};
  
  const [notes, setNotes] = useState("");

  const keyInsights = [
    "Leadership requires authentic vulnerability in uncertain times",
    "Strategic thinking must balance long-term vision with short-term execution",
    "Building trust through consistent communication is non-negotiable",
    "Decision-making frameworks prevent analysis paralysis"
  ];

  const actionableWisdom = [
    {
      category: "Leadership Philosophy",
      insight: "Lead with questions, not answers",
      application: "Ask 'What would success look like?' before proposing solutions"
    },
    {
      category: "Strategic Mindset", 
      insight: "Think in systems, not just problems",
      application: "Map stakeholder impact before making decisions"
    },
    {
      category: "Communication",
      insight: "Clarity creates confidence",
      application: "Use the 3-point rule: never communicate more than 3 key points at once"
    }
  ];

  const handleDownload = () => {
    const content = `
MENTOR INSIGHTS SUMMARY
Mentor: ${stakeholderName}
Date: ${new Date().toLocaleDateString()}

KEY INSIGHTS:
${keyInsights.map(insight => `• ${insight}`).join('\n')}

ACTIONABLE WISDOM:
${actionableWisdom.map(item => 
  `${item.category}: ${item.insight}\nApplication: ${item.application}`
).join('\n\n')}

YOUR NOTES:
${notes}

SESSION FEEDBACK:
${sessionFeedback ? JSON.stringify(sessionFeedback, null, 2) : 'No feedback provided'}
    `;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mentor-insights-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSetReminder = () => {
    alert("Reminder set to review mentor insights in 1 week");
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50 font-sans pb-20">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        <button
          onClick={() => navigate("/mentor")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700" />
        </button>
        <h1 className="text-lg font-bold text-black">MENTOR INSIGHTS</h1>
        <div className="w-10"></div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* Session Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="text-hyper-coral" size={20} />
              Session Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm"><strong>Mentor:</strong> {stakeholderName}</p>
              <p className="text-sm"><strong>Duration:</strong> {messages.length} exchanges</p>
              <p className="text-sm"><strong>Focus:</strong> Strategic leadership guidance</p>
            </div>
          </CardContent>
        </Card>

        {/* Key Insights */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lightbulb className="text-hyper-coral" size={20} />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {keyInsights.map((insight, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-2 h-2 bg-hyper-coral rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-gray-800">{insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Actionable Wisdom */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="text-hyper-coral" size={20} />
              Actionable Wisdom
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {actionableWisdom.map((item, index) => (
                <div key={index} className="border-l-4 border-hyper-coral pl-4 py-2">
                  <h4 className="font-semibold text-gray-800 mb-1">{item.category}</h4>
                  <p className="text-sm text-gray-700 mb-2">{item.insight}</p>
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    <strong>Application:</strong> {item.application}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Your Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="text-hyper-coral" size={20} />
              Your Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Capture your thoughts, reflections, and key takeaways from this mentoring session..."
              className="min-h-[120px] border-gray-300 focus:border-hyper-coral"
            />
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <Button 
            onClick={handleSetReminder}
            className="bg-hyper-coral hover:bg-red-600 text-white flex items-center justify-center gap-2"
          >
            <Calendar size={16} />
            Set Review Reminder
          </Button>
          
          <Button 
            onClick={handleDownload}
            variant="outline"
            className="border-hyper-coral text-hyper-coral hover:bg-hyper-coral hover:text-white flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Download Insights
          </Button>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default MentorInsights;
