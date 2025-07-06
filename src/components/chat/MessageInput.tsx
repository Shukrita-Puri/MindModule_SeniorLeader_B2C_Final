
import { useRef } from "react";
import { Send, Paperclip, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface MessageInputProps {
  inputMessage: string;
  setInputMessage: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isTextMode: boolean;
  attachments: FileAttachment[];
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEndSession: () => void;
  hasMessages: boolean;
}

const MessageInput = ({
  inputMessage,
  setInputMessage,
  onSendMessage,
  isTextMode,
  attachments,
  onFileUpload,
  onEndSession,
  hasMessages
}: MessageInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-t border-gray-200 p-4 bg-white">
      <form onSubmit={onSendMessage} className="space-y-3">
        {isTextMode && (
          <Textarea
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="min-h-[60px] border-gray-300 focus:border-hyper-coral"
          />
        )}
        
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
              onChange={onFileUpload}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-500 hover:text-hyper-coral"
            >
              <Paperclip size={16} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-gray-500 hover:text-hyper-coral"
            >
              <Link size={16} />
            </Button>
          </div>
          
          <div className="flex gap-2">
            {hasMessages && (
              <Button
                type="button"
                onClick={onEndSession}
                variant="outline"
                className="border-hyper-coral text-hyper-coral hover:bg-red-50"
              >
                End Session
              </Button>
            )}
            {isTextMode && (
              <Button 
                type="submit" 
                disabled={!inputMessage.trim() && attachments.length === 0}
                className="bg-hyper-coral hover:bg-red-600 text-white"
              >
                <Send size={16} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default MessageInput;
