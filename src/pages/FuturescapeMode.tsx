
import { useState } from "react";
import { ArrowLeft, Target, Send, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ModeDial from "@/components/ModeDial";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MainNavigation from "@/components/MainNavigation";
import inkMeditationIllustration from "@/assets/ink-meditation-illustration.png";

const FuturescapeMode = () => {
  const navigate = useNavigate();
  const [visionStatement, setVisionStatement] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [newObjective, setNewObjective] = useState("");

  const handleAddObjective = () => {
    if (newObjective.trim()) {
      setObjectives(prev => [...prev, newObjective]);
      setNewObjective("");
    }
  };

  const handleExecuteVision = () => {
    if (visionStatement.trim() && objectives.length > 0) {
      alert("Creating your personalized execution roadmap...");
    } else {
      alert("Please set your vision and at least one strategic objective first.");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/inner-architect")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <h1 className="text-xl font-heading font-medium text-foreground">Vision</h1>
        <div className="w-10"></div>
      </div>

      {/* Hero Section - Minimal */}
      <div className="px-8 py-20 text-center max-w-2xl mx-auto">
        <div className="w-32 h-32 mx-auto mb-12 rounded-full bg-card border border-border overflow-hidden">
          <img 
            src={inkMeditationIllustration}
            alt="Contemplative visioning"
            className="w-full h-full object-contain p-4 opacity-90"
          />
        </div>
        <h2 className="text-3xl font-heading font-medium text-foreground mb-6 leading-tight">
          See your possibilities
        </h2>
        <p className="text-lg text-muted-foreground leading-relaxed mb-16">
          Craft your vision and create an actionable roadmap
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-8 space-y-12 max-w-2xl mx-auto">
        
        {/* 1. Set Vision */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Set Your Vision</h2>
            <p className="text-gray-600">Define your ideal future state in 3-5 years</p>
          </div>
          
          <Textarea
            value={visionStatement}
            onChange={(e) => setVisionStatement(e.target.value)}
            placeholder="Describe your vision - your role, impact, achievements, and the legacy you want to create..."
            className="min-h-[120px] border-gray-300 focus:border-hyper-coral text-base p-4"
          />
        </div>

        {/* 2. Strategic Objectives */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Strategic Objectives</h2>
            <p className="text-gray-600">What are the critical outcomes you must achieve?</p>
          </div>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add a strategic objective..."
                className="flex-1 p-4 border border-gray-300 rounded-lg focus:outline-none focus:border-hyper-coral text-base"
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddObjective()}
              />
              <Button 
                onClick={handleAddObjective} 
                className="bg-hyper-coral hover:bg-red-600 px-6"
              >
                Add
              </Button>
            </div>
            
            {objectives.length > 0 && (
              <div className="space-y-3">
                {objectives.map((objective, index) => (
                  <div key={index} className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <Target size={20} className="text-hyper-coral flex-shrink-0" />
                    <span className="flex-1 text-gray-800">{objective}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-300 hover:bg-gray-50"
                      onClick={() => setObjectives(prev => prev.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. Execute Vision */}
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-gray-800">Execute Your Vision</h2>
            <p className="text-gray-600">Transform vision into actionable roadmap</p>
          </div>
          
          <Button 
            onClick={handleExecuteVision}
            className="w-full bg-hyper-coral hover:bg-red-600 text-white py-4 text-lg font-semibold"
          >
            <Play size={20} className="mr-2" />
            Generate Execution Roadmap
          </Button>
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default FuturescapeMode;
