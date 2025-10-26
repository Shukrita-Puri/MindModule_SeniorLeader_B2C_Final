
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Heart, ArrowRight, SkipForward } from "lucide-react";
import SecurityWatermark from "@/components/home/SecurityWatermark";
import TouchOptimized from "@/components/TouchOptimized";
import ErrorMessage from "@/components/ui/error-message";
import { validateRequired, validateNumericRange } from "@/utils/validation";

interface CheckInData {
  mood: string;
  energy: number;
  focus: string;
}

const DailyCheckIn = () => {
  const navigate = useNavigate();
  const [selectedMood, setSelectedMood] = useState<string>("");
  const [energyLevel, setEnergyLevel] = useState<number[]>([5]);
  const [focusState, setFocusState] = useState<string>("");
  const [energyTouched, setEnergyTouched] = useState<boolean>(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const moods = [
    { label: "Excited", value: "excited", color: "text-green-600" },
    { label: "Content", value: "content", color: "text-blue-600" },
    { label: "Neutral", value: "neutral", color: "text-gray-600" },
    { label: "Tired", value: "tired", color: "text-yellow-600" },
    { label: "Stressed", value: "stressed", color: "text-orange-600" },
    { label: "Overwhelmed", value: "overwhelmed", color: "text-red-600" }
  ];

  const focusStates = [
    { label: "Charged", value: "charged" },
    { label: "Focused", value: "focused" },
    { label: "Scattered", value: "scattered" },
    { label: "Unmotivated", value: "unmotivated" }
  ];

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    const moodValidation = validateRequired(selectedMood, "Mood");
    if (!moodValidation.isValid) {
      newErrors.mood = moodValidation.message!;
    }

    const focusValidation = validateRequired(focusState, "Mental state");
    if (!focusValidation.isValid) {
      newErrors.focus = focusValidation.message!;
    }

    const energyValidation = validateNumericRange(energyLevel[0], 1, 10, "Energy level");
    if (!energyValidation.isValid) {
      newErrors.energy = energyValidation.message!;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleComplete = () => {
    if (!validateForm()) {
      return;
    }

    const checkInData: CheckInData = {
      mood: selectedMood,
      energy: energyLevel[0],
      focus: focusState
    };

    try {
      // Store check-in data in localStorage for the wellness card
      localStorage.setItem('dailyCheckIn', JSON.stringify({
        ...checkInData,
        timestamp: new Date().toISOString(),
        date: new Date().toDateString()
      }));

      // Navigate to home
      navigate('/executive-home');
    } catch (error) {
      setErrors({ general: "Unable to save your check-in data. Please try again." });
    }
  };

  const handleSkip = () => {
    navigate('/executive-home');
  };

  const isComplete = selectedMood && focusState && energyTouched;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <SecurityWatermark />
      
      <Card className="w-full max-w-md bg-card border border-border shadow-lg">
        <CardHeader className="text-center pb-6">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Heart size={32} className="text-accent" />
          </div>
          <CardTitle className="text-2xl font-heading font-bold text-card-foreground">
            Daily Check-In
          </CardTitle>
          <p className="text-muted-foreground text-sm font-body">
            How are you feeling today? This helps personalize your experience.
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {errors.general && (
            <ErrorMessage message={errors.general} />
          )}

          {/* Mood Selection */}
          <div>
            <h3 className="font-medium text-card-foreground mb-3 font-body">What's your mood?</h3>
            <div className="grid grid-cols-3 gap-3">
              {moods.map((mood) => (
                <TouchOptimized
                  key={mood.value}
                  onTap={() => {
                    setSelectedMood(mood.value);
                    setErrors(prev => ({ ...prev, mood: "" }));
                  }}
                >
                  <div
                    className={`p-4 rounded-xl border-2 transition-all duration-300 text-center ${
                      selectedMood === mood.value
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <div className={`text-sm font-body font-medium ${mood.color}`}>{mood.label}</div>
                  </div>
                </TouchOptimized>
              ))}
            </div>
            {errors.mood && <ErrorMessage message={errors.mood} />}
          </div>

          {/* Energy Level */}
          <div>
            <h3 className="font-medium text-card-foreground mb-3 font-body">
              Energy Level: <span className="text-accent">{energyLevel[0]}/10</span>
            </h3>
            <div className="px-2">
              <Slider
                value={energyLevel}
                onValueChange={(value) => {
                  setEnergyLevel(value);
                  setEnergyTouched(true);
                  setErrors(prev => ({ ...prev, energy: "" }));
                }}
                max={10}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Drained</span>
                <span>Energized</span>
              </div>
            </div>
            {errors.energy && <ErrorMessage message={errors.energy} />}
          </div>

          {/* Focus State */}
          <div>
            <h3 className="font-medium text-card-foreground mb-3 font-body">How do you feel mentally?</h3>
            <div className="grid grid-cols-2 gap-3">
              {focusStates.map((state) => (
                <TouchOptimized
                  key={state.value}
                  onTap={() => {
                    setFocusState(state.value);
                    setErrors(prev => ({ ...prev, focus: "" }));
                  }}
                >
                   <div
                     className={`p-3 rounded-lg border-2 transition-all duration-200 flex items-center justify-center ${
                       focusState === state.value
                         ? 'border-accent bg-accent/10'
                         : 'border-border hover:border-muted-foreground'
                     }`}
                   >
                     <span className="text-sm font-body">{state.label}</span>
                   </div>
                </TouchOptimized>
              ))}
            </div>
            {errors.focus && <ErrorMessage message={errors.focus} />}
          </div>

          {/* Complete Button */}
          <Button
            onClick={handleComplete}
            disabled={!isComplete}
            className={`w-full py-3 text-lg font-medium min-h-[48px] transition-all duration-300 ${
              isComplete 
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transform hover:scale-[1.02]' 
                : 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
            }`}
          >
            Start My Day
            <ArrowRight size={20} className="ml-2" />
          </Button>

          {/* Progress Indicator */}
          {!isComplete && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2">
                Complete all fields to start your day
              </p>
              <div className="flex justify-center gap-2">
                <div className={`w-2 h-2 rounded-full transition-all duration-200 ${selectedMood ? 'bg-accent' : 'bg-muted'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-200 ${energyTouched ? 'bg-accent' : 'bg-muted'}`} />
                <div className={`w-2 h-2 rounded-full transition-all duration-200 ${focusState ? 'bg-accent' : 'bg-muted'}`} />
              </div>
            </div>
          )}

          {/* Skip Button - More Prominent */}
          <Button
            onClick={handleSkip}
            variant="outline"
            className="w-full border-border text-muted-foreground hover:bg-muted py-3 text-base font-medium min-h-[48px]"
          >
            <SkipForward size={18} className="mr-2" />
            Skip to Homepage
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyCheckIn;
