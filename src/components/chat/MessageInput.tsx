
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
    <div className="border-t border-border p-4 bg-background">
      <form onSubmit={onSendMessage} className="space-y-3">
        {isTextMode && (
          <Textarea
            placeholder="Type your message..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="min-h-[60px] border-border focus:border-primary bg-background text-foreground"
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
              className="text-muted-foreground hover:text-primary"
            >
              <Paperclip size={16} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-primary"
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
                className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
              >
                End Session
              </Button>
            )}
            {isTextMode && (
              <Button 
                type="submit" 
                disabled={!inputMessage.trim() && attachments.length === 0}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
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
