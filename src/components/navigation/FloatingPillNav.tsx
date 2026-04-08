import { useNavigate, useLocation } from 'react-router-dom';
import { House, Sparkles, TrendingUp } from 'lucide-react';

const TABS = [
  { icon: House, label: 'Today', path: '/executive-home' },
  { icon: Sparkles, label: 'Reset', path: '/recalibrate' },
  { icon: TrendingUp, label: 'Insights', path: '/insights' },
] as const;

const FloatingPillNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed z-[180] sm:hidden flex items-center justify-center"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        left: '50%',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="flex items-center border border-white/10 bg-black/70 backdrop-blur-2xl shadow-2xl"
        style={{
          borderRadius: 999,
          padding: '6px 10px',
          gap: 6,
          minWidth: 248,
        }}
      >
        {TABS.map((tab) => {
          const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/');
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`relative flex min-w-[72px] flex-col items-center gap-0.5 rounded-full px-4 py-2 transition-all duration-200 ${
                isActive
                  ? 'bg-white/15'
                  : 'bg-transparent'
              }`}
              style={{
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <tab.icon
                size={19}
                className="text-white"
              />
              <span
                className={`font-body text-[9px] tracking-[0.01em] text-white ${
                  isActive ? 'opacity-100' : 'opacity-70'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default FloatingPillNav;
