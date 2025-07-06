
import { useState, useRef } from "react";
import VoiceOrb from "./chat/VoiceOrb";
import MessageList from "./chat/MessageList";
import MessageInput from "./chat/MessageInput";
import FileAttachments from "./chat/FileAttachments";
import RecommendationModal from "./chat/RecommendationModal";

interface Message {
  id: string;
  text: string;
  sender: "user" | "ai";
  timestamp: Date;
  recommendations?: ContentRecommendation[];
  attachments?: FileAttachment[];
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

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface VoiceFirstChatProps {
  title: string;
  subtitle: string;
  participantName: string;
  initialMessage?: string;
  onSendMessage: (message: string, attachments?: FileAttachment[]) => void;
  onEndSession: () => void;
  messages: Message[];
  isVoiceActive: boolean;
  onVoiceToggle: () => void;
  showRecommendations?: boolean;
  showOrb?: boolean;
  hideContextInfo?: boolean;
}

const VoiceFirstChat = ({
  title,
  subtitle,
  participantName,
  initialMessage,
  onSendMessage,
  onEndSession,
  messages,
  isVoiceActive,
  onVoiceToggle,
  showRecommendations = false,
  showOrb = true,
  hideContextInfo = false
}: VoiceFirstChatProps) => {
  const [inputMessage, setInputMessage] = useState("");
  const [isTextMode, setIsTextMode] = useState(true);
  const [selectedRecommendation, setSelectedRecommendation] = useState<ContentRecommendation | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMessage.trim() || attachments.length > 0) {
      onSendMessage(inputMessage, attachments);
      setInputMessage("");
      setAttachments([]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments: FileAttachment[] = files.map(file => ({
      id: Date.now().toString() + Math.random(),
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file)
    }));
    
    setAttachments(prev => [...prev, ...newAttachments]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleAddToLibrary = (recommendation: ContentRecommendation) => {
    console.log("Adding to library:", recommendation.title);
    // TODO: Implement add to library functionality
  };

  const handleSetReminder = (recommendation: ContentRecommendation) => {
    console.log("Setting reminder for:", recommendation.title);
    // TODO: Implement reminder functionality
  };

  const handleOpenFullPage = (recommendation: ContentRecommendation) => {
    setSelectedRecommendation(recommendation);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header - only show if not hiding context info */}
      {!hideContextInfo && (
        <div className="px-4 py-3 border-b border-gray-100 bg-white">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <p className="text-sm text-gray-600">{subtitle}</p>
          <div className="text-xs text-gray-500 mt-1">
            Conversation with: {participantName}
          </div>
        </div>
      )}

      {/* Orb Visual for Voice-First Experience */}
      {showOrb && (
        <VoiceOrb
          isVoiceActive={isVoiceActive}
          onVoiceToggle={onVoiceToggle}
          participantName={participantName}
          isTextMode={isTextMode}
          onTextModeToggle={() => setIsTextMode(!isTextMode)}
        />
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        initialMessage={initialMessage}
        showRecommendations={showRecommendations}
        onAddToLibrary={handleAddToLibrary}
        onSetReminder={handleSetReminder}
        onOpenFullPage={handleOpenFullPage}
      />

      {/* File Attachment Area */}
      <FileAttachments
        attachments={attachments}
        onRemove={removeAttachment}
      />

      {/* Input Area */}
      <MessageInput
        inputMessage={inputMessage}
        setInputMessage={setInputMessage}
        onSendMessage={handleSendMessage}
        isTextMode={isTextMode}
        attachments={attachments}
        onFileUpload={handleFileUpload}
        onEndSession={onEndSession}
        hasMessages={messages.length > 0}
      />

      {/* Content Recommendation Modal */}
      <RecommendationModal
        recommendation={selectedRecommendation}
        onClose={() => setSelectedRecommendation(null)}
        onAddToLibrary={handleAddToLibrary}
        onSetReminder={handleSetReminder}
      />
    </div>
  );
};

export default VoiceFirstChat;
