import { useNavigate } from 'react-router-dom';
import type { ConnectionRecoveryPromptData } from '@/hooks/useConnectionRecoveryPrompt';

interface ConnectionRecoveryPromptProps {
  prompt: ConnectionRecoveryPromptData;
  onDismiss: () => void;
  onAct: () => void;
}

/**
 * Same glass treatment as the post-event prompt. Presentation only — it never
 * changes connection state itself, it just routes to Manage connections.
 */
const ConnectionRecoveryPrompt = ({
  prompt,
  onDismiss,
  onAct,
}: ConnectionRecoveryPromptProps) => {
  const navigate = useNavigate();

  const handleManage = () => {
    onAct();
    navigate('/connected-data');
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="rounded-3xl max-w-md w-full bg-black/55 backdrop-blur-xl border border-white/30 shadow-2xl">
        <div className="px-5 pt-5 pb-2 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] text-white/80 font-body font-medium">
            Connection check
          </p>
          <h2 className="text-[22px] md:text-[26px] font-headline tracking-tight text-white">
            {prompt.title}
          </h2>
        </div>
        <div className="px-5 pb-5 pt-1 space-y-4">
          <p className="text-sm text-white/85 leading-relaxed font-body">
            {prompt.body}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleManage}
              className="flex-1 rounded-full bg-white text-black text-sm font-body font-medium py-2.5 transition-opacity hover:opacity-90"
            >
              Manage connections
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2.5 text-sm font-body text-white/70 hover:text-white transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectionRecoveryPrompt;
