import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isTwoPartyTitle, isConnectorTwoPartyTitle } from "./two-party-title.ts";

Deno.test("two-party titles are recognised without the 1:1 token", () => {
  for (const t of ["Shukrita Puri | Jane", "Shukrita Puri / Jane", "Rohit and Shukrita", "Rohit & Shukrita", "Jane <> Rohit"]) {
    assertEquals(isTwoPartyTitle(t), true, t);
  }
  for (const t of ["catch up with Jane", "catch-up with Jane", "touch base with Jane"]) {
    assertEquals(isConnectorTwoPartyTitle(t), true, t);
  }
});

Deno.test("social and group titles stay out of the 1:1 mapping", () => {
  for (const t of ["chit chat with Jane", "Team lunch", "All Hands", "Drinks with Jane", "Product / Roadmap review", "Q3 Board and Finance"]) {
    assertEquals(isTwoPartyTitle(t) || isConnectorTwoPartyTitle(t), false, t);
  }
});
