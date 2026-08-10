import { enrichEvent } from "./supabase/functions/_shared/events/enrich-event.ts";

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

for (const tc of testCases) {
  const result = enrichEvent({ title: tc.title, isOrganizer: tc.isOrganizer, travelState: tc.travelState });
  const passed = result.categoryId === tc.expectedCat && result.subcategory === tc.expectedSub;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] "${tc.title}"`);
  if (!passed) {
    console.log(`  Expected: ${tc.expectedCat}.${tc.expectedSub}, Got: ${result.categoryId}.${result.subcategory}`);
  }
}
