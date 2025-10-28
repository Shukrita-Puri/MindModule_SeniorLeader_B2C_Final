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
    <Card className={`border-border bg-card/50 backdrop-blur-sm ${className}`}>
      <CardHeader className="space-y-2">
        <CardTitle className="text-xl font-heading text-foreground leading-tight">
          {title}
        </CardTitle>
        {subtitle && (
          <p className="text-sm text-muted-foreground font-body leading-relaxed">
            {subtitle}
          </p>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};
