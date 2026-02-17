import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuestionCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export const QuestionCard = ({
  title,
  subtitle,
  children,
  className = "",
}: QuestionCardProps) => {
  return (
    <Card className={`border-black/[0.08] bg-white/65 backdrop-blur-[30px] backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] ${className}`}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-headline text-foreground leading-tight tracking-tight">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-sm text-muted-foreground font-subheadline italic leading-relaxed">
            {subtitle}
          </p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};
