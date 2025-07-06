
import { useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PowerUpSoundsProps {
  onComplete?: () => void;
}

const PowerUpSounds = ({ onComplete }: PowerUpSoundsProps) => {
  const [activeSound, setActiveSound] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);

  const sounds = [
    {
      id: "alpha-brainwave",
      title: "Alpha Brainwave",
      description: "8-12 Hz frequencies for relaxed awareness",
      color: "from-blue-400 to-blue-600"
    },
    {
      id: "sonic-powerup",
      title: "Sonic Power-up",
      description: "Energizing frequencies for focus boost",
      color: "from-yellow-400 to-orange-500"
    },
    {
      id: "grounding-breathwork",
      title: "Grounding Breathwork",
      description: "Guided breathing with nature sounds",
      color: "from-green-400 to-green-600"
    },
    {
      id: "focus-frequency",
      title: "Focus Frequency",
      description: "40 Hz gamma waves for enhanced concentration",
      color: "from-purple-400 to-purple-600"
    }
  ];

  const handleSoundSelect = (soundId: string) => {
    setActiveSound(soundId);
    setTimeLeft(60);
    setIsPlaying(true);
    
    // Simulate 60-second countdown
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsPlaying(false);
          setActiveSound(null);
          onComplete?.();
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleResume = () => {
    setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setActiveSound(null);
    setTimeLeft(60);
  };

  const getActiveSound = () => {
    return sounds.find(s => s.id === activeSound);
  };

  if (activeSound) {
    const sound = getActiveSound();
    return (
      <div className="text-center space-y-6">
        <div className={`w-32 h-32 mx-auto bg-gradient-to-br ${sound?.color} rounded-full flex items-center justify-center animate-pulse`}>
          <div className="w-24 h-24 bg-white/30 rounded-full flex items-center justify-center">
            <div className="w-16 h-16 bg-white/50 rounded-full flex items-center justify-center">
              <div className="text-2xl font-bold text-white">{timeLeft}s</div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-bold text-gray-800">{sound?.title}</h3>
          <p className="text-gray-600 text-sm">{sound?.description}</p>
        </div>

        <div className="flex justify-center gap-3">
          {isPlaying ? (
            <Button
              onClick={handlePause}
              size="lg"
              className="bg-gray-500 hover:bg-gray-600 text-white"
            >
              <Pause size={20} className="mr-2" />
              Pause
            </Button>
          ) : (
            <Button
              onClick={handleResume}
              size="lg"
              className="bg-hyper-coral hover:bg-red-600 text-white"
            >
              <Play size={20} className="mr-2" />
              Resume
            </Button>
          )}
          
          <Button
            onClick={handleReset}
            size="lg"
            variant="outline"
            className="border-gray-300"
          >
            <RotateCcw size={20} className="mr-2" />
            Reset
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-gray-800">Choose Your Power Up</h3>
        <p className="text-gray-600 text-sm">1-minute sound loops for instant focus and energy</p>
      </div>

      <div className="grid gap-3">
        {sounds.map((sound) => (
          <button
            key={sound.id}
            onClick={() => handleSoundSelect(sound.id)}
            className={`w-full p-4 rounded-lg border-2 border-transparent bg-gradient-to-r ${sound.color} text-white hover:scale-105 transition-transform duration-200`}
          >
            <div className="flex items-center justify-between">
              <div className="text-left">
                <div className="font-medium">{sound.title}</div>
                <div className="text-sm opacity-90">{sound.description}</div>
              </div>
              <Play size={20} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PowerUpSounds;
