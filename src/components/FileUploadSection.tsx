import { useState, useRef } from "react";
import { Upload, File, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface FileUploadSectionProps {
  attachments: FileAttachment[];
  onAttachmentsChange: (attachments: FileAttachment[]) => void;
  maxFiles?: number;
  maxFileSize?: number; // in MB
}

const FileUploadSection = ({ 
  attachments, 
  onAttachmentsChange, 
  maxFiles = 3, 
  maxFileSize = 10 
}: FileUploadSectionProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newAttachments: FileAttachment[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check file size
      if (file.size > maxFileSize * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is ${maxFileSize}MB.`);
        continue;
      }
      
      // Check if we're at max files
      if (attachments.length + newAttachments.length >= maxFiles) {
        alert(`Maximum ${maxFiles} files allowed.`);
        break;
      }

      const attachment: FileAttachment = {
        id: Date.now().toString() + i,
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file)
      };
      
      newAttachments.push(attachment);
    }

    onAttachmentsChange([...attachments, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    const updatedAttachments = attachments.filter(attachment => {
      if (attachment.id === id && attachment.url) {
        URL.revokeObjectURL(attachment.url);
      }
      return attachment.id !== id;
    });
    onAttachmentsChange(updatedAttachments);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Attach Files (Optional)
        </label>
        <span className="text-xs text-muted-foreground">
          {attachments.length}/{maxFiles} files
        </span>
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground mb-2">
          Drop files here or{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-primary hover:underline"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-muted-foreground">
          Screenshots, docs, or context files • Max {maxFileSize}MB per file
        </p>
      </div>

      {/* File List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
              <File size={16} className="text-muted-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {attachment.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeAttachment(attachment.id)}
                className="text-muted-foreground hover:text-destructive h-auto p-1"
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploadSection;