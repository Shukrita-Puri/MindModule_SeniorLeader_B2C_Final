
import { useState } from "react";
import { ArrowLeft, RefreshCw, Wifi, Battery, Signal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SmartNudge from "@/components/SmartNudge";

const NudgeSimulator = () => {
  const navigate = useNavigate();
  const [currentNudgeIndex, setCurrentNudgeIndex] = useState(0);

  const mockNudges = [
    {
      id: "1",
      title: "Pre-Meeting Preparation",
      message: "You've been tense before board meetings. Want to do a 3-min visualization?",
      type: "breathwork" as const,
      context: "Based on wearable data & calendar: Board meeting in 15 minutes",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "2", 
      title: "Weekly Reflection",
      message: "It's the end of the week. 1 insight, 1 win, 1 tweak?",
      type: "clarity" as const,
      context: "Friday evening micro-reflection prompt",
      urgency: "low" as const,
      timestamp: new Date()
    },
    {
      id: "3",
      title: "Energy Peak Alert", 
      message: "Your productivity window is starting. Ready to tackle that important presentation prep?",
      type: "futurescape" as const,
      context: "Based on clarity patterns & wearable data",
      urgency: "low" as const,
      timestamp: new Date()
    },
    {
      id: "4",
      title: "Role Reminder",
      message: "You said you want to show up as a visionary today. Want to simulate a conversation first?",
      type: "scenario-lab" as const,
      context: "From your morning intention setting",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "5",
      title: "Grounding Moment",
      message: "Your social feed was intense today. Want to ground for 5 min in Anchor Mode?",
      type: "sos" as const,
      context: "Based on digital consumption patterns",
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "6",
      title: "Pattern Recognition",
      message: "I've noticed your reflections have gotten more focused around legacy this month. Want to explore this further?",
      type: "clarity" as const,
      context: "Monthly pattern analysis from conversations",
      urgency: "low" as const,
      timestamp: new Date()
    },
    {
      id: "7",
      title: "Vision Alignment",
      message: "This meeting with your investor is key to your 2030 plan. Would you like to simulate that scenario or revisit your vision board first?",
      type: "scenario-lab" as const,
      context: "Connected to Futurescape goals & calendar",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "8",
      title: "Blind Spot Alert",
      message: "You've used language that hints at self-doubt three times this week. Want to unpack what's underneath that?",
      type: "mentor" as const,
      context: "Pattern detected across emails & conversations",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "9",
      title: "Cross-Domain Connection",
      message: "Your recent reflection on leadership tension echoes a principle from the Tao Te Ching we discussed last month. Want to revisit it?",
      type: "clarity" as const,
      context: "Connected insights from previous conversations",
      urgency: "low" as const,
      timestamp: new Date()
    },
    {
      id: "10",
      title: "Multi-Modal Recovery",
      message: "Based on your stress signals, would you like to enter Anchor Mode, then do a 2-min reflection in Illuminate, and add a note to your Vault?",
      type: "sos" as const,
      context: "Wearable stress indicators + email tone analysis",
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "11",
      title: "Physiological Optimization",
      message: "You've had high cortisol patterns lately. Would you like a Yin ritual or breathwork moment?",
      type: "breathwork" as const,
      context: "Wearable data + sleep patterns analysis",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "12",
      title: "Negative Thought Review",
      message: "Your social feed was intense today. Do you want to reflect and review any negative thoughts that might be lingering?",
      type: "clarity" as const,
      context: "Digital consumption analysis + emotional patterns",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "13",
      title: "Email Tone Shift",
      message: "Your emails have been more direct than usual this week. Want to explore what might be driving this shift?",
      type: "clarity" as const,
      context: "Email tone analysis & communication patterns",
      urgency: "low" as const,
      timestamp: new Date()
    },
    {
      id: "14",
      title: "Calendar Load Management",
      message: "You have 7 back-to-back meetings today. Want to schedule micro-breaks with breathing exercises?",
      type: "breathwork" as const,
      context: "Calendar density analysis",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "15",
      title: "Decision Pattern Alert",
      message: "You've been delaying 3 important decisions this week. Want to explore what's creating the hesitation?",
      type: "mentor" as const,
      context: "Task completion patterns & decision velocity tracking",
      urgency: "medium" as const,
      timestamp: new Date()
    }
  ];

  const currentNudge = mockNudges[currentNudgeIndex];

  const nextNudge = () => {
    setCurrentNudgeIndex((prev) => (prev + 1) % mockNudges.length);
  };

  const handleNudgeAction = () => {
    console.log(`Nudge ${currentNudge.id} acted upon`);
  };

  const handleNudgeDismiss = () => {
    console.log(`Nudge ${currentNudge.id} dismissed`);
    nextNudge();
  };

  const currentTime = new Date();
  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-900 font-manrope">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => navigate("/nudge-settings")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <h1 className="text-xl font-bold text-white uppercase">SMART NUDGE PREVIEW</h1>
        <Button onClick={nextNudge} variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
          <RefreshCw size={16} className="mr-2" />
          Next ({currentNudgeIndex + 1}/{mockNudges.length})
        </Button>
      </div>

      {/* Phone Mockup - Full Screen */}
      <div className="flex-1 relative">
        {/* Phone Lock Screen Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-blue-900">
          {/* Subtle overlay pattern */}
          <div className="absolute inset-0 opacity-20 bg-gradient-to-r from-transparent via-white to-transparent"></div>
        </div>

        {/* Status Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-2 text-white text-sm font-medium">
          <div className="flex items-center gap-1">
            <Signal size={16} />
            <Wifi size={16} />
          </div>
          <div className="text-center">
            <div className="text-lg font-light">{timeString}</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs">85%</span>
            <Battery size={16} />
          </div>
        </div>

        {/* Time Display - Large */}
        <div className="absolute top-20 left-0 right-0 text-center text-white">
          <div className="text-7xl font-ultralight tracking-wider mb-2">
            {timeString}
          </div>
          <div className="text-xl font-light opacity-80">
            {dateString}
          </div>
        </div>

        {/* Smart Nudge Notification */}
        <div className="absolute top-72 left-6 right-6">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
            <SmartNudge
              {...currentNudge}
              onAction={handleNudgeAction}
              onDismiss={handleNudgeDismiss}
            />
          </div>
        </div>

        {/* Lock Screen Bottom Indicator */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="w-32 h-1 bg-white/40 rounded-full"></div>
        </div>

        {/* Swipe Up Indicator */}
        <div className="absolute bottom-20 left-0 right-0 text-center">
          <div className="text-white/60 text-sm animate-pulse">
            Swipe up to unlock
          </div>
        </div>
      </div>
    </div>
  );
};

export default NudgeSimulator;
