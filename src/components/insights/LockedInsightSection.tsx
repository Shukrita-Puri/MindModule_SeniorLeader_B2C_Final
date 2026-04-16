import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface LockedInsightSectionProps {
  title: string;
  description: string;
  previewText?: string;
  features?: string[];
}

export function LockedInsightSection({
  title,
  description,
  previewText,
  features = [],
}: LockedInsightSectionProps) {
  const navigate = useNavigate();

  return (
    <div className="relative rounded-2xl border border-border/50 bg-muted/30 overflow-hidden">
      {/* PRO Badge */}
      <div className="absolute top-3 right-3 z-10">
        <span className="flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
          <Sparkles size={10} />
          PRO
        </span>
      </div>

      <div className="p-5 space-y-4">
        {/* Title */}
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Lock size={14} className="text-muted-foreground" />
            {title}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>

        {/* Blurred Preview */}
        {previewText && (
          <div className="relative">
            <div className="blur-sm select-none pointer-events-none">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {previewText}
              </p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                size="sm"
                variant="outline"
                className="bg-background/90 backdrop-blur-sm"
                onClick={() => navigate('/onboarding/payment?source=insights-upgrade', { state: { source: 'insights_upgrade' } })}
              >
                Unlock with Pro
              </Button>
            </div>
          </div>
        )}

        {/* Feature List */}
        {features.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
              Unlocked with Pro:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {features.map((f, i) => (
                <span
                  key={i}
                  className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
