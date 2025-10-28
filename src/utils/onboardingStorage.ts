// LocalStorage helpers for anonymous session management

export interface OnboardingSession {
  sessionId: string;
  currentStage: number;
  startedAt: string;
  responses: Record<string, any>;
}

const STORAGE_KEY = 'mind_module_onboarding';

export function initializeSession(): string {
  const existingSession = getSession();
  if (existingSession) {
    return existingSession.sessionId;
  }

  const sessionId = crypto.randomUUID();
  const newSession: OnboardingSession = {
    sessionId,
    currentStage: 1,
    startedAt: new Date().toISOString(),
    responses: {},
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
  return sessionId;
}

export function getSession(): OnboardingSession | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function updateSession(updates: Partial<OnboardingSession>) {
  const current = getSession();
  if (!current) return;

  const updated = { ...current, ...updates };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function saveResponse(questionKey: string, value: any) {
  const session = getSession();
  if (!session) return;

  session.responses[questionKey] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getResponse(questionKey: string): any {
  const session = getSession();
  return session?.responses[questionKey];
}

export function getAllResponses(): Record<string, any> {
  const session = getSession();
  return session?.responses || {};
}
