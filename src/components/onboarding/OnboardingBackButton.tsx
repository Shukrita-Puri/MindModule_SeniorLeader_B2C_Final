import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface OnboardingBackButtonProps {
  backPath: string;
}

export const OnboardingBackButton = ({ backPath }: OnboardingBackButtonProps) => {
  const navigate = useNavigate();

  return (
    <div className="mb-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(backPath)}
        className="text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back
      </Button>
    </div>
  );
};
