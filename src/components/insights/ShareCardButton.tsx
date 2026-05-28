import { Share as ShareIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shareInsightCard } from '@/utils/shareInsightCard';

interface Props {
  targetRef: React.RefObject<HTMLElement>;
  title: string;
  fileName?: string;
  className?: string;
}

/**
 * Small inline share button rendered on each detail card. The targetRef
 * captures whatever toggle / tab state is currently visible, so multi-tab
 * cards (e.g. Causality stress/burnout) share the active view automatically.
 */
const ShareCardButton = ({ targetRef, title, fileName, className }: Props) => {
  const handle = async () => {
    if (!targetRef.current) return;
    await shareInsightCard({
      node: targetRef.current,
      title: `Mind Module — ${title}`,
      text: `My Mind Module insight: ${title}`,
      fileName: fileName ?? 'mind-module-insight.png',
    });
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={handle}
      aria-label={`Share ${title}`}
      className={`h-9 w-9 rounded-full hover:bg-muted/40 ${className ?? ''}`}
    >
      <ShareIcon className="w-4 h-4 text-muted-foreground" />
    </Button>
  );
};

export default ShareCardButton;