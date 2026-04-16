import { useAuth } from '@/hooks/useAuth';

const GreetingBanner = () => {
  const { user } = useAuth();
  
  // Extract first name from user metadata or email
  const getFirstName = () => {
    if (user?.name) {
      return user.name.split(' ')[0];
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'there';
  };

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = getFirstName();
  const greeting = getGreeting();

  return (
    <div className="bg-card border-b border-black/[0.08]">
      <div className="p-6 text-center">
        <h1 className="text-[28px] font-headline font-semibold text-foreground mb-1 tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm font-body italic text-muted-foreground">Mind Module - Your daily practice</p>
      </div>
    </div>
  );
};

export default GreetingBanner;
