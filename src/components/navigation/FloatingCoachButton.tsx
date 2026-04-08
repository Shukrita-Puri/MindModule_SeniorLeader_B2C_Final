import { useNavigate } from 'react-router-dom';
import { ChatCircle } from '@phosphor-icons/react';

const FloatingCoachButton = () => {
  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @keyframes coach-sonar {
          0% { box-shadow: 0 0 0 0 rgba(242,106,80,0.4), 0 0 0 0 rgba(242,106,80,0.2); }
          50% { box-shadow: 0 0 0 6px rgba(242,106,80,0), 0 0 0 12px rgba(242,106,80,0); }
          100% { box-shadow: 0 0 0 0 rgba(242,106,80,0.4), 0 0 0 0 rgba(242,106,80,0.2); }
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
        className="fixed z-[200] sm:hidden flex items-center justify-center rounded-full bg-black/70 backdrop-blur-sm border border-white/10 shadow-lg shadow-black/20"
        style={{
          right: 16,
          bottom: 84,
          width: 48,
          height: 48,
          animation: 'coach-sonar 2.5s infinite',
        }}
      >
        <ChatCircle size={24} weight="duotone" className="text-saffron" />
      </button>
    </>
  );
};

export default FloatingCoachButton;
