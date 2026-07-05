import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactUserId } from "./redact-user-id.ts";

Deno.test("redactUserId — deterministic for same input", () => {
  const a = redactUserId("auth0|abc123");
  const b = redactUserId("auth0|abc123");
  assertEquals(a, b);
});

Deno.test("redactUserId — different inputs produce different outputs", () => {
  const a = redactUserId("auth0|abc123");
  const b = redactUserId("auth0|abc124");
  assertNotEquals(a, b);
});

Deno.test("redactUserId — never emits raw input substring", () => {
  const raw = "auth0|verylongidentifier9876";
  const out = redactUserId(raw);
  if (out.includes("auth0") || out.includes("9876") || out.includes("verylong")) {
    throw new Error(`redacted value leaked raw substring: ${out}`);
  }
});

Deno.test("redactUserId — null/undefined/empty render as usr_none", () => {
  assertEquals(redactUserId(null), "usr_none");
  assertEquals(redactUserId(undefined), "usr_none");
  assertEquals(redactUserId(""), "usr_none");
});

Deno.test("redactUserId — output shape is usr_<8hex>", () => {
  const out = redactUserId("some-user-id");
  if (!/^usr_[0-9a-f]{8}$/.test(out)) {
    throw new Error(`unexpected shape: ${out}`);
  }
});
