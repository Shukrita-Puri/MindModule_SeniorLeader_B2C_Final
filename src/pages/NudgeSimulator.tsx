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
      title: "Advanced Physics Exam",
      message: "Advanced Physics Exam in 2 days. Shift into deep focus mode to master the material and your anxiety.",
      type: "recalibrate" as const,
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "2", 
      title: "Oxford College Interview",
      message: "Oxford College Interview in 4 days. Practice with a simulated Oxford admissions assessor to gain an edge.",
      type: "practice" as const,
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "3",
      title: "Resilience Training", 
      message: "Feeling overwhelmed? Tap into resilience techniques used by Navy SEALs and Ancient Yogis to stay calm under pressure.",
      type: "recalibrate" as const,
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "4",
      title: "Interview Practice",
      message: "Harvard interview next week. Want to practice with Social Intelligence first?",
      type: "practice" as const,
      context: "From your college application timeline",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "5",
      title: "Social Media Break",
      message: "You've been scrolling for 2 hours. Time for a 5-min recalibrate?",
      type: "sos" as const,
      context: "Based on screen time patterns",
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "6",
      title: "College Prep Alignment",
      message: "Princeton application due soon. Ready to practice your personal statement pitch?",
      type: "practice" as const,
      context: "Connected to college application timeline",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "7",
      title: "Exam Stress Recovery",
      message: "Midterm stress levels high. Try a breathing session to recalibrate?",
      type: "sos" as const,
      context: "Academic calendar + stress indicators",
      urgency: "high" as const,
      timestamp: new Date()
    },
    {
      id: "8",
      title: "Sleep Optimization",
      message: "You've been staying up late studying. Want to try some breathwork to improve sleep quality?",
      type: "recalibrate" as const,
      context: "Sleep patterns + academic performance data",
      urgency: "medium" as const,
      timestamp: new Date()
    },
    {
      id: "9",
      title: "Overcommitment Alert",
      message: "You have debate practice, SAT prep, and volunteer work today. Want micro-breaks with breathing?",
      type: "recalibrate" as const,
      context: "Schedule density analysis",
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
    // Navigate to appropriate page based on nudge type
    switch (currentNudge.type) {
      case 'recalibrate':
        navigate('/recalibrate');
        break;
      case 'practice':
        navigate('/practice');
        break;
      case 'sos':
        navigate('/recalibrate');
        break;
      default:
        navigate('/executive-home');
    }
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
