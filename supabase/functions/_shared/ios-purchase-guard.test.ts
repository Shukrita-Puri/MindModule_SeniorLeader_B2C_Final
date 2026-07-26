/**
 * Guideline 3.1.1 server guard — Deno unit tests.
 *
 * The guard must be aggressive enough to catch the native iOS shell (which is
 * what Apple reviews) and conservative enough never to break the web app,
 * including Safari on an iPhone at app.mindmodule.me.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isIosNativeCaller, rejectIosPurchaseFlow } from "./ios-purchase-guard.ts";

const req = (headers: Record<string, string>) =>
  new Request("https://example.test/", { method: "POST", headers });

Deno.test("blocks the native iOS shell via the app platform header", () => {
  assertEquals(isIosNativeCaller(req({ "x-mm-client-platform": "native-ios" })), true);
  assertEquals(isIosNativeCaller(req({ "x-mm-client-platform": "NATIVE-IOS" })), true);
});

Deno.test("blocks the native iOS shell via the supabase-js platform header", () => {
  assertEquals(isIosNativeCaller(req({ "x-supabase-client-platform": "ios" })), true);
});

Deno.test("blocks older iOS builds via the Capacitor user agent", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CapacitorHttp";
  assertEquals(isIosNativeCaller(req({ "user-agent": ua })), true);
});

Deno.test("allows native Android", () => {
  assertEquals(isIosNativeCaller(req({ "x-mm-client-platform": "native-android" })), false);
});

Deno.test("allows the web app declaring itself as web", () => {
  assertEquals(isIosNativeCaller(req({ "x-mm-client-platform": "web" })), false);
});

Deno.test("allows mobile Safari on iPhone (web Stripe must keep working)", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  assertEquals(isIosNativeCaller(req({ "user-agent": ua })), false);
});

Deno.test("allows desktop browsers with no platform signal", () => {
  assertEquals(isIosNativeCaller(req({})), false);
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36";
  assertEquals(isIosNativeCaller(req({ "user-agent": ua })), false);
});

Deno.test("a web declaration wins over an iPhone user agent", () => {
  // The web build always sends "web"; a Capacitor UA can never accompany it.
  const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Capacitor";
  assertEquals(
    isIosNativeCaller(req({ "x-mm-client-platform": "web", "user-agent": ua })),
    false,
  );
});

Deno.test("rejectIosPurchaseFlow returns 403 ios_requires_iap for iOS, null otherwise", async () => {
  const cors = { "Access-Control-Allow-Origin": "*" };
  const blocked = rejectIosPurchaseFlow(req({ "x-mm-client-platform": "native-ios" }), cors);
  assertEquals(blocked?.status, 403);
  const body = await blocked!.json();
  assertEquals(body.code, "ios_requires_iap");
  assertEquals(blocked!.headers.get("Access-Control-Allow-Origin"), "*");

  assertEquals(rejectIosPurchaseFlow(req({ "x-mm-client-platform": "web" }), cors), null);
});