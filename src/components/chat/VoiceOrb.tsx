
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceOrbProps {
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  participantName: string;
  isTextMode: boolean;
  onTextModeToggle: () => void;
}

const VoiceOrb = ({
  isVoiceActive,
  onVoiceToggle,
  participantName,
  isTextMode,
  onTextModeToggle
}: VoiceOrbProps) => {
  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-white p-8">
      <div className="text-center">
        <div className={`w-32 h-32 rounded-full mx-auto mb-6 flex items-center justify-center transition-all duration-300 ${
          isVoiceActive 
            ? 'bg-gradient-to-br from-hyper-coral to-red-500 animate-pulse shadow-lg' 
            : 'bg-gradient-to-br from-gray-200 to-gray-300 hover:from-gray-300 hover:to-gray-400'
        }`}>
          <button
            onClick={onVoiceToggle}
            className="w-full h-full rounded-full flex items-center justify-center text-white"
          >
            {isVoiceActive ? <MicOff size={32} /> : <Mic size={32} />}
          </button>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">
          {isVoiceActive ? "Listening..." : "Tap to speak"}
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Voice-first conversation with {participantName}
        </p>
        <Button
          onClick={onTextModeToggle}
          variant="outline"
          size="sm"
          className="text-gray-600"
        >
          {isTextMode ? "Voice Mode" : "Switch to Text"}
        </Button>
      </div>
    </div>
  );
};

export default VoiceOrb;
