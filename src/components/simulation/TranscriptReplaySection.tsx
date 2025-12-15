import { useState } from "react";
import { ChevronDown, ChevronUp, User, Bot, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TranscriptMessage } from "@/hooks/useSessionDebrief";

interface TranscriptReplaySectionProps {
  transcript: TranscriptMessage[];
}

const TranscriptReplaySection = ({ transcript }: TranscriptReplaySectionProps) => {
  // Default to expanded when transcript exists
  const [isExpanded, setIsExpanded] = useState(transcript.length > 0);

  if (!transcript.length) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between cursor-pointer group py-3">
          <h3 className="text-lg font-heading font-medium text-foreground group-hover:text-forest transition-colors">
            Conversation Transcript
          </h3>
          <Button variant="ghost" size="sm" className="text-forest">
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            <span className="ml-2 text-sm text-muted-foreground">
              {transcript.length} messages
            </span>
          </Button>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-4 mt-4 max-h-[500px] overflow-y-auto pr-2">
          {transcript.map((message, index) => (
            <div key={message.id || index}>
              {/* Message bubble */}
              <div className={`flex gap-3 ${message.sender_type === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.sender_type === 'user' 
                    ? 'bg-forest/20 text-forest' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {message.sender_type === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                
                <div className={`flex-1 max-w-[80%] ${message.sender_type === 'user' ? 'text-right' : ''}`}>
                  <div className={`inline-block rounded-xl px-4 py-3 ${
                    message.sender_type === 'user'
                      ? 'bg-forest/10 text-foreground'
                      : 'bg-muted/50 text-foreground'
                  }`}>
                    <p className="text-sm font-body leading-relaxed">{message.content}</p>
                  </div>
                  {message.emotion_displayed && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      {message.emotion_displayed}
                    </p>
                  )}
                </div>
              </div>

              {/* Coach intervention inline */}
              {message.interventionAfter && (
                <div className="ml-11 mt-3 mb-2">
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                        <Lightbulb size={14} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <p className="text-xs font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                          Mind Mastery Coach
                          {message.interventionAfter.coach_personality && (
                            <span className="font-normal ml-2">({message.interventionAfter.coach_personality})</span>
                          )}
                        </p>
                        
                        {message.interventionAfter.meta_skill_target && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            <span className="font-medium">Meta Skill:</span> {message.interventionAfter.meta_skill_target}
                            {message.interventionAfter.sub_skill_target && ` → ${message.interventionAfter.sub_skill_target}`}
                          </p>
                        )}
                        
                        {message.interventionAfter.observation && (
                          <p className="text-sm text-amber-900 dark:text-amber-200">
                            {message.interventionAfter.observation}
                          </p>
                        )}
                        
                        {message.interventionAfter.action_suggested && (
                          <div className="bg-amber-100/50 dark:bg-amber-900/30 rounded-md px-3 py-2 mt-2">
                            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Try this:</p>
                            <p className="text-sm text-amber-900 dark:text-amber-200">
                              {message.interventionAfter.action_suggested}
                            </p>
                          </div>
                        )}
                        
                        {message.interventionAfter.framework_used && (
                          <p className="text-xs text-amber-600 dark:text-amber-500 italic mt-2">
                            Framework: {message.interventionAfter.framework_used}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default TranscriptReplaySection;
