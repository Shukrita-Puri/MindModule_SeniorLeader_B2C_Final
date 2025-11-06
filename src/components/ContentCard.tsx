
import { useState } from "react";
import { X, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ContentCardProps {
  type: "article" | "video" | "audio";
  title: string;
  description: string;
  thumbnail?: string;
}

const ContentCard = ({ type, title, description, thumbnail }: ContentCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getTypeIcon = () => {
    switch (type) {
      case "video": return "🎥";
      case "audio": return "🎧";
      default: return "📖";
    }
  };

  return (
    <>
      <div 
        onClick={() => setIsExpanded(true)}
        className="bg-card border border-border rounded-2xl p-3 cursor-pointer shadow-[0_8px_24px_rgba(74,44,42,0.12),0_16px_48px_rgba(74,44,42,0.08)] hover:shadow-[0_16px_40px_rgba(74,44,42,0.16),0_24px_64px_rgba(74,44,42,0.12)] hover:-translate-y-1 transition-all duration-300"
      >
        <div className="flex gap-3">
          {thumbnail && (
            <img 
              src={thumbnail} 
              alt={title}
              className="w-16 h-16 rounded-xl object-cover"
            />
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{getTypeIcon()}</span>
              <span className="text-xs text-gray-500 uppercase font-medium">{type}</span>
            </div>
            <h4 className="font-medium text-gray-800 text-sm mb-1">{title}</h4>
            <p className="text-xs text-gray-600 line-clamp-2">{description}</p>
          </div>
          <ExternalLink size={16} className="text-gray-400" />
        </div>
      </div>

      <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">{getTypeIcon()}</span>
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {thumbnail && (
              <img 
                src={thumbnail} 
                alt={title}
                className="w-full h-64 rounded-xl object-cover"
              />
            )}
            <p className="text-gray-700">{description}</p>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">
                This is where the full content would be displayed - article text, video player, or audio player.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ContentCard;
