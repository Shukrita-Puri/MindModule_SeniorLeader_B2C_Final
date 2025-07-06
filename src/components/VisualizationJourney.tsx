import { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const VisualizationJourney = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timer, setTimer] = useState(0);

  const visualizationSteps = [
    {
      title: "Setting the Foundation",
      content: "Find a comfortable position and close your eyes. Take three deep breaths, allowing your body to relax completely.",
      duration: 30
    },
    {
      title: "Envisioning Your Future Self",
      content: "Imagine yourself one year from now, having achieved your vision. What do you see? How do you feel?",
      duration: 60
    },
    {
      title: "Exploring the Journey",
      content: "Now step back and see the path that led you there. What steps did you take? What challenges did you overcome?",
      duration: 45
    },
    {
      title: "Embodying Success",
      content: "Feel the confidence and satisfaction of your achievements. Let this feeling fill your entire being.",
      duration: 30
    },
    {
      title: "Bringing Insights Back",
      content: "Slowly bring your awareness back to the present. What insights will you carry forward?",
      duration: 25
    }
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying && timer < visualizationSteps[currentStep].duration) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else if (timer >= visualizationSteps[currentStep].duration) {
      setIsPlaying(false);
      if (currentStep < visualizationSteps.length - 1) {
        setTimeout(() => {
          setCurrentStep(prev => prev + 1);
          setTimer(0);
        }, 2000);
      }
    }
    return () => clearInterval(interval);
  }, [isPlaying, timer, currentStep]);

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
    setTimer(0);
  };

  const handleStepSelect = (stepIndex: number) => {
    setCurrentStep(stepIndex);
    setTimer(0);
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-lg">
      <div className="text-center mb-6">
        <h4 className="text-lg font-bold text-gray-800 mb-2">Guided Visualization Journey</h4>
        <p className="text-gray-600 text-sm">A 5-step journey to connect with your future self</p>
      </div>

      {/* Progress Bar - Mobile optimized */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Step {currentStep + 1} of {visualizationSteps.length}</span>
          <span>{formatTime(timer)} / {formatTime(visualizationSteps[currentStep].duration)}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-amber-500 h-2 rounded-full transition-all duration-1000"
            style={{ 
              width: `${(timer / visualizationSteps[currentStep].duration) * 100}%` 
            }}
          ></div>
        </div>
      </div>

      {/* Current Step - Mobile optimized */}
      <div className="text-center mb-6 min-h-[100px]">
        <h5 className="text-lg font-semibold text-gray-800 mb-3">
          {visualizationSteps[currentStep].title}
        </h5>
        <p className="text-gray-700 text-sm leading-relaxed">
          {visualizationSteps[currentStep].content}
        </p>
      </div>

      {/* Controls - Mobile optimized */}
      <div className="flex justify-center gap-2 mb-6">
        <Button
          onClick={handlePlayPause}
          size="sm"
          className="bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-2"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        
        <Button
          onClick={handleReset}
          size="sm"
          variant="outline"
          className="border-amber-500 text-amber-600 hover:bg-amber-50 flex items-center gap-2"
        >
          <RotateCcw size={16} />
          Reset
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <Volume2 size={16} />
          Audio
        </Button>
      </div>

      {/* Step Navigation - Mobile optimized */}
      <div className="flex justify-center gap-2">
        {visualizationSteps.map((_, index) => (
          <button
            key={index}
            onClick={() => handleStepSelect(index)}
            className={`w-8 h-8 rounded-full border-2 transition-all text-sm ${
              index === currentStep
                ? 'bg-amber-500 border-amber-500 text-white'
                : index < currentStep
                ? 'bg-amber-100 border-amber-300 text-amber-600'
                : 'bg-gray-100 border-gray-300 text-gray-500'
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>

      {currentStep === visualizationSteps.length - 1 && timer >= visualizationSteps[currentStep].duration && (
        <div className="mt-6 p-4 bg-amber-50 rounded-lg text-center">
          <p className="text-amber-800 font-medium mb-2 text-sm">🌟 Journey Complete!</p>
          <p className="text-amber-700 text-sm">Take a moment to reflect on your insights before continuing.</p>
        </div>
      )}
    </div>
  );
};

export default VisualizationJourney;
