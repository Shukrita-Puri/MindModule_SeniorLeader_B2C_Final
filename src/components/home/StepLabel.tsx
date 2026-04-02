/**
 * StepLabel — Renders a section step marker: letter + title — subtitle
 * Uses font-headline italic for the letter (matching Outer Readiness theme phrase)
 */

interface StepLabelProps {
  letter: string;
  title: string;
  subtitle: string;
}

const StepLabel = ({ letter, title, subtitle }: StepLabelProps) => (
  <div className="flex items-center gap-1">
    <span className="text-lg font-headline italic font-bold text-primary leading-none mr-3">
      {letter}
    </span>
    <span className="text-xs font-medium tracking-widest uppercase text-muted-foreground font-body">
      {title}:
    </span>
    <span className="text-xs tracking-widest uppercase text-muted-foreground/60 font-body">
      {subtitle}
    </span>
  </div>
);

export default StepLabel;
