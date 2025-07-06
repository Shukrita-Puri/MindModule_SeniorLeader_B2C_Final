
import { BookOpen, Calendar, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ContentRecommendation {
  id: string;
  type: "article" | "podcast" | "video" | "framework";
  title: string;
  description: string;
  thumbnail?: string;
  duration?: string;
  author?: string;
}

interface RecommendationCardProps {
  recommendation: ContentRecommendation;
  onAddToLibrary: (rec: ContentRecommendation) => void;
  onSetReminder: (rec: ContentRecommendation) => void;
  onOpenFullPage: (rec: ContentRecommendation) => void;
}

const RecommendationCard = ({
  recommendation,
  onAddToLibrary,
  onSetReminder,
  onOpenFullPage
}: RecommendationCardProps) => {
  const getContentIcon = (type: string) => {
    switch (type) {
      case "podcast": return "🎧";
      case "video": return "🎥";
      case "framework": return "📊";
      default: return "📖";
    }
  };

  return (
    <Card className="border border-gray-200 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-lg">
            {getContentIcon(recommendation.type)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h5 className="font-medium text-gray-800 text-sm">{recommendation.title}</h5>
              <Badge variant="outline" className="text-xs">
                {recommendation.type}
              </Badge>
            </div>
            <p className="text-xs text-gray-600 mb-2">{recommendation.description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => onOpenFullPage(recommendation)}
                size="sm"
                variant="outline"
                className="text-xs h-6 px-2"
              >
                <BookOpen size={12} className="mr-1" />
                Read Full
              </Button>
              <Button
                onClick={() => onAddToLibrary(recommendation)}
                size="sm"
                variant="outline"
                className="text-xs h-6 px-2"
              >
                <Plus size={12} className="mr-1" />
                Save
              </Button>
              <Button
                onClick={() => onSetReminder(recommendation)}
                size="sm"
                variant="outline"
                className="text-xs h-6 px-2"
              >
                <Calendar size={12} className="mr-1" />
                Remind
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RecommendationCard;
