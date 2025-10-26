
interface GreetingBannerProps {
  userName?: string;
}

const GreetingBanner = ({ userName = "Alex" }: GreetingBannerProps) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    
    if (hour < 12) return `Good morning, ${userName}`;
    if (hour < 17) return `Good afternoon, ${userName}`;
    return `Good evening, ${userName}`;
  };

  return (
    <div className="bg-card border-b border-gold/20">
      <div className="p-6">
        <h1 className="text-2xl font-headline text-foreground mb-2">{getGreeting()}</h1>
        <p className="text-base text-muted-foreground font-body">Your mental espresso is ready</p>
      </div>
    </div>
  );
};

export default GreetingBanner;
