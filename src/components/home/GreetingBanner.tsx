
interface GreetingBannerProps {
  userName?: string;
}

const GreetingBanner = ({ userName = "Alex" }: GreetingBannerProps) => {
  return (
    <div className="bg-card border-b border-black/[0.08]">
      <div className="p-6 text-center">
        <h1 className="text-3xl font-headline text-foreground mb-1 tracking-tight">Mind Atelier</h1>
        <p className="text-base font-subheadline italic text-muted-foreground">Your daily practice</p>
      </div>
    </div>
  );
};

export default GreetingBanner;
