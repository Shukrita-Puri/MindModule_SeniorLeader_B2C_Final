import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  generateGoogleCalendarUrl,
  generateOutlook365Url,
  downloadIcsFile,
  createDefaultPracticeEvent,
} from "@/utils/calendarUrlGenerator";
import { toast } from "sonner";

interface ScheduleFollowupModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioTitle?: string;
}

const ScheduleFollowupModal = ({
  isOpen,
  onClose,
  scenarioTitle,
}: ScheduleFollowupModalProps) => {
  const event = createDefaultPracticeEvent(scenarioTitle);

  const handleGoogleCalendar = () => {
    const url = generateGoogleCalendarUrl(event);
    window.open(url, '_blank');
    toast.success('Opening Google Calendar');
    onClose();
  };

  const handleOutlookCalendar = () => {
    const url = generateOutlook365Url(event);
    window.open(url, '_blank');
    toast.success('Opening Outlook Calendar');
    onClose();
  };

  const handleAppleCalendar = () => {
    downloadIcsFile(event);
    toast.success('Calendar file downloaded');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-headline">
            Schedule Practice Session
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Set a reminder for your next practice session
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-4">
          <Button
            variant="outline"
            className="w-full h-12 text-[15px] font-medium shadow-md hover:shadow-lg transition-shadow"
            onClick={handleGoogleCalendar}
          >
            Google Calendar
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 text-base font-medium shadow-md hover:shadow-lg transition-shadow"
            onClick={handleOutlookCalendar}
          >
            Outlook Calendar
          </Button>

          <Button
            variant="outline"
            className="w-full h-12 text-base font-medium shadow-md hover:shadow-lg transition-shadow"
            onClick={handleAppleCalendar}
          >
            Apple Calendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleFollowupModal;
