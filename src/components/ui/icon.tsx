import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IconProps {
  icon: LucideIcon;
  selected?: boolean;
  className?: string;
  size?: number;
}

export const Icon = ({ icon: IconComponent, selected, className, size = 20 }: IconProps) => {
  return (
    <IconComponent
      size={size}
      strokeWidth={1.5}
      className={cn(
        "transition-colors duration-300",
        selected ? "text-primary" : "text-secondary",
        "hover:text-gold",
        className
      )}
    />
  );
};
