import jsPDF from 'jspdf';

interface TranscriptMessage {
  sender_type: 'user' | 'persona';
  content: string;
  interventionAfter?: {
    coach_personality?: string;
    meta_skill_target?: string;
    sub_skill_target?: string;
    observation?: string;
    action_suggested?: string;
    framework_used?: string;
    wisdom_source?: {
      quote?: string;
      attribution?: string;
    };
  };
}

interface MetaSkillProgress {
  currentScore: number;
  baselineScore: number;
  change: number;
  scenariosPracticed: number;
}

interface DebriefData {
  scenarioDomain?: string;
  contextType?: string;
  scenarioContext?: string;
  sessionDuration?: string | number;
  exchangeCount?: number;
  interventionCount?: number;
  mentalFitnessScore?: number;
  mentalFitnessChange?: number;
  strengths?: string[];
  blindSpots?: string[];
  mentalModels?: string[];
  personalNotes?: string;
  date?: Date;
  transcript?: TranscriptMessage[];
  selfMastery?: MetaSkillProgress | null;
  socialMastery?: MetaSkillProgress | null;
}

export const generateDebriefPdf = (data: DebriefData): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = 20;
  
  // Helper function to add text with word wrap
  const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 6): number => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
  };

  // Helper function to check page overflow and add new page if needed
  const checkPageOverflow = (requiredSpace: number = 30): void => {
    if (yPos > pageHeight - requiredSpace) {
      doc.addPage();
      yPos = 20;
    }
  };

  // Helper function for section headers
  const addSectionHeader = (title: string): void => {
    checkPageOverflow(40);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(74, 85, 104);
    doc.text(title.toUpperCase(), margin, yPos);
    yPos += 8;
    doc.setTextColor(0);
  };
  
  // Header with branding
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 97, 73); // Forest green
  doc.text('Mind Module', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Dialogue Debrief', margin, yPos);
  yPos += 6;
  
  // Date
  doc.setFontSize(10);
  const dateStr = (data.date || new Date()).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(dateStr, margin, yPos);
  yPos += 12;

  // Divider line
  doc.setDrawColor(200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;
  
  // Session Context Section
  addSectionHeader('Session Context');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);
  
  // Always show some context info
  const category = data.scenarioDomain || 'Dialogue Practice';
  const scenario = data.contextType || 'Practice Session';
  
  doc.text(`Category: ${category}`, margin, yPos);
  yPos += 6;
  doc.text(`Scenario: ${scenario}`, margin, yPos);
  yPos += 6;
  
  if (data.sessionDuration) {
    const durationStr = typeof data.sessionDuration === 'number' 
      ? `${Math.floor(data.sessionDuration / 60)} minutes`
      : data.sessionDuration;
    doc.text(`Duration: ${durationStr}`, margin, yPos);
    yPos += 6;
  }
  
  // Add exchange and intervention counts
  if (data.exchangeCount !== undefined || data.interventionCount !== undefined) {
    const statsLine = [
      data.exchangeCount !== undefined ? `${data.exchangeCount} exchanges` : null,
      data.interventionCount !== undefined ? `${data.interventionCount} coach interventions` : null
    ].filter(Boolean).join(' • ');
    if (statsLine) {
      doc.text(statsLine, margin, yPos);
      yPos += 6;
    }
  }
  yPos += 8;

  // Meta-Skill Progress Section
  if (data.selfMastery || data.socialMastery) {
    addSectionHeader('Meta-Skill Progress');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    if (data.selfMastery) {
      const changeStr = data.selfMastery.change >= 0 ? `+${data.selfMastery.change}` : `${data.selfMastery.change}`;
      doc.setTextColor(60);
      doc.text(`Self Mastery: ${data.selfMastery.currentScore}/100 (${changeStr} from baseline)`, margin, yPos);
      yPos += 5;
      doc.setTextColor(120);
      doc.text(`${data.selfMastery.scenariosPracticed} scenarios practiced`, margin + 4, yPos);
      yPos += 7;
    }
    
    if (data.socialMastery) {
      const changeStr = data.socialMastery.change >= 0 ? `+${data.socialMastery.change}` : `${data.socialMastery.change}`;
      doc.setTextColor(60);
      doc.text(`Social Mastery: ${data.socialMastery.currentScore}/100 (${changeStr} from baseline)`, margin, yPos);
      yPos += 5;
      doc.setTextColor(120);
      doc.text(`${data.socialMastery.scenariosPracticed} scenarios practiced`, margin + 4, yPos);
      yPos += 7;
    }
    yPos += 6;
  }

  // Conversation Transcript Section
  if (data.transcript && data.transcript.length > 0) {
    addSectionHeader('Conversation Transcript');
    
    doc.setFontSize(9);
    
    data.transcript.forEach((msg) => {
      checkPageOverflow(50);
      
      // Speaker label
      const speaker = msg.sender_type === 'user' ? 'You' : 'Persona';
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(msg.sender_type === 'user' ? 34 : 100, msg.sender_type === 'user' ? 97 : 100, msg.sender_type === 'user' ? 73 : 100);
      doc.text(`[${speaker}]:`, margin, yPos);
      yPos += 5;
      
      // Message content
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60);
      yPos = addWrappedText(msg.content, margin + 4, yPos, pageWidth - margin * 2 - 4, 5);
      yPos += 4;
      
      // Coach intervention if present
      if (msg.interventionAfter) {
        checkPageOverflow(40);
        const intervention = msg.interventionAfter;
        
        // Coach note header
        doc.setFont('helvetica', 'bolditalic');
        doc.setTextColor(180, 140, 60); // Gold color
        const toneLabel = intervention.coach_personality ? ` (${intervention.coach_personality})` : '';
        doc.text(`Coach Note${toneLabel}:`, margin + 8, yPos);
        yPos += 5;
        
        // Meta skill target
        if (intervention.meta_skill_target) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100);
          const subSkillLabel = intervention.sub_skill_target ? ` → ${intervention.sub_skill_target}` : '';
          doc.text(`Meta Skill: ${intervention.meta_skill_target}${subSkillLabel}`, margin + 12, yPos);
          yPos += 5;
        }
        
        // Observation
        if (intervention.observation) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(80);
          yPos = addWrappedText(intervention.observation, margin + 12, yPos, pageWidth - margin * 2 - 16, 5);
          yPos += 3;
        }
        
        // Action suggested
        if (intervention.action_suggested) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(34, 97, 73);
          doc.text('Try this:', margin + 12, yPos);
          yPos += 4;
          doc.setFont('helvetica', 'normal');
          yPos = addWrappedText(intervention.action_suggested, margin + 16, yPos, pageWidth - margin * 2 - 20, 5);
          yPos += 3;
        }
        
        // Framework used
        if (intervention.framework_used) {
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(100);
          doc.text(`Framework: ${intervention.framework_used}`, margin + 12, yPos);
          yPos += 4;
          
          if (intervention.wisdom_source?.quote) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(120);
            const quoteText = `"${intervention.wisdom_source.quote}"`;
            const attribution = intervention.wisdom_source.attribution ? ` — ${intervention.wisdom_source.attribution}` : '';
            yPos = addWrappedText(quoteText + attribution, margin + 16, yPos, pageWidth - margin * 2 - 20, 5);
          }
          yPos += 3;
        }
        
        yPos += 4;
      }
      
      yPos += 2;
    });
    
    yPos += 6;
  }
  
  // Strengths Section
  if (data.strengths && data.strengths.length > 0) {
    addSectionHeader('Key Strengths');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    
    data.strengths.forEach((strength) => {
      checkPageOverflow(15);
      doc.text(`• ${strength}`, margin + 4, yPos);
      yPos += 6;
    });
    yPos += 6;
  }
  
  // Blind Spots / Development Areas Section
  if (data.blindSpots && data.blindSpots.length > 0) {
    addSectionHeader('Development Areas');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    
    data.blindSpots.forEach((blindSpot) => {
      checkPageOverflow(15);
      yPos = addWrappedText(`• ${blindSpot}`, margin + 4, yPos, pageWidth - margin * 2 - 4);
      yPos += 2;
    });
    yPos += 6;
  }
  
  // Mental Models / Frameworks Section
  if (data.mentalModels && data.mentalModels.length > 0) {
    addSectionHeader('Frameworks Used');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    
    data.mentalModels.forEach((model) => {
      checkPageOverflow(15);
      doc.text(`• ${model}`, margin + 4, yPos);
      yPos += 6;
    });
    yPos += 6;
  }
  
  // Personal Notes Section
  if (data.personalNotes) {
    addSectionHeader('Personal Reflection');
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    yPos = addWrappedText(data.personalNotes, margin, yPos, pageWidth - (margin * 2));
    yPos += 8;
  }
  
  // Footer on each page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 12;
    
    // Divider line
    doc.setDrawColor(200);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Mind Module - Dialogue Room', margin, footerY);
    doc.text('mindmodule.app', pageWidth - margin - 25, footerY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2 - 10, footerY);
  }
  
  // Save the PDF
  const filename = `dialogue-debrief-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
};

// Generate transcript-only PDF
export const generateTranscriptPdf = (transcript: TranscriptMessage[], scenarioContext?: string): void => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = 20;

  const addWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number = 5): number => {
    const lines = doc.splitTextToSize(text, maxWidth);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
  };

  const checkPageOverflow = (requiredSpace: number = 30): void => {
    if (yPos > pageHeight - requiredSpace) {
      doc.addPage();
      yPos = 20;
    }
  };

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(34, 97, 73);
  doc.text('Dialogue Transcript', margin, yPos);
  yPos += 8;

  if (scenarioContext) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(scenarioContext, margin, yPos);
    yPos += 6;
  }

  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(new Date().toLocaleDateString('en-US', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  }), margin, yPos);
  yPos += 10;

  // Divider
  doc.setDrawColor(200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Transcript content
  doc.setFontSize(9);
  
  transcript.forEach((msg) => {
    checkPageOverflow(50);
    
    const speaker = msg.sender_type === 'user' ? 'You' : 'Persona';
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(msg.sender_type === 'user' ? 34 : 80, msg.sender_type === 'user' ? 97 : 80, msg.sender_type === 'user' ? 73 : 80);
    doc.text(`[${speaker}]:`, margin, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    yPos = addWrappedText(msg.content, margin + 4, yPos, pageWidth - margin * 2 - 4, 5);
    yPos += 4;
    
    if (msg.interventionAfter) {
      checkPageOverflow(40);
      const intervention = msg.interventionAfter;
      
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(180, 140, 60);
      const toneLabel = intervention.coach_personality ? ` (${intervention.coach_personality})` : '';
      doc.text(`Mind Mastery Coach${toneLabel}:`, margin + 8, yPos);
      yPos += 5;
      
      if (intervention.meta_skill_target) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        const subSkillLabel = intervention.sub_skill_target ? ` → ${intervention.sub_skill_target}` : '';
        doc.text(`Meta Skill: ${intervention.meta_skill_target}${subSkillLabel}`, margin + 12, yPos);
        yPos += 5;
      }
      
      if (intervention.observation) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(80);
        yPos = addWrappedText(intervention.observation, margin + 12, yPos, pageWidth - margin * 2 - 16, 5);
        yPos += 3;
      }
      
      if (intervention.action_suggested) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(34, 97, 73);
        doc.text('Action:', margin + 12, yPos);
        yPos += 4;
        doc.setFont('helvetica', 'normal');
        yPos = addWrappedText(intervention.action_suggested, margin + 16, yPos, pageWidth - margin * 2 - 20, 5);
        yPos += 3;
      }
      
      if (intervention.framework_used) {
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        doc.text(`Framework: ${intervention.framework_used}`, margin + 12, yPos);
        yPos += 4;
        
        if (intervention.wisdom_source?.quote) {
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(120);
          const quoteText = `"${intervention.wisdom_source.quote}"`;
          const attribution = intervention.wisdom_source.attribution ? ` — ${intervention.wisdom_source.attribution}` : '';
          yPos = addWrappedText(quoteText + attribution, margin + 16, yPos, pageWidth - margin * 2 - 20, 5);
        }
        yPos += 3;
      }
      
      yPos += 4;
    }
    
    yPos += 3;
  });

  // Footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 12;
    doc.setDrawColor(200);
    doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('Mind Module - Dialogue Room', margin, footerY);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2 - 10, footerY);
  }

  const filename = `dialogue-transcript-${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
};
