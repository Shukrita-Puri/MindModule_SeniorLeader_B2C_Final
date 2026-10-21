import { useNavigate } from 'react-router-dom';
import { Dialog, DialogPortal, DialogOverlay, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import type { HomeRelocationPromptData } from '@/hooks/useHomeRelocationPrompt';

interface Props {
  prompt: HomeRelocationPromptData;
  saving: boolean;
  error: string | null;
  respond: (action: 'not_now' | 'keep_home' | 'update') => Promise<boolean>;
}
export default function HomeRelocationPrompt({ prompt, saving, error, respond }: Props) {
  const navigate = useNavigate();
  return (
    <Dialog open onOpenChange={open => { if (!open && !saving) void respond('not_now'); }}>
      <DialogPortal>
        <DialogOverlay className="home-relocation-overlay backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="home-relocation-panel fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border p-5 backdrop-blur-xl focus:outline-none"
          onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}
          onPointerDownOutside={event => event.preventDefault()}
        >
          <p className="mb-1.5 text-[11px] uppercase font-body font-medium opacity-80">Home location</p>
          <DialogTitle className="text-[22px] md:text-[26px] font-headline font-normal tracking-normal leading-tight">{prompt.title}</DialogTitle>
          <DialogDescription className="home-relocation-copy mt-3 text-sm font-body leading-relaxed">{prompt.body}</DialogDescription>
          {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" className="home-relocation-primary flex-1 rounded-full px-4" disabled={saving}
              onClick={async () => { if (await respond('update')) navigate('/profile#home-location'); }}>Update home location</Button>
            <Button variant="outline" className="home-relocation-secondary rounded-full px-4" disabled={saving}
              onClick={() => void respond('not_now')}>Not now</Button>
          </div>
          <Button variant="link" className="home-relocation-keep mt-2 h-auto px-0 py-2 font-normal" disabled={saving}
            onClick={() => void respond('keep_home')}>Keep Home</Button>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}