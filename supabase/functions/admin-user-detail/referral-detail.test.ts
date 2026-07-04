import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildReferralDetail } from "./referral-detail.ts";

Deno.test("buildReferralDetail keeps referral section optional when no record exists", () => {
  assertEquals(
    buildReferralDetail({
      referral_code_used: null,
      referral_code_entered_at: null,
    }, null),
    {
      ownReferralCode: null,
      referralLink: null,
      totalSignups: null,
      totalConversions: null,
      creditedMonths: null,
      referralCodeUsed: null,
      referralCodeEnteredAt: null,
    },
  );
});

Deno.test("buildReferralDetail returns available referral values when present", () => {
  assertEquals(
    buildReferralDetail({
      referral_code_used: "FRIEND42",
      referral_code_entered_at: "2026-07-05T10:00:00.000Z",
    }, {
      referral_code: "MM-ABC-123",
      referral_link: "https://app.mindmodule.me/ref/MM-ABC-123",
      total_signups: 4,
      total_conversions: 2,
      credited_months: 2,
    }),
    {
      ownReferralCode: "MM-ABC-123",
      referralLink: "https://app.mindmodule.me/ref/MM-ABC-123",
      totalSignups: 4,
      totalConversions: 2,
      creditedMonths: 2,
      referralCodeUsed: "FRIEND42",
      referralCodeEnteredAt: "2026-07-05T10:00:00.000Z",
    },
  );
});

Deno.test("admin-user-detail no longer selects profiles.referral_code", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("profiles.referral_code"), false);
  assertEquals(source.includes(", referral_code,"), false);
});
