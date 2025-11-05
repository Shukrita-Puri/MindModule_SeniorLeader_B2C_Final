import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Calendar, Activity } from "lucide-react";

interface Provider {
  id: string;
  name: string;
  status: 'available' | 'coming-soon';
  launchDate?: string;
  icon: string;
}

interface ProviderSelectorProps {
  type: 'calendar' | 'wearable';
  selectedProvider: string | null;
  onSelect: (providerId: string) => void;
}

const calendarProviders: Provider[] = [
  { id: 'google', name: 'Google Calendar', status: 'available', icon: '📅' },
  { id: 'microsoft', name: 'Microsoft Outlook', status: 'coming-soon', launchDate: 'March 2024', icon: '📆' },
  { id: 'apple', name: 'Apple Calendar', status: 'coming-soon', launchDate: 'March 2024', icon: '🍎' },
];

const wearableProviders: Provider[] = [
  { id: 'oura', name: 'Oura Ring', status: 'available', icon: '💍' },
  { id: 'apple-watch', name: 'Apple Watch', status: 'available', icon: '⌚' },
  { id: 'whoop', name: 'Whoop', status: 'coming-soon', launchDate: 'May 2024', icon: '📊' },
  { id: 'garmin', name: 'Garmin', status: 'coming-soon', launchDate: 'May 2024', icon: '🏃' },
];

export const ProviderSelector = ({ type, selectedProvider, onSelect }: ProviderSelectorProps) => {
  const providers = type === 'calendar' ? calendarProviders : wearableProviders;

  return (
    <div className="space-y-2 mt-4 animate-fade-in">
      <p className="text-sm font-medium mb-3">Select your provider:</p>
      <div className="grid grid-cols-1 gap-2">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            onClick={() => onSelect(provider.id)}
            className={cn(
              "p-4 cursor-pointer transition-all duration-200",
              selectedProvider === provider.id
                ? "border-gold bg-gold/5 shadow-lg"
                : "border-border hover:border-gold/50 hover:bg-card/80"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{provider.icon}</span>
                <div>
                  <p className="font-medium">{provider.name}</p>
                  {provider.status === 'coming-soon' && provider.launchDate && (
                    <p className="text-xs text-muted-foreground">Coming {provider.launchDate}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {provider.status === 'available' ? (
                  <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-700 dark:text-green-300 text-xs font-medium">
                    Available
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                    Soon
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
