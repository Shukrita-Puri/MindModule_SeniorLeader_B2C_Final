
import { File, X } from "lucide-react";

interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

interface FileAttachmentsProps {
  attachments: FileAttachment[];
  onRemove: (id: string) => void;
}

const FileAttachments = ({ attachments, onRemove }: FileAttachmentsProps) => {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (attachments.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => (
          <div key={attachment.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-sm border">
            <File size={16} className="text-gray-500" />
            <span className="truncate max-w-[150px]">{attachment.name}</span>
            <span className="text-xs text-gray-500">({formatFileSize(attachment.size)})</span>
            <button
              onClick={() => onRemove(attachment.id)}
              className="text-gray-400 hover:text-red-500 ml-1"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FileAttachments;
