import { useEffect, useRef, useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const NAME_REGEX = /^[\p{L} '\-]+$/u;
const MAX_LEN = 40;

/**
 * Small chief-of-staff greeting overlaid on the top of the shared Today hero.
 * Tap the greeting to edit your preferred display name. Saves to
 * profiles.display_name via the update-display-name edge function and
 * cascades everywhere `useAuth().user.name` is read.
 */
const TodayGreeting = () => {
  const { user, updateDisplayName } = useAuth();
  const fullName = user?.name || user?.email || 'there';
  const firstName = String(fullName).split(' ')[0];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(firstName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(firstName);
  }, [firstName, editing]);

  useEffect(() => {
    if (editing) {
      // delay focus until input mounted
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [editing]);

  const phrases = [
    `Ready, ${firstName}`,
    `Standing by, ${firstName}`,
    `Ready to roll, ${firstName}`,
  ];
  const greeting = phrases[new Date().getDay() % phrases.length];

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > MAX_LEN) {
        toast.error(`Name must be ${MAX_LEN} characters or fewer`);
        return;
      }
      if (!NAME_REGEX.test(trimmed)) {
        toast.error('Letters, spaces, hyphens and apostrophes only');
        return;
      }
    }
    setSaving(true);
    const result = await updateDisplayName(trimmed);
    setSaving(false);
    if (result.success) {
      toast.success(trimmed ? 'Name updated' : 'Name reset');
      setEditing(false);
    } else {
      toast.error(result.error || 'Could not update name');
    }
  };

  const handleCancel = () => {
    setDraft(firstName);
    setEditing(false);
  };

  return (
    <div
      className="absolute left-0 right-0 z-30 text-center px-4 pl-14 md:pl-0 flex items-center justify-center"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
        height: '2.5rem',
      }}
    >
      {editing ? (
        <div className="flex items-center gap-2 pointer-events-auto bg-white/85 backdrop-blur-md rounded-full px-3 py-1 shadow-md border border-black/[0.08] max-w-full">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            maxLength={MAX_LEN}
            placeholder="Your name"
            disabled={saving}
            className="bg-transparent outline-none font-headline font-semibold text-foreground tracking-tight text-[20px] md:text-[28px] w-[7em] max-w-[60vw] text-center"
            aria-label="Edit your display name"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="p-1.5 rounded-full hover:bg-black/5 active:bg-black/10 disabled:opacity-50 text-foreground"
            aria-label="Save name"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="p-1.5 rounded-full hover:bg-black/5 active:bg-black/10 disabled:opacity-50 text-muted-foreground"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="pointer-events-auto inline-flex items-center gap-2 group"
          aria-label="Edit your name"
        >
          <p className="font-headline font-semibold text-white tracking-tight leading-tight text-[26px] md:text-[42px] drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]">
            {greeting}
          </p>
          <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4 text-white/70 opacity-0 group-hover:opacity-90 group-active:opacity-100 transition-opacity" />
        </button>
      )}
    </div>
  );
};

export default TodayGreeting;