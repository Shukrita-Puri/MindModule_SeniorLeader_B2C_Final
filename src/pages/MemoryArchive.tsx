
import { useState } from "react";
import { ArrowLeft, Archive, Calendar, Search, Filter, Clock, Star, Tag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import MainNavigation from "@/components/MainNavigation";

const MemoryArchive = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  // Sample archived memories/entries
  const memories = [
    {
      id: 1,
      title: "AP Chemistry Stress Session",
      date: "2024-01-15",
      type: "Clarity Mode",
      preview: "Explored test anxiety around AP Chemistry exam. Key insight: breaking down study material into manageable chunks reduces overwhelm.",
      tags: ["test-anxiety", "AP-chemistry", "study-strategies"],
      starred: true,
      duration: "12 min"
    },
    {
      id: 2,
      title: "Social Intelligence: Friend Drama",
      date: "2024-01-14",
      type: "Social Intelligence",
      preview: "Practiced difficult conversation with best friend about feeling left out. Learned assertive communication techniques.",
      tags: ["friendship", "communication", "boundaries"],
      starred: false,
      duration: "8 min"
    },
    {
      id: 3,
      title: "Inner Calibration: College Stress",
      date: "2024-01-13",
      type: "Inner Calibration",
      preview: "Emergency session during college application deadline stress. Applied breathing and perspective reframing techniques.",
      tags: ["college-stress", "breathing", "perspective"],
      starred: true,
      duration: "5 min"
    },
    {
      id: 4,
      title: "Flow State: SAT Prep Focus",
      date: "2024-01-12",
      type: "Flow State",
      preview: "Deep focus session for SAT math preparation. Discovered optimal study rhythm using Pomodoro technique.",
      tags: ["SAT-prep", "focus", "time-management"],
      starred: false,
      duration: "15 min"
    },
    {
      id: 5,
      title: "Identity + Growth: College Vision Board",
      date: "2024-01-11",
      type: "Identity + Growth",
      preview: "Mapped out college and career aspirations. Clarified vision for impact in environmental science field.",
      tags: ["college-planning", "career-vision", "environmental-science"],
      starred: true,
      duration: "20 min"
    }
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case "Clarity Mode": return "bg-gray-100 text-gray-800";
      case "Scenario Lab": return "bg-gray-100 text-gray-800";
      case "Ground Mode": return "bg-red-100 text-hyper-coral";
      case "Mentor Mode": return "bg-gray-100 text-gray-800";
      case "Identity + Growth": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const filteredMemories = memories.filter(memory =>
    memory.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    memory.preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
    memory.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900 uppercase">MEMORY ARCHIVE</h1>
            <p className="text-sm text-gray-600">Your Growth Journey Records</p>
          </div>
          <button
            onClick={() => navigate("/mind-vault")}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Archive size={20} className="text-gray-600" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Search and Filter */}
        <div className="space-y-4">
          <div className="relative">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search memories, insights, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-gray-300"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="bg-white border-gray-300">
              <Filter size={16} className="mr-2" />
              Filter
            </Button>
            <Button variant="outline" size="sm" className="bg-white border-gray-300">
              <Star size={16} className="mr-2 text-hyper-coral" />
              Starred
            </Button>
            <Button variant="outline" size="sm" className="bg-white border-gray-300">
              <Calendar size={16} className="mr-2" />
              Date
            </Button>
          </div>
        </div>


        {/* Memory List */}
        <div className="space-y-4">
          <h3 className="font-bold text-gray-900 text-lg">Recent Memories</h3>
          
          {filteredMemories.map((memory) => (
            <Card key={memory.id} className="bg-white border-gray-200 hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-2 h-2 rounded-full bg-hyper-coral mt-2 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-gray-900">{memory.title}</h4>
                        {memory.starred && <Star size={16} className="text-hyper-coral fill-current" />}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{memory.preview}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock size={12} />
                        <span>{memory.duration}</span>
                        <span>•</span>
                        <span>{memory.date}</span>
                      </div>
                    </div>
                  </div>
                  <Badge className={`${getTypeColor(memory.type)} border-0`}>
                    {memory.type}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  {memory.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full"
                    >
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default MemoryArchive;
