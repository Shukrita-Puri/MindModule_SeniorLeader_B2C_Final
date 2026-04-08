import { useNavigate } from 'react-router-dom';
import { ChatCircle } from '@phosphor-icons/react';

const ACCENT = '#E87A2F';

const FloatingCoachButton = () => {
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @keyframes coach-pulse {
          0% { box-shadow: 0 0 0 0 rgba(232,122,47,0.35); }
          70% { box-shadow: 0 0 0 8px rgba(232,122,47,0); }
          100% { box-shadow: 0 0 0 0 rgba(232,122,47,0); }
        }
      `}</style>
      <button
        onClick={() =>
          navigate('/coach', {
            state: {
              entryContext: {
                entryPoint: 'direct',
                lastAction: null,
                triggeredBy: null,
              },
            },
          })
        }
        className="fixed z-[200] sm:hidden flex items-center justify-center rounded-full bg-black/70 backdrop-blur-sm"
        style={{
          right: 16,
          bottom: 84,
          width: 48,
          height: 48,
          border: `2px solid ${ACCENT}`,
          animation: 'coach-pulse 2.5s infinite',
        }}
      >
        <ChatCircle size={22} weight="duotone" className="text-saffron" />
      </button>
    </>
  );
};

export default FloatingCoachButton;
