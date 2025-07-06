
import { File } from "lucide-react";
import RecommendationCard from "./RecommendationCard";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface ContentRecommendation {
  id: string;
  type: "article" | "podcast" | "video" | "framework";
  title: string;
  description: string;
  thumbnail?: string;
  duration?: string;
  author?: string;
}

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  recommendations?: ContentRecommendation[];
  attachments?: FileAttachment[];
}

interface MessageListProps {
  messages: Message[];
  initialMessage?: string;
  showRecommendations: boolean;
  onAddToLibrary: (rec: ContentRecommendation) => void;
  onSetReminder: (rec: ContentRecommendation) => void;
  onOpenFullPage: (rec: ContentRecommendation) => void;
}

const MessageList = ({
  messages,
  initialMessage,
  showRecommendations,
  onAddToLibrary,
  onSetReminder,
  onOpenFullPage
}: MessageListProps) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (messages.length === 0) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-background">
      {initialMessage && messages.length === 0 && (
        <div className="flex justify-start">
          <div className="max-w-[70%] p-3 rounded-lg bg-muted text-foreground">
            <p className="text-sm">{initialMessage}</p>
          </div>
        </div>
      )}
      
      {messages.map((message) => (
        <div key={message.id} className="space-y-3">
          <div className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] p-3 rounded-lg ${
              message.sender === 'user' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted text-foreground'
            }`}>
              <p className="text-sm">{message.text}</p>
              
              {message.attachments && message.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center gap-2 text-xs bg-white/20 rounded p-2">
                      <File size={12} />
                      <span className="truncate">{attachment.name}</span>
                      <span>({formatFileSize(attachment.size)})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showRecommendations && message.recommendations && message.recommendations.length > 0 && (
            <div className="ml-4 space-y-2">
              <h4 className="text-sm font-medium text-foreground">Recommended Resources:</h4>
              <div className="space-y-2">
                {message.recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.id}
                    recommendation={rec}
                    onAddToLibrary={onAddToLibrary}
                    onSetReminder={onSetReminder}
                    onOpenFullPage={onOpenFullPage}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default MessageList;
