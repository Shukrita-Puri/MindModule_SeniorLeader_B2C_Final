
import { Shield, Lock, Database } from "lucide-react";
import { useState } from "react";

const SecurityWatermark = () => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <div 
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-green-50 backdrop-blur-sm px-3 py-2 rounded-full text-xs text-green-700 border border-green-200 shadow-sm cursor-pointer hover:bg-green-100 transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        <Shield size={14} className="text-green-600" />
        <span className="font-medium">Data Secure</span>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
      </div>

      {showDetails && (
        <div className="fixed bottom-16 left-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-xs">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800">
              <Lock size={16} className="text-green-600" />
              Local Storage Security
            </div>
            <div className="space-y-2 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <Database size={12} />
                <span>All data stored locally on your device</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield size={12} />
                <span>No data transmitted to external servers</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock size={12} />
                <span>Browser-level encryption protection</span>
              </div>
            </div>
            <button 
              onClick={() => setShowDetails(false)}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SecurityWatermark;
