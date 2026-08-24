// Ground-truth suite for the 12 verification cases in
// FINAL_A_to_H_Schema_Summary.md. These assert the canonical
// category + subcategory for each title through the single A–H entry
// point (enrichEvent → resolveEvent). Everything downstream — Brief,
// Pills, Plan, Nudges, Insights and the Load Shape layer — reads this
// output, so these cases are the ground truth for all of them.
//
// Do not weaken or delete a case: each one encodes a user-confirmed
// classification correction.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichEvent } from "./enrich-event.ts";

interface Case {
  title: string;
  category: string;
  subcategory: string;
  isOrganizer?: boolean;
  travelState?: string;
}

const CASES: Case[] = [
  { title: "Mind Module - Beta test feedback", category: "E", subcategory: "deep_work", isOrganizer: true },
  { title: "Flight to Singapore (SQ 735)", category: "G", subcategory: "flight", travelState: "travelling" },
  { title: "Chat with Patrick", category: "H", subcategory: "social" },
  { title: "Sales Assumptions Founders Make", category: "E", subcategory: "learning" },
  { title: "Intro Call > Isabel @ Karyon Partners", category: "E", subcategory: "learning" },
  { title: "Cracking the US market + networking", category: "E", subcategory: "learning" },
  { title: "Board Prep Test", category: "E", subcategory: "deep_work" },
  { title: "Strategy Review Test", category: "E", subcategory: "deep_work" },
  { title: "Chief AI Thursday connects", category: "E", subcategory: "community" },
  { title: "Coca-Cola Client - Presentation", category: "B", subcategory: "client_presentation" },
  { title: "[L'Oreal] Q2 Presentation", category: "C", subcategory: "stakeholder_communication" },
  { title: "Pitch Deck - Review (Amazon)", category: "E", subcategory: "deep_work" },
];

for (const c of CASES) {
  Deno.test(`schema verification — "${c.title}" → ${c.category}.${c.subcategory}`, () => {
    const e = enrichEvent({
      title: c.title,
      ...(c.isOrganizer !== undefined ? { isOrganizer: c.isOrganizer } : {}),
      ...(c.travelState !== undefined ? { travelState: c.travelState } : {}),
    });
    assertEquals(e.categoryId, c.category);
    assertEquals(e.subcategory, c.subcategory);
  });
}
