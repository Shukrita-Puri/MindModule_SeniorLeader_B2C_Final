import { cn } from '@/lib/utils';

interface CoachHeroBackgroundProps {
  className?: string;
}

const CoachHeroBackground = ({ className }: CoachHeroBackgroundProps) => {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      {/* Atmospheric gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-saffron/5 via-taupe/3 to-transparent" />
      
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,140,66,0.08)_0%,transparent_60%)]" />
      
      {/* Large transparent text - positioned behind content */}
      <div className="absolute inset-0 flex flex-col items-center justify-start pt-20 select-none">
        <span 
          className={cn(
            "font-headline font-extrabold uppercase tracking-[-0.02em] leading-[0.85]",
            "text-transparent bg-clip-text",
            "[-webkit-text-stroke:1px_rgba(155,139,126,0.12)]",
            "text-[18vw] sm:text-[15vw] md:text-[12vw]"
          )}
          style={{
            WebkitTextStroke: '1px rgba(155, 139, 126, 0.12)',
          }}
        >
          SELF
        </span>
        <span 
          className={cn(
            "font-headline font-extrabold uppercase tracking-[-0.02em] leading-[0.85]",
            "text-transparent bg-clip-text",
            "[-webkit-text-stroke:1px_rgba(155,139,126,0.12)]",
            "text-[18vw] sm:text-[15vw] md:text-[12vw]",
            "-mt-2 sm:-mt-4"
          )}
          style={{
            WebkitTextStroke: '1px rgba(155, 139, 126, 0.12)',
          }}
        >
          MASTERY
        </span>
        <span 
          className={cn(
            "font-headline font-extrabold uppercase tracking-[-0.02em] leading-[0.85]",
            "text-transparent bg-clip-text",
            "[-webkit-text-stroke:1px_rgba(255,140,66,0.15)]",
            "text-[18vw] sm:text-[15vw] md:text-[12vw]",
            "-mt-2 sm:-mt-4"
          )}
          style={{
            WebkitTextStroke: '1px rgba(255, 140, 66, 0.15)',
          }}
        >
          COACH
        </span>
      </div>
      
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
};

export default CoachHeroBackground;
