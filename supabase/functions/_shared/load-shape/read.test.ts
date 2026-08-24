import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchLoadShape, fetchRenderableLoadShape } from "./read.ts";

function stubDb(result: { data?: unknown; error?: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain };
}

Deno.test("fetchLoadShape returns null on error, empty, or malformed jsonb", async () => {
  assertEquals(await fetchLoadShape(stubDb({ error: { message: "x" } }), "u", "2026-03-02"), null);
  assertEquals(await fetchLoadShape(stubDb({ data: [] }), "u", "2026-03-02"), null);
  assertEquals(
    await fetchLoadShape(stubDb({ data: [{ load_shape: null }] }), "u", "2026-03-02"),
    null,
  );
  assertEquals(
    await fetchLoadShape(stubDb({ data: [{ load_shape: { nope: 1 } }] }), "u", "2026-03-02"),
    null,
  );
});

Deno.test("fetchLoadShape returns the stored shape", async () => {
  const shape = { shapeId: "switching", modeSwitchCount: 4 };
  const got = await fetchLoadShape(
    stubDb({ data: [{ load_shape: shape }] }),
    "u",
    "2026-03-02",
    "morning",
  );
  assertEquals(got?.shapeId, "switching");
});

Deno.test("fetchRenderableLoadShape stays silent while the render gate is closed", async () => {
  const db = stubDb({ data: [{ load_shape: { shapeId: "back_to_back" } }] });
  assertEquals(await fetchRenderableLoadShape(db, "u", "2026-03-02"), null);
});
