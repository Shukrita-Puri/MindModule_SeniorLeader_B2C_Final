import { cn } from "@/lib/utils";

interface WaveformVisualizerProps {
  isActive: boolean;
  color: "primary" | "accent";
  className?: string;
}

const WaveformVisualizer = ({ isActive, color, className }: WaveformVisualizerProps) => {
  const colorClasses = {
    primary: "bg-primary",
    accent: "bg-accent"
  };

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-300",
            colorClasses[color],
            isActive ? "animate-waveform" : "h-2 opacity-30"
          )}
          style={{
            animationDelay: `${i * 0.05}s`,
            height: isActive ? `${Math.sin(i * 0.5) * 16 + 24}px` : '8px'
          }}
        />
      ))}
    </div>
  );
};

export default WaveformVisualizer;
