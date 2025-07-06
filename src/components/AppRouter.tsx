
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ExecutiveHome from "@/pages/ExecutiveHome";
import DailyCheckIn from "@/pages/DailyCheckIn";

const AppRouter = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [shouldShowCheckIn, setShouldShowCheckIn] = useState(false);

  useEffect(() => {
    // Check if user came from smart nudge
    const fromSmartNudge = searchParams.get('from') === 'smart-nudge';
    const nudgeAction = searchParams.get('action');
    
    if (fromSmartNudge && nudgeAction) {
      // Navigate directly to the nudge action
      navigate(`/${nudgeAction}`);
      return;
    }

    // Check if user has completed today's check-in
    const storedCheckIn = localStorage.getItem('dailyCheckIn');
    const today = new Date().toDateString();
    
    if (storedCheckIn) {
      const checkInData = JSON.parse(storedCheckIn);
      if (checkInData.date === today) {
        // Already completed today's check-in, go to home
        setShouldShowCheckIn(false);
        return;
      }
    }
    
    // Show check-in for new day
    setShouldShowCheckIn(true);
  }, [navigate, searchParams]);

  if (shouldShowCheckIn) {
    return <DailyCheckIn />;
  }

  return <ExecutiveHome />;
};

export default AppRouter;
