/**
 * App Store Review Guideline 3.1.1 — server-side purchase guard.
 *
 * Apple forbids the iOS/iPadOS app from opening ANY non-Apple purchase flow,
 * including a Stripe Checkout page or a Stripe billing portal that can be used
 * to buy or change a plan. The client hides every such CTA
 * (src/config/purchasePlatform.ts), but a stale binary, a deep link, or a
 * hand-crafted request must not be able to reach those flows either.
 *
 * Detection is best-effort and deliberately fail-OPEN for unknown callers:
 * a missing or forged platform signal can only ever DENY an iOS purchase, and
 * never grants entitlement. Web browsers (including Safari on iOS at
 * app.mindmodule.me) are unaffected — only the native Capacitor shell is
 * blocked, which is exactly the surface Apple reviews.
 */

/** Header the app attaches to every edge-function call (authTokenService). */
const PLATFORM_HEADER = "x-mm-client-platform";
/** Header supabase-js sets automatically on native runtimes. */
const SUPABASE_PLATFORM_HEADER = "x-supabase-client-platform";

export function isIosNativeCaller(req: Request): boolean {
  const mm = (req.headers.get(PLATFORM_HEADER) || "").toLowerCase();
  if (mm === "native-ios" || mm === "ios") return true;
  // An explicit web declaration is trusted: the browser build legitimately
  // needs Stripe, and a native shell never sends "web".
  if (mm === "web") return false;

  const supa = (req.headers.get(SUPABASE_PLATFORM_HEADER) || "").toLowerCase();
  if (supa === "ios") return true;

  // Fallback for older builds that predate the platform header: the Capacitor
  // WKWebView user agent carries both an Apple device token and the app's
  // native marker. Plain mobile Safari does NOT match, so web stays working.
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const isAppleDevice = ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod");
  const isNativeShell = ua.includes("capacitor") || ua.includes("mindmodule");
  return isAppleDevice && isNativeShell;
}

/**
 * Returns a 403 Response when the caller is the native iOS shell, otherwise
 * null. Call this immediately after authentication in any function that can
 * open an external purchase or billing surface.
 */
export function rejectIosPurchaseFlow(
  req: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!isIosNativeCaller(req)) return null;
  return new Response(
    JSON.stringify({
      error: "Purchases and billing changes in the iOS app must go through Apple.",
      code: "ios_requires_iap",
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}