// Sprint 11 / Phase 9B — pure auth decision for travel-state-sync.
//
// travel-state-sync ships with `verify_jwt = false` because the cron
// dispatcher invokes it with the service-role bearer. That means the
// handler MUST authorize every request itself. This module isolates the
// decision so it can be unit-tested without spinning up an Auth0/JWT
// stack.
//
// Allowed callers:
//   • service — Authorization === `Bearer ${SERVICE_ROLE_KEY}` (dispatcher
//     or internal function-to-function call). May sync any user or scan all.
//   • admin   — verified Auth0 JWT whose email is in the admin allowlist.
//     May sync any user or scan all.
//   • self    — verified Auth0 JWT for a regular user. Must pass their own
//     sub in `body.userId` — single-user only. Multi-user scans are
//     forbidden for regular users.

export interface TravelSyncAuthInput {
  authHeader: string | null;
  serviceRoleKey: string;
  bodyUserId: string | null;
  callerSub: string | null;
  callerIsAdmin: boolean;
  /** True when the caller presented the pg_cron shared secret header. */
  cronSecretMatch?: boolean;
}


export type TravelSyncAuthDecision =
  | {
      allow: true;
      scope: "service" | "admin" | "self";
      /** If set, force single-user sync scoped to this userId. */
      forceSingleUserId: string | null;
    }
  | {
      allow: false;
      status: 401 | 403;
      reason:
        | "unauthenticated"
        | "forbidden_multi_user_scan"
        | "forbidden_other_user";
    };

export function decideTravelSyncAuth(
  input: TravelSyncAuthInput,
): TravelSyncAuthDecision {
  const { authHeader, serviceRoleKey, bodyUserId, callerSub, callerIsAdmin } = input;

  if (
    authHeader &&
    serviceRoleKey &&
    authHeader === `Bearer ${serviceRoleKey}`
  ) {
    return { allow: true, scope: "service", forceSingleUserId: bodyUserId };
  }

  if (!callerSub) {
    return { allow: false, status: 401, reason: "unauthenticated" };
  }

  if (callerIsAdmin) {
    return { allow: true, scope: "admin", forceSingleUserId: bodyUserId };
  }

  // Regular authenticated user: only self-sync, only single-user.
  if (!bodyUserId) {
    return { allow: false, status: 403, reason: "forbidden_multi_user_scan" };
  }
  if (bodyUserId !== callerSub) {
    return { allow: false, status: 403, reason: "forbidden_other_user" };
  }
  return { allow: true, scope: "self", forceSingleUserId: callerSub };
}
