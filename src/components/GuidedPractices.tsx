
import { useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const GuidedPractices = () => {
  const [selectedPractice, setSelectedPractice] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [timer, setTimer] = useState(0);

  const practices = [
    {
      id: "breathwork",
      title: "Emergency Breathwork",
      duration: 180, // 3 minutes
      icon: "🫁",
      description: "4-7-8 breathing technique for instant calm"
    },
    {
      id: "tapping",
      title: "EFT Tapping",
      duration: 300, // 5 minutes
      icon: "👆",
      description: "Emotional Freedom Technique for anxiety relief"
    },
    {
      id: "visualization",
      title: "Safe Space Visualization",
      duration: 240, // 4 minutes
      icon: "🌅",
      description: "Mental retreat to your safe place"
    },
    {
      id: "grounding",
      title: "5-4-3-2-1 Grounding",
      duration: 120, // 2 minutes
      icon: "🌱",
      description: "Sensory grounding technique"
    }
  ];

  const handlePracticeSelect = (practiceId: string) => {
    setSelectedPractice(practiceId);
    setIsActive(false);
    setTimer(0);
  };

  const handlePlayPause = () => {
    setIsActive(!isActive);
  };

  const handleReset = () => {
    setIsActive(false);
    setTimer(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedPracticeData = practices.find(p => p.id === selectedPractice);

  if (!selectedPractice) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-800 text-center">Choose a Guided Practice</h3>
        <div className="grid grid-cols-1 gap-3">
          {practices.map((practice) => (
            <button
              key={practice.id}
              onClick={() => handlePracticeSelect(practice.id)}
              className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{practice.icon}</span>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-800">{practice.title}</h4>
                  <p className="text-sm text-gray-600">{practice.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.floor(practice.duration / 60)} minutes
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <button
          onClick={() => setSelectedPractice(null)}
          className="text-sm text-gray-500 hover:text-gray-700 mb-2"
        >
          ← Choose Different Practice
        </button>
        <h3 className="text-lg font-bold text-gray-800">{selectedPracticeData?.title}</h3>
        <p className="text-gray-600 text-sm">{selectedPracticeData?.description}</p>
      </div>

      {/* Timer Display */}
      <div className="text-center">
        <div className="text-3xl font-bold text-gray-800 mb-2">
          {formatTime(timer)}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
            style={{ 
              width: `${(timer / (selectedPracticeData?.duration || 180)) * 100}%` 
            }}
          ></div>
        </div>
      </div>

      {/* Practice Icon */}
      <div className="text-center">
        <div className="w-24 h-24 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-4xl">{selectedPracticeData?.icon}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-2">
        <Button
          onClick={handlePlayPause}
          size="sm"
          className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
        >
          {isActive ? <Pause size={16} /> : <Play size={16} />}
          {isActive ? 'Pause' : 'Start'}
        </Button>
        
        <Button
          onClick={handleReset}
          size="sm"
          variant="outline"
          className="border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <RotateCcw size={16} />
          Reset
        </Button>
      </div>
    </div>
  );
};

export default GuidedPractices;
