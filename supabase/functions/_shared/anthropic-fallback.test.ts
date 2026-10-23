// Tests for callAIText fallback hardening: while the Anthropic account has
// no credit balance (or times out / 5xxs), calls must fall back to the
// Lovable AI gateway instead of throwing an unhandled exception.
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callAIText } from "./anthropic.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function gatewayOk(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: "stop" }],
      model: "google/gemini-3.1-flash-lite",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function withEnv(fn: () => Promise<void>): Promise<void> {
  Deno.env.set("WRITING_PROVIDER", "anthropic");
  Deno.env.set("ANTHROPIC_API_KEY", "test-key");
  Deno.env.set("LOVABLE_API_KEY", "test-key");
  return fn().finally(() => {
    Deno.env.delete("WRITING_PROVIDER");
    Deno.env.delete("ANTHROPIC_API_KEY");
    Deno.env.delete("LOVABLE_API_KEY");
  });
}

const baseParams = {
  messages: [{ role: "user", content: "hello" }],
  max_tokens: 32,
};

Deno.test("callAIText falls back to gateway on Anthropic 402 credits", () =>
  withEnv(async () => {
    const fetchImpl = (url: string, _init: RequestInit): Promise<Response> => {
      if (url === ANTHROPIC_URL) {
        return Promise.resolve(
          new Response("credit balance is too low", { status: 402 }),
        );
      }
      return Promise.resolve(gatewayOk("gateway-copy"));
    };
    const text = await callAIText({ ...baseParams, fetchImpl });
    assertEquals(text, "gateway-copy");
  }));

Deno.test("callAIText falls back to gateway on Anthropic 400 credit-balance", () =>
  withEnv(async () => {
    const fetchImpl = (url: string, _init: RequestInit): Promise<Response> => {
      if (url === ANTHROPIC_URL) {
        return Promise.resolve(
          new Response("Your credit balance is too low to access the API", { status: 400 }),
        );
      }
      return Promise.resolve(gatewayOk("gateway-copy-400"));
    };
    const text = await callAIText({ ...baseParams, fetchImpl });
    assertEquals(text, "gateway-copy-400");
  }));

Deno.test("callAIText falls back to gateway on Anthropic timeout/abort", () =>
  withEnv(async () => {
    const fetchImpl = (url: string, _init: RequestInit): Promise<Response> => {
      if (url === ANTHROPIC_URL) {
        return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
      }
      return Promise.resolve(gatewayOk("gateway-copy-abort"));
    };
    const text = await callAIText({ ...baseParams, fetchImpl });
    assertEquals(text, "gateway-copy-abort");
  }));

Deno.test("callAIText falls back to gateway on Anthropic 5xx", () =>
  withEnv(async () => {
    const fetchImpl = (url: string, _init: RequestInit): Promise<Response> => {
      if (url === ANTHROPIC_URL) {
        return Promise.resolve(new Response("overloaded", { status: 503 }));
      }
      return Promise.resolve(gatewayOk("gateway-copy-503"));
    };
    const text = await callAIText({ ...baseParams, fetchImpl });
    assertEquals(text, "gateway-copy-503");
  }));

Deno.test("callAIText still throws on non-operational Anthropic 400", () =>
  withEnv(async () => {
    const fetchImpl = (url: string, _init: RequestInit): Promise<Response> => {
      if (url === ANTHROPIC_URL) {
        return Promise.resolve(new Response("invalid model name", { status: 400 }));
      }
      return Promise.resolve(gatewayOk("should-not-reach"));
    };
    const err = await assertRejects(() => callAIText({ ...baseParams, fetchImpl }));
    assertEquals((err as { status?: number }).status, 400);
  }));
