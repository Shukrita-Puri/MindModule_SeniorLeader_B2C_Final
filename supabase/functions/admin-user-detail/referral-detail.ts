type ProfileReferralFields = {
  referral_code_used?: string | null;
  referral_code_entered_at?: string | null;
};

type UserReferralRow = {
  referral_code?: string | null;
  referral_link?: string | null;
  total_signups?: number | null;
  total_conversions?: number | null;
  credited_months?: number | null;
} | null;

export function buildReferralDetail(
  profile: ProfileReferralFields,
  referral: UserReferralRow,
): Record<string, string | number | null> {
  return {
    ownReferralCode: referral?.referral_code ?? null,
    referralLink: referral?.referral_link ?? null,
    totalSignups: referral?.total_signups ?? null,
    totalConversions: referral?.total_conversions ?? null,
    creditedMonths: referral?.credited_months ?? null,
    referralCodeUsed: profile.referral_code_used ?? null,
    referralCodeEnteredAt: profile.referral_code_entered_at ?? null,
  };
}
