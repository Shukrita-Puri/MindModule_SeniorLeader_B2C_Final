import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PointSystemModalProps {
  cluster: 'self' | 'social';
}

const PointSystemModal = ({ cluster }: PointSystemModalProps) => {
  const isSelf = cluster === 'self';
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors p-0.5">
          <Info size={12} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isSelf ? 'Self Mastery' : 'Social Mastery'} Points
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Earn points to unlock badges and level up your {isSelf ? 'self-regulation' : 'social intelligence'} skills.
          </p>
          
          <div className="space-y-3">
            <h4 className="text-sm font-medium">How to earn points:</h4>
            
            {isSelf ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Complete Daily Ritual (full)</span>
                  <span className="font-semibold text-green-600">+5 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Complete Daily Ritual (partial)</span>
                  <span className="font-semibold text-amber-600">+2 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Recalibrate Practice</span>
                  <span className="font-semibold text-green-600">+3 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Dialogue Session (Self Mastery)</span>
                  <span className="font-semibold text-green-600">+10 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Skill Strength Demonstrated</span>
                  <span className="font-semibold text-green-600">+2 pts</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span>Skill Gap Identified</span>
                  <span className="font-semibold text-red-500">-1 pt</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Dialogue Session (Social Mastery)</span>
                  <span className="font-semibold text-green-600">+10 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border">
                  <span>Skill Strength Demonstrated</span>
                  <span className="font-semibold text-green-600">+2 pts</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span>Skill Gap Identified</span>
                  <span className="font-semibold text-red-500">-1 pt</span>
                </div>
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-border">
            <h4 className="text-sm font-medium mb-2">Badge Thresholds:</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-emerald-500' : 'bg-indigo-400'}`} />
                <span>Initiate: 25 pts</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-emerald-600' : 'bg-indigo-500'}`} />
                <span>Practitioner: 50 pts</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-emerald-700' : 'bg-indigo-600'}`} />
                <span>Adept: 100 pts</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-emerald-800' : 'bg-indigo-700'}`} />
                <span>Badge: 150 pts</span>
              </div>
              <div className="flex items-center gap-1 col-span-2">
                <div className={`w-2 h-2 rounded-full ${isSelf ? 'bg-emerald-900' : 'bg-indigo-800'}`} />
                <span>Certificate: 250 pts</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PointSystemModal;
