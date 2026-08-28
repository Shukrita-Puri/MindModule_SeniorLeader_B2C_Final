import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { enrichEvent } from "./enrich-event.ts";

const testCases = [
  { title: "Mind Module - Beta test feedback", expectedCat: "E", expectedSub: "deep_work", isOrganizer: true },
  { title: "Flight to Singapore (SQ 735)", expectedCat: "G", expectedSub: "flight", travelState: "travelling" },
  { title: "Chat with Patrick", expectedCat: "H", expectedSub: "social" },
  { title: "Sales Assumptions Founders Make", expectedCat: "E", expectedSub: "learning" },
  { title: "Intro Call > Isabel @ Karyon Partners", expectedCat: "E", expectedSub: "learning" },
  { title: "Cracking the US market + networking", expectedCat: "E", expectedSub: "learning" },
  { title: "Board Prep Test", expectedCat: "E", expectedSub: "deep_work" },
  { title: "Strategy Review Test", expectedCat: "E", expectedSub: "deep_work" },
  { title: "Chief AI Thursday connects", expectedCat: "E", expectedSub: "community" },
  { title: "Coca-Cola Client - Presentation", expectedCat: "B", expectedSub: "client_presentation" },
  { title: "[L'Oreal] Q2 Presentation", expectedCat: "C", expectedSub: "stakeholder_communication" },
  { title: "Pitch Deck - Review (Amazon)", expectedCat: "E", expectedSub: "deep_work" },
];

Deno.test("Schema Verification: 12 ground truth cases from FINAL_A_to_H_Schema_Summary.md", () => {
  for (const tc of testCases) {
    const raw: any = { title: tc.title };
    if (tc.isOrganizer !== undefined) raw.isOrganizer = tc.isOrganizer;
    if (tc.travelState !== undefined) raw.travelState = tc.travelState;
    
    const result = enrichEvent(raw);
    assertEquals(
      result.categoryId,
      tc.expectedCat,
      `Failed category for "${tc.title}" - Expected ${tc.expectedCat}, got ${result.categoryId}`
    );
    assertEquals(
      result.subcategory,
      tc.expectedSub,
      `Failed subcategory for "${tc.title}" - Expected ${tc.expectedSub}, got ${result.subcategory}`
    );
  }
});
