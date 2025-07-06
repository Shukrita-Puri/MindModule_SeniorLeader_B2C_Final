
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";

interface SessionFeedbackProps {
  onSubmit: (feedback: {
    rating: 'positive' | 'negative';
    improvement: string;
    nextTime: string;
  }) => void;
  onSkip: () => void;
}

const SessionFeedback = ({ onSubmit, onSkip }: SessionFeedbackProps) => {
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [improvement, setImprovement] = useState("");
  const [nextTime, setNextTime] = useState("");

  const handleSubmit = () => {
    if (rating) {
      onSubmit({
        rating,
        improvement,
        nextTime
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-8">
      <Card className="max-w-md w-full max-h-[calc(100vh-2rem)] overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare size={20} className="text-hyper-coral" />
            Session Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">How was this session?</p>
            <div className="flex gap-3">
              <Button
                onClick={() => setRating('positive')}
                variant={rating === 'positive' ? 'default' : 'outline'}
                className={`flex-1 ${
                  rating === 'positive' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'hover:bg-green-50 hover:border-green-500'
                }`}
              >
                <ThumbsUp size={16} className="mr-2" />
                Helpful
              </Button>
              <Button
                onClick={() => setRating('negative')}
                variant={rating === 'negative' ? 'default' : 'outline'}
                className={`flex-1 ${
                  rating === 'negative' 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'hover:bg-red-50 hover:border-red-500'
                }`}
              >
                <ThumbsDown size={16} className="mr-2" />
                Needs Work
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              What could be better next time? (optional)
            </label>
            <Textarea
              placeholder="e.g., More specific examples, deeper analysis..."
              value={improvement}
              onChange={(e) => setImprovement(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              What would you like to discuss next time? (optional)
            </label>
            <Textarea
              placeholder="e.g., Follow-up on today's insights, new challenges..."
              value={nextTime}
              onChange={(e) => setNextTime(e.target.value)}
              className="min-h-[60px]"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={onSkip}
              variant="ghost"
              className="flex-1 order-2 sm:order-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!rating}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 order-1 sm:order-2"
            >
              Submit Feedback
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SessionFeedback;
