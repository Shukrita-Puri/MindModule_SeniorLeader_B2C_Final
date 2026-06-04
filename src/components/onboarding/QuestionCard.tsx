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
    <Card className={`border-[#cfc7b8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-sm font-body uppercase tracking-widest text-foreground leading-snug">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-sm text-muted-foreground font-body italic leading-relaxed">
            {subtitle}
          </p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};
