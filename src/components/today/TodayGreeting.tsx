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
      className="absolute left-0 right-0 z-30 pointer-events-none text-center px-4 pl-14 md:pl-0 flex items-center justify-center"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        height: '2.75rem',
      }}
    >
      <p className="text-[33px] leading-tight font-headline font-semibold text-foreground tracking-tight">
        {greeting}
      </p>
    </div>
  );
};

export default TodayGreeting;