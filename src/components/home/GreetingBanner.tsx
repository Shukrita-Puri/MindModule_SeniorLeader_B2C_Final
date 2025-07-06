
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
    <div className="bg-gradient-to-r from-gray-900 to-gray-700 text-white">
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">{getGreeting()}</h1>
        <p className="text-gray-300">Your mental espresso is ready</p>
      </div>
    </div>
  );
};

export default GreetingBanner;
