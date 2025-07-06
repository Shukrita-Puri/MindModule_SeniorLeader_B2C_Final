import { ArrowLeft, Download, Calendar, BookOpen } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import MainNavigation from "@/components/MainNavigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const SimulationInsights = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarioDomain, contextType, scenarioContext, messages, sessionDuration } = location.state || {};
  
  const [personalNotes, setPersonalNotes] = useState("");

  // Executive-focused insights
  const strengths = [
    "Maintained clear strategic thread throughout discussion",
    "Demonstrated authentic leadership presence",
    "Effectively navigated stakeholder objections",
    "Balanced empathy with decisive action"
  ];

  const developmentAreas = [
    "Consider pausing more before complex responses",
    "Leverage storytelling for emotional connection",
    "Invite more stakeholder input for buy-in",
    "Reference specific metrics to strengthen credibility"
  ];

  const mentalModels = [
    {
      title: "Jobs-to-be-Done Framework",
      type: "Strategic Thinking",
      description: "Focus on what stakeholders are trying to achieve, not just what they're saying",
      application: "Use when stakeholders raise concerns - dig into their underlying objectives"
    },
    {
      title: "Polyvagal Theory",
      type: "Emotional Regulation",
      description: "Understand nervous system states in high-pressure conversations",
      application: "Notice when you or others shift into fight/flight - pause and breathe"
    },
    {
      title: "Hanuman Archetype",
      type: "Ancient Wisdom",
      description: "Devoted strength in service of higher purpose",
      application: "Channel power through service - lead with humility and strength"
    }
  ];

  const ancientWisdom = "Pause before power. Breathe before battle. In the space between stimulus and response lies your freedom to choose.";

  const handleDownload = () => {
    // Generate and download insight deck
    console.log("Downloading executive insight deck...");
  };

  const handleScheduleFollowup = () => {
    // Schedule practice reminder
    console.log("Scheduling follow-up practice session...");
  };

  const handleSaveNotes = () => {
    // Save to profile library
    console.log("Saving to executive library...");
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-background font-editorial pb-20">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <button
          onClick={() => navigate("/simulation")}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft size={18} className="text-foreground" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-heading font-medium text-foreground">
            Executive Debrief
          </h1>
          <p className="text-sm text-muted-foreground">
            {contextType} · {sessionDuration}
          </p>
        </div>
        <Button 
          onClick={handleDownload}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Download size={16} />
          Export
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-12">
          
          {/* Context Summary */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-heading text-foreground">Session Context</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground font-body leading-relaxed">
                <strong>Domain:</strong> {scenarioDomain}<br/>
                <strong>Scenario:</strong> {contextType}<br/>
                {scenarioContext && (
                  <>
                    <strong>Context:</strong> {scenarioContext}
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          {/* Executive Summary */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-heading text-foreground">Executive Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground font-body leading-relaxed">
                You demonstrated strong executive presence with clear strategic communication. Your ability to maintain focus while navigating complex stakeholder dynamics was particularly effective. Consider integrating more emotional storytelling and creating space for deeper stakeholder engagement to enhance influence and buy-in.
              </p>
            </CardContent>
          </Card>

          {/* Two-column layout for strengths and development */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Leadership Strengths */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl font-heading text-foreground">Leadership Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {strengths.map((strength, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-foreground font-body text-sm leading-relaxed">{strength}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Development Opportunities */}
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-xl font-heading text-foreground">Development Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {developmentAreas.map((area, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-foreground font-body text-sm leading-relaxed">{area}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mental Models & Frameworks */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-heading text-foreground">Recommended Mental Models</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {mentalModels.map((model, index) => (
                  <div key={index} className="bg-background border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-heading font-medium text-foreground">{model.title}</h4>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                        {model.type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 font-body">
                      {model.description}
                    </p>
                    <div className="text-xs text-foreground font-body">
                      <strong>Application:</strong> {model.application}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Ancient Wisdom Anchor */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-3xl mb-4">🏺</div>
                <blockquote className="text-lg font-heading italic text-foreground mb-4 leading-relaxed">
                  "{ancientWisdom}"
                </blockquote>
                <div className="text-sm text-muted-foreground">Ancient Wisdom for Modern Leadership</div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Reflection */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-heading text-foreground">Your Reflection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    What insights will you carry forward?
                  </label>
                  <Textarea
                    value={personalNotes}
                    onChange={(e) => setPersonalNotes(e.target.value)}
                    placeholder="Capture your key learnings, commitments, and next actions..."
                    className="min-h-[120px] border-border focus:border-primary"
                  />
                </div>
                <Button 
                  onClick={handleSaveNotes}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  <BookOpen size={16} className="mr-2" />
                  Save to Executive Library
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="text-2xl">📅</div>
                  <h3 className="font-heading font-medium text-foreground">Schedule Practice</h3>
                  <p className="text-sm text-muted-foreground">
                    Set a reminder to practice these frameworks in future interactions
                  </p>
                  <Button 
                    onClick={handleScheduleFollowup}
                    variant="outline"
                    className="w-full"
                  >
                    <Calendar size={16} className="mr-2" />
                    Schedule Follow-up
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="text-2xl">📊</div>
                  <h3 className="font-heading font-medium text-foreground">Download Deck</h3>
                  <p className="text-sm text-muted-foreground">
                    Get a comprehensive PDF of your insights and frameworks
                  </p>
                  <Button 
                    onClick={handleDownload}
                    variant="outline"
                    className="w-full"
                  >
                    <Download size={16} className="mr-2" />
                    Executive Summary
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Watermark */}
        <div className="text-center py-8 text-xs text-muted-foreground opacity-50">
          Inner Architect • Executive Simulation • Powered by Intelligence
        </div>
      </div>

      <MainNavigation />
    </div>
  );
};

export default SimulationInsights;