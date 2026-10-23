// [KIND: configuration] [LAYER: audience] [TIERS: 3] [AUDIENCE: ceo]
// CEO Audience Pack Settings.
// Source: Spine Section 11 and Layer 5 Section 9.

export interface AudiencePackSettings {
  audienceId: "ceo";
  displayName: string;
  roleTerminology: {
    governanceBody: string;
    supervisoryLead: string;
    reportingTarget: string;
    operationalPeers: string;
    supportStaff: string;
  };
  loadThresholds: {
    heavyMeetingCount: number;
    heavyMeetingHours: number;
    backToBackChainGapMinutes: number;
    lightMeetingMaxCount: number;
  };
  guardrails: {
    dailyNudgeCap: number;
    defaultSendWindowStart: string; // "06:30"
    defaultSendWindowEnd: string;   // "21:00"
    respectWearableQuietHours: boolean;
  };
  weights: {
    wS: number; // Scheduled weight
    wU: number; // Unscheduled weight
  };
}

export const CEO_SETTINGS: AudiencePackSettings = {
  audienceId: "ceo",
  displayName: "Chief Executive Officer",
  roleTerminology: {
    governanceBody: "Board of Directors",
    supervisoryLead: "Board Chair / Lead Independent Director",
    reportingTarget: "Investors & Fiduciary Board",
    operationalPeers: "Executive Leadership Team (C-Suite)",
    supportStaff: "Chief of Staff & Executive Assistant",
  },
  loadThresholds: {
    heavyMeetingCount: 5,
    heavyMeetingHours: 6.0,
    backToBackChainGapMinutes: 15,
    lightMeetingMaxCount: 2,
  },
  guardrails: {
    dailyNudgeCap: 3,
    defaultSendWindowStart: "06:30",
    defaultSendWindowEnd: "21:00",
    respectWearableQuietHours: true,
  },
  weights: {
    wS: 0.6, // Scheduled events weight
    wU: 0.4, // Unscheduled demands weight (wS >= wU invariant maintained)
  },
};
