import { useAuth } from '@/hooks/useAuth';

/**
 * Small chief-of-staff greeting overlaid on the top-right of the shared
 * Today hero. Presentation-only — does not affect layout (absolutely
 * positioned), and no logic beyond reading the auth user name.
 */
const TodayGreeting = () => {
  const { user } = useAuth();
  const fullName = user?.name || user?.email || 'there';
  const firstName = String(fullName).split(' ')[0];
  const phrases = [
    `Ready, ${firstName}`,
    `Standing by, ${firstName}`,
    `Ready to roll, ${firstName}`,
  ];
  const greeting = phrases[new Date().getDay() % phrases.length];

  return (
    <div
      className="absolute right-4 z-30 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.95rem)' }}
    >
      <p className="text-[12px] tracking-wide font-body text-white/85 drop-shadow-sm">
        {greeting}
      </p>
    </div>
  );
};

export default TodayGreeting;