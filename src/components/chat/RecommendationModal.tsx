
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ContentRecommendation {
  id: string;
  type: "article" | "podcast" | "video" | "framework";
  title: string;
  description: string;
  thumbnail?: string;
  duration?: string;
  author?: string;
}

interface RecommendationModalProps {
  recommendation: ContentRecommendation | null;
  onClose: () => void;
  onAddToLibrary: (rec: ContentRecommendation) => void;
  onSetReminder: (rec: ContentRecommendation) => void;
}

const RecommendationModal = ({
  recommendation,
  onClose,
  onAddToLibrary,
  onSetReminder
}: RecommendationModalProps) => {
  if (!recommendation) return null;

  const getContentIcon = (type: string) => {
    switch (type) {
      case "podcast": return "🎧";
      case "video": return "🎥";
      case "framework": return "📊";
      default: return "📖";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <CardContent className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">{getContentIcon(recommendation.type)}</div>
              <div>
                <h3 className="font-bold text-lg">{recommendation.title}</h3>
                <p className="text-sm text-gray-600">{recommendation.author}</p>
              </div>
            </div>
            <Button
              onClick={onClose}
              variant="ghost"
              size="sm"
            >
              ✕
            </Button>
          </div>
          
          {recommendation.thumbnail && (
            <img 
              src={recommendation.thumbnail} 
              alt={recommendation.title}
              className="w-full h-48 object-cover rounded-lg mb-4"
            />
          )}
          
          <p className="text-gray-700 mb-6">{recommendation.description}</p>
          
          <div className="flex gap-3">
            <Button
              onClick={() => onAddToLibrary(recommendation)}
              className="bg-hyper-coral hover:bg-red-600 text-white"
            >
              Add to Library
            </Button>
            <Button
              onClick={() => onSetReminder(recommendation)}
              variant="outline"
              className="border-hyper-coral text-hyper-coral"
            >
              Set Reminder
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RecommendationModal;
