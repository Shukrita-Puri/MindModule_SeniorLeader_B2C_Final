# Home-location popup
- [x] Replace shared top banner with Executive Home popup matching existing prompts.
- [x] Apply eight-week evidence, travel suppression, short-home-visit and cross-device dismissal rules.
- [x] Verify rule tests, isolated popup interactions, desktop/mobile layout and deployed endpoint authentication.
- [ ] Verify a real eligible account end-to-end on native devices; requires authenticated location history and iOS/Android device access.
- [x] Recheck all three action styles, simulated web/native resume flows, simulated saved-choice reloads and every 1–6-day home visit.
- [ ] Verify real cross-device saved-choice readback; blocked by unavailable authenticated account.
- [ ] Verify Android native location evidence; blocked by unimplemented Android location collection methods.

# Shadow domain wiring (Layers 0–5)
- [x] Wire L5_SIGNALS, L5_VOICE, L5_GUARDRAILS shadow runs into smart-nudges.
- [x] Wire SPINE_READ, SPINE_DAY_PROFILE, L5_VOICE shadow runs into compute-outer-readiness.
- [x] Deploy both functions; all 8 domain flags set to shadow in the backend.
- [ ] Observe live L5/SPINE parity entries; needs a run with qualified nudge candidates and a real Brief generation.
- [ ] Wire the remaining flags (L0_PARSERS_DOMAIN, L3_SELECTOR) into their functions; not yet read by any code.