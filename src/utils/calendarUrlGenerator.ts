// Calendar URL Generator Utility
// Generates deep links for Google Calendar, Outlook 365, and ICS file downloads

interface CalendarEvent {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
}

// Format date for Google Calendar (YYYYMMDDTHHmmssZ format)
const formatGoogleDate = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

// Format date for Outlook (ISO format)
const formatOutlookDate = (date: Date): string => {
  return date.toISOString();
};

// Format date for ICS file (YYYYMMDDTHHmmssZ format)
const formatIcsDate = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

// Generate Google Calendar URL
export const generateGoogleCalendarUrl = (event: CalendarEvent): string => {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(event.startDate)}/${formatGoogleDate(event.endDate)}`,
    details: event.description || '',
    location: event.location || '',
  });
  
  return `${baseUrl}?${params.toString()}`;
};

// Generate Outlook 365 URL (using outlook.office.com for reliability)
export const generateOutlook365Url = (event: CalendarEvent): string => {
  const baseUrl = 'https://outlook.office.com/calendar/0/deeplink/compose';
  const params = new URLSearchParams({
    subject: event.title,
    body: event.description || '',
    startdt: formatOutlookDate(event.startDate),
    enddt: formatOutlookDate(event.endDate),
    location: event.location || '',
    path: '/calendar/action/compose',
    rru: 'addevent',
  });
  
  return `${baseUrl}?${params.toString()}`;
};

// Generate ICS file content and trigger download
export const downloadIcsFile = (event: CalendarEvent): void => {
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Mind Module//Dialogue Practice//EN
BEGIN:VEVENT
DTSTART:${formatIcsDate(event.startDate)}
DTEND:${formatIcsDate(event.endDate)}
SUMMARY:${event.title}
DESCRIPTION:${event.description?.replace(/\n/g, '\\n') || ''}
LOCATION:${event.location || ''}
END:VEVENT
END:VCALENDAR`;

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.title.toLowerCase().replace(/\s+/g, '-')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Create default practice session event (tomorrow at 9am, 30 min)
export const createDefaultPracticeEvent = (scenarioTitle?: string): CalendarEvent => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  
  const endTime = new Date(tomorrow);
  endTime.setMinutes(endTime.getMinutes() + 30);
  
  return {
    title: scenarioTitle ? `Dialogue Practice: ${scenarioTitle}` : 'Dialogue Practice Session',
    description: 'Continue developing your communication skills with another practice session in the Dialogue Room.',
    startDate: tomorrow,
    endDate: endTime,
  };
};
