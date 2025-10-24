import { cn } from "@/lib/utils";

interface WaveformDividerProps {
  aiSpeaking: boolean;
  userSpeaking: boolean;
  className?: string;
}

const WaveformDivider = ({ aiSpeaking, userSpeaking, className }: WaveformDividerProps) => {
  const isActive = aiSpeaking || userSpeaking;
  const activeColor = aiSpeaking ? "primary" : "accent";
  
  return (
    <div className={cn(
      "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex items-center justify-center transition-all duration-500",
      className
    )}>
      {isActive ? (
        // Animated waveform
        <div className="flex items-center gap-1">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1 rounded-full transition-all duration-300",
                activeColor === "primary" ? "bg-primary" : "bg-accent"
              )}
              style={{
                animationDelay: `${i * 0.03}s`,
                height: isActive ? `${Math.sin(i * 0.4) * 15 + 20}px` : '3px',
                animation: isActive ? 'waveform 1s ease-in-out infinite' : 'none'
              }}
            />
          ))}
        </div>
      ) : (
        // Static line
        <div className="w-[70vw] h-[2px] bg-gradient-to-r from-transparent via-border to-transparent opacity-40" />
      )}
    </div>
  );
};

export default WaveformDivider;
