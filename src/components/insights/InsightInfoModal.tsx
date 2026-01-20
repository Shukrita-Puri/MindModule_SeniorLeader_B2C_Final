import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Info } from 'lucide-react';

interface InsightInfoModalProps {
  title: string;
  explanation: string;
}

const InsightInfoModal = ({ title, explanation }: InsightInfoModalProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button 
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
          aria-label={`Learn more about ${title}`}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed pt-2">
            {explanation}
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};

export default InsightInfoModal;
