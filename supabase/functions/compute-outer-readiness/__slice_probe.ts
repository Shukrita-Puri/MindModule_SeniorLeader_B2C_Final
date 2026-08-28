export function makeValidator() {
          const WELLNESS_BLACKLIST =
            /\b(relax|mindful|breathe|calm|wellness|self-care|journey|nourish|recharge|restore|genuine|authentic|hardware|biometric|machine|device)\b/i;
          // Forbid em dash (—) and en dash (–) used as sentence breaks. We allow numeric ranges like "0–2" / "2-3"
          // but reject any dash surrounded by letters or whitespace, which is the typographic clause break.
          const DASH_BREAK = /(?:\s[—–]\s|[A-Za-z]\s*[—–]\s*[A-Za-z])/;
          // Allow compound words like "high-stakes", "high-pressure", "low-energy" — only reject standalone tier words
          const TIER_BLACKLIST = /\b(moderate|high|low|strong)\b(?![-‑])/i;
          const READINESS_WORD = /\breadiness\b/i;

          // §2.18 Phrase Priority Weight: forbidden openers + coaching imperatives
          const PHRASE_FORBIDDEN_OPENER = /^(you|your|the)\b/i;
          const COACHING_IMPERATIVE =
            /\b(you should|you need to|try to|consider|make sure|remember to)\b/i;

          // §2.20 Elastic Lexicon clusters — body must contain ≥1 cluster concept.
          // Word lists are SSOT'd in _shared/brief/elastic-lexicon.ts and shared
          // with the atomic validator + the LLM prompt's LEXICON ANCHOR block.
          // buildLexiconRegex produces the exact same alternations these
          // literals used before — no rule or threshold change.
          const LEXICON_COGNITION = buildLexiconRegex(
            INLINE_LEXICON_WORDS.cognition,
          );
          const LEXICON_PHYSIOLOGY = buildLexiconRegex(
            INLINE_LEXICON_WORDS.physiology,
          );
          const LEXICON_RESILIENCE = buildLexiconRegex(
            INLINE_LEXICON_WORDS.resilience,
          );
          // Executive-context cluster (additive) — CEO-behaviour-driven copy
          // grounded in the leader's day: board room, travel, high-stakes work.
          const LEXICON_EXECUTIVE_CONTEXT = buildLexiconRegex(
            INLINE_LEXICON_WORDS.executiveContext,
          );

          // Approved state-quality words (additive Signal-Evidence acceptance).
          // Natural executive prose that names grounded state without raw
          // numbers should still pass body_no_signal_evidence.
          const STATE_QUALITY_WORDS =
            /\b(recovery|sleep|rested|fatigued|sharp|foggy|drained|steady|compressed|elevated|shifted|heavy|light|loaded)\b/i;
          // §2.22 Calendar-empty whitelist
          const BASELINE_LEXICON =
            /\b(base[- ]?level|baseline intelligence|stabili[sz]ing|base for future load|hold the base)\b/i;

          // §2.19.1 Pattern-relevance gate: if pattern keywords used, require today-context anchor
          const PATTERN_KEYWORDS =
            /\b(previously|pattern|last\s+\d|consistently|spiked in|in your last|every|recurring)\b/i;

          // SSOT four-beat validator. Do not create a third validator.

          function validateV61Output(
            parsed: any,
            phraseText: string | null,
            bodyTextStr: string | null,
            opts: { strict?: boolean } = {},
          ): { valid: boolean; reason: string; softReject?: boolean } {
            // Phrase validation
            if (!phraseText) return { valid: false, reason: "phrase_missing" };
            if (WELLNESS_BLACKLIST.test(phraseText)) {
              return { valid: false, reason: "phrase_wellness_word" };
            }
            if (DASH_BREAK.test(phraseText)) {
              return { valid: false, reason: "phrase_em_dash" };
            }
            if (TIER_BLACKLIST.test(phraseText)) {
              return { valid: false, reason: "phrase_tier_word" };
            }
            if (READINESS_WORD.test(phraseText)) {
              return { valid: false, reason: "phrase_readiness_word" };
            }
            if (PHRASE_FORBIDDEN_OPENER.test(phraseText.trim())) {
              return { valid: false, reason: "phrase_forbidden_opener" };
            }
            if (COACHING_IMPERATIVE.test(phraseText)) {
              return { valid: false, reason: "phrase_coaching_imperative" };
            }

            // §2.18 Phrase length (loosened): 2–4 words accepted, 5 words
            // soft-reject (retry once with stricter instruction), 6+ hard-reject.
            // Many valid CoS phrases are naturally 4 words.
            const phraseWords = phraseText.trim().replace(/[.!?,;:]/g, "")
              .split(/\s+/).filter(Boolean);
            if (phraseWords.length >= 6) {
              return {
                valid: false,
                reason: `phrase_hard_reject_${phraseWords.length}w`,
              };
            }
            if (phraseWords.length === 5 && !opts.strict) {
              return {
                valid: false,
                reason: "phrase_soft_reject_5w",
                softReject: true,
              };
            }

            const GENERIC_PHRASE =
              /\b(awareness|prevents?|regrets?|future|potential|inner|strength|power|courage|deserve|believe|transform|unlock|embrace|overcome|thrive)\b/i;
            if (
              GENERIC_PHRASE.test(phraseText) && !/\d/.test(phraseText) &&
              !todayHighStakes.some((e: string) =>
                phraseText!.toLowerCase().includes(
                  e.trim().toLowerCase().slice(0, 10),
                )
              )
            ) {
              return { valid: false, reason: "phrase_generic_motivational" };
            }

            // Body validation
            if (!bodyTextStr) return { valid: false, reason: "body_missing" };
            if (READINESS_WORD.test(bodyTextStr)) {
              return { valid: false, reason: "body_readiness_word" };
            }
            if (WELLNESS_BLACKLIST.test(bodyTextStr)) {
              return { valid: false, reason: "body_wellness_or_hardware_word" };
            }
            if (DASH_BREAK.test(bodyTextStr)) {
              return { valid: false, reason: "body_em_dash" };
            }
            const strippedBody = bodyTextStr.replace(/<[^>]+>/g, "");
            const wordCount = strippedBody.split(/\s+/).length;
            // v6.4 — body is visible analysis, four beat-weighted beats,
            // hard cap 60 words (target 45–55). The work directive (beat c)
            // is the most load-bearing beat and needs room to be specific;
            // self-regulation (beat d) is a 3–6 word closing clause.
            if (wordCount > 60) {
              return { valid: false, reason: `body_too_long_${wordCount}w` };
            }

            // v2.1 — body must not echo any of the 5 one-line score reads verbatim.
            const ONE_LINE_READS: string[] = [
              "full strength - go after it",
              "full strength — go after it",
              "ready and clear",
              "holding the line - solid, not your peak",
              "holding the line — solid, not your peak",
              "running on reserves - pick your battles",
              "running on reserves — pick your battles",
              "running on empty - today's about protecting yourself",
              "running on empty — today's about protecting yourself",
            ];
            const bodyLowerNorm = strippedBody.toLowerCase();
            for (const r of ONE_LINE_READS) {
              if (bodyLowerNorm.includes(r.toLowerCase())) {
                return { valid: false, reason: "body_restates_one_line_read" };
              }
            }
            if (
              materialTravelContextActive &&
              !MATERIAL_TRAVEL_BODY_RX.test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_omits_material_travel_context",
              };
            }
            if (
              materialTravelContextActive && materialWorkEventTitles.length > 0
            ) {
              const significantWorkTokenMentioned = materialWorkEventTitles
                .some((title) => {
                  const tokens = String(title || "")
                    .toLowerCase()
                    .split(/[^a-z0-9]+/)
                    .filter((token) =>
                      token.length >= 4 &&
                      !["with", "from", "today", "review", "meeting"].includes(
                        token,
                      )
                    );
                  return tokens.some((token) => bodyLowerNorm.includes(token));
                });
              if (!significantWorkTokenMentioned) {
                return {
                  valid: false,
                  reason: "body_omits_material_work_context",
                };
              }
            }

            // v2.1 — abstract system phrases banned in body.
            const ABSTRACT_SYSTEM_PHRASES = [
              "come down clean",
              "hold the base",
              "mask the surge",
              "optimise the window",
              "optimize the window",
              "leverage your physiological runway",
            ];
            for (const p of ABSTRACT_SYSTEM_PHRASES) {
              if (bodyLowerNorm.includes(p)) {
                return { valid: false, reason: "body_abstract_system_phrase" };
              }
            }

            // v2.1 — body must not restate the phrase verbatim.
            if (phraseText) {
              const phraseNorm = phraseText.trim().toLowerCase().replace(
                /[.!?,;:"']/g,
                "",
              );
              if (
                phraseNorm.length >= 6 && bodyLowerNorm.includes(phraseNorm)
              ) {
                return { valid: false, reason: "body_restates_phrase" };
              }
            }

            // v2.1 — light non-repetition check: reject any repeated 4-word run.
            {
              const tokens = bodyLowerNorm
                .replace(/[.,;:!?"'()]/g, " ")
                .split(/\s+/)
                .filter(Boolean);
              const seen = new Set<string>();
              for (let i = 0; i + 4 <= tokens.length; i++) {
                const gram = tokens.slice(i, i + 4).join(" ");
                if (seen.has(gram)) {
                  return { valid: false, reason: "body_repeated_4gram" };
                }
                seen.add(gram);
              }
            }

            // §2.19.5 RULE 1 — body must not restate the numeric score or tier label
            // Forbidden patterns: "31/100", "score of 31", "31 out of 100", "your score is", "low/high readiness score"
            if (/\b\d{1,3}\s*\/\s*100\b/.test(strippedBody)) {
              return { valid: false, reason: "body_restates_score_xx_100" };
            }
            if (
              /\b(score\s+(of|is)|your\s+score|readiness\s+score)\b/i.test(
                strippedBody,
              )
            ) return { valid: false, reason: "body_restates_score_phrase" };
            if (/\b\d{1,3}\s+out\s+of\s+100\b/i.test(strippedBody)) {
              return { valid: false, reason: "body_restates_score_out_of_100" };
            }
            // 2026-07-11 — tightened after "Readiness sits at 79" leaked. Cover
            // conversational score restatements the earlier regexes missed:
            //   "Readiness sits at 79", "score reads 79", "you're at 79",
            //   "sitting at 79", "coming in at 79", "landing at 79".
            if (
              /\breadiness\s+(sits\s+at|reads|is\s+at|at|stands\s+at|came\s+in\s+at)\s+\d{1,3}\b/i
                .test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_restates_readiness_sits_at",
              };
            }
            if (
              /\bscore\s+(sits\s+at|reads|came\s+in\s+at|stands\s+at)\s+\d{1,3}\b/i
                .test(strippedBody)
            ) {
              return { valid: false, reason: "body_restates_score_reads" };
            }
            if (
              /\b(you(?:'re| are)\s+at|sitting\s+at|landing\s+at|coming\s+in\s+at)\s+\d{1,3}\b(?!\s*(?:am|pm|o'clock|min|hour|h\b|%))/i
                .test(strippedBody)
            ) {
              return {
                valid: false,
                reason: "body_restates_conversational_score",
              };
            }
            // Tier label restatement (e.g. "you're depleted today", "in peak today")
            if (
              /\b(you(?:'re|\sare)\s+(depleted|managing|strong|peak)|(?:in|at)\s+(depleted|managing|strong|peak)\s+(?:state|tier|today))\b/i
                .test(strippedBody)
            ) {
              return { valid: false, reason: "body_restates_tier_label" };
            }

            // §2.19.5 RULE 2 — body must not be a data list (≥2 metric qualifiers in close proximity)
            // Match patterns like "HRV down 20%", "RHR -18%", "sleep 6h", "HRV is 20% below"
            const metricPattern =
              /\b(HRV|RHR|HR|sleep|bpm)\b[^.,;]{0,40}?(\d+\s*(%|h\b|hr|hrs|hours?|bpm|min)|\d+\s*(?:%|h\b)\s*(?:below|above|under|over|down|up))/gi;
            const metricMatches = strippedBody.match(metricPattern) || [];
            if (metricMatches.length >= 2) {
              return {
                valid: false,
                reason: `body_metric_list_${metricMatches.length}`,
              };
            }

            // §2.19 Signal Evidence — number OR named event
            const hasNumberOrEvent = /\d/.test(strippedBody) ||
              (todayHighStakes.length > 0 &&
                todayHighStakes.some((e: string) =>
                  strippedBody.toLowerCase().includes(
                    e.trim().toLowerCase().slice(0, 12),
                  )
                ));
            // Calendar-empty path: also accept if Baseline Intelligence lexicon is present
            const isCalendarEmpty = todayHighStakes.length === 0 &&
              (calendarLoad === "low" || !calendarLoad);
            const baselineOK = isCalendarEmpty &&
              BASELINE_LEXICON.test(strippedBody);

            if (!hasNumberOrEvent && !baselineOK) {
              // Fallback to legacy data-vocab check to keep cold-start days valid
              const hasLegacyDataRef =
                /\b(HRV|RHR|HR|bpm|hrs?|hours?|sleep|baseline|pattern|streak|consecutive|archetype|goal|coach|meetings?|calendar|clarity|confidence|composure|sharpness|energy)\b/i
                  .test(strippedBody);
              // Additive loosening: also accept natural state-quality prose
              // ("recovery was short", "afternoon is heavy") without raw metrics.
              const hasStateQuality = STATE_QUALITY_WORDS.test(strippedBody);
              if (!hasLegacyDataRef && !hasStateQuality) {
                return { valid: false, reason: "body_no_signal_evidence" };
              }
            }

            // §2.20 Elastic Lexicon — body must contain ≥1 cluster concept
            // (cognition / physiology / resilience / executive-context), or
            // baseline lexicon when calendar-empty. Executive-context is
            // additive to support CEO-behaviour-driven copy.
            const hasLexicon = LEXICON_COGNITION.test(strippedBody) ||
              LEXICON_PHYSIOLOGY.test(strippedBody) ||
              LEXICON_RESILIENCE.test(strippedBody) ||
              LEXICON_EXECUTIVE_CONTEXT.test(strippedBody) || baselineOK;
            if (!hasLexicon) {
              return { valid: false, reason: "body_no_lexicon_cluster" };
            }

            // §2.19.1 Pattern-relevance gate: if pattern reference used, require today-signal AND today-context anchor
            if (PATTERN_KEYWORDS.test(strippedBody)) {
              const hasTodaySignal = /\d/.test(strippedBody);
              const hasTodayContext = todayHighStakes.some((e: string) =>
                strippedBody.toLowerCase().includes(
                  e.trim().toLowerCase().slice(0, 8),
                )
              ) ||
                /\b(today|tonight|this morning|this afternoon|this evening|now)\b/i
                  .test(strippedBody);
              if (!hasTodaySignal || !hasTodayContext) {
                return { valid: false, reason: "body_pattern_irrelevant" };
              }
            }

            // ── MRS Band-Gate (deterministic valence check) ──
            // Hard-reject bodies whose tone contradicts the canonical band.
            // Lists are intentionally short and high-confidence to avoid false
            // positives. Source of truth: bandValenceDirective() in
            // _shared/brief/copy-vocabulary.ts and resolveBand() in
            // compute-inner-readiness/index.ts.
            if (bandValence) {
              const _b = strippedBody.toLowerCase();
              const PUSH_TONE = [
                "push hard",
                "go after the day",
                "lead the charge",
                "spend the edge",
                "open the room",
                "own the room",
                "go after them",
                "front of the room",
              ];
              const PROTECT_TONE = [
                "protect yourself",
                "pull back",
                "do less today",
                "conserve your",
                "guard your reserves",
                "sit it out",
                "hold back today",
              ];
              const IMPROVE_SCORE =
                /\b(raise|lift|boost|improve|fix)\s+(your\s+)?(score|readiness|number)\b/i;
              if (IMPROVE_SCORE.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_prescribes_score_improvement",
                };
              }
              if (
                bandValence === "low" && PUSH_TONE.some((p) => _b.includes(p))
              ) {
                return {
                  valid: false,
                  reason: "body_valence_mismatch_low_push",
                };
              }
              if (
                bandValence === "high" &&
                PROTECT_TONE.some((p) => _b.includes(p))
              ) {
                return {
                  valid: false,
                  reason: "body_valence_mismatch_high_protect",
                };
              }
            }

            if (bodyTextStr.includes("**") || bodyTextStr.includes("* ")) {
              return { valid: false, reason: "body_asterisks" };
            }

            // 2026-07-11 — Time-of-day framing gate. Prevents morning framing
            // ("Anchor the first hour") landing in the evening and vice
            // versa. `hour` is captured from the outer request scope.
            {
              const _tw: "morning" | "afternoon" | "evening" = hour < 12
                ? "morning"
                : hour < 18
                ? "afternoon"
                : "evening";
              const MORNING_PHRASES =
                /\b(first hour|start (?:of )?the day|morning block|front[- ]load(?:ing)? the morning|set the day|begin with|opening hours|open the day)\b/i;
              const EVENING_PHRASES =
                /\b(close (?:out )?the day|protect the evening|tonight|wind down|winding down|tomorrow morning|before sleep|before bed)\b/i;
              if (_tw === "evening" && MORNING_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_morning_framing_in_evening",
                };
              }
              if (_tw === "morning" && EVENING_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_evening_framing_in_morning",
                };
              }
            }

            // 2026-07-11 — False-neutrality gate. When physiological /
            // cognitive signals disagree (MASKED_HIGH or RECOVERY_UNDERWAY),
            // the body must not claim the day is neutral or that nothing is
            // standing out. `divergenceMode` is captured from the outer
            // request scope.
            if (divergenceMode && divergenceMode !== "ALIGNED") {
              const NEUTRAL_PHRASES =
                /\b(neutral day|no\s+(?:single\s+)?signal\s+dominat|evenly balanced|nothing\s+(?:is\s+)?(?:standing\s+out|dominant|clear))\b/i;
              if (NEUTRAL_PHRASES.test(strippedBody)) {
                return {
                  valid: false,
                  reason: "body_false_neutrality_when_divergent",
                };
              }
            }

            // LeanOn/WatchFor validation
            const validateItems = (items: any[], label: string) => {
              if (!Array.isArray(items) || items.length === 0) {
                return { valid: false, reason: `${label}_missing_or_empty` };
              }
              for (const item of items) {
                if (
                  typeof item?.signal !== "string" ||
                  typeof item?.source !== "string"
                ) return { valid: false, reason: `${label}_missing_field` };
                const signal = item.signal.trim();
                const source = item.source.trim();
                if (!signal || !source) {
                  return { valid: false, reason: `${label}_missing_field` };
                }
                if (signal.split(/\s+/).length > 10) {
                  return {
                    valid: false,
                    reason: `${label}_too_long_${signal.split(/\s+/).length}w`,
                  };
                }
                if (signal.length > 60) {
                  return { valid: false, reason: `${label}_too_wide` };
                }
                if (WELLNESS_BLACKLIST.test(signal)) {
                  return { valid: false, reason: `${label}_bad_vocabulary` };
                }
                if (DASH_BREAK.test(signal)) {
                  return { valid: false, reason: `${label}_em_dash` };
                }

                // §2.18.5 Source must be ARCHETYPE | PATTERN | GOALS (COACH retired)
                const sourceUpper = source.toUpperCase();
                if (
                  !["ARCHETYPE", "PATTERN", "GOALS"].includes(
                    sourceUpper,
                  )
                ) {
                  return {
                    valid: false,
                    reason: `${label}_invalid_source_${sourceUpper}`,
                  };
                }

                // §2.18.5 Generic-trait blocklist (no source exception — COACH retired)
                const GENERIC_TRAIT =
                  /\b(self[- ]?honesty|self[- ]?awareness|self[- ]?discernment|discernment|alignment|conviction strength|execution confidence|clear direction)\b/i;
                if (GENERIC_TRAIT.test(signal)) {
                  return { valid: false, reason: `${label}_generic_trait` };
                }

                // v6.2: substring-overlap rule removed. It formed a trap with the
                // generic-trait gate (forced LLM into trait words → trait blocked →
                // fallback). Body↔Lean On overlap is now a soft signal — log only.
                if (bodyTextStr) {
                  const bodyLower = bodyTextStr.replace(/<[^>]+>/g, "")
                    .toLowerCase();
                  const signalLower = signal.toLowerCase();
                  if (
                    signalLower.length >= 8 && bodyLower.includes(signalLower)
                  ) {
                    console.log(
                      `[validator-soft] ${label} overlaps body, allowed but flagged`,
                    );
                  }
                }
              }
              return null;
            };
            const leanOnValidation = validateItems(parsed.leanOn, "leanOn");
            if (leanOnValidation) return leanOnValidation;
            const watchForValidation = validateItems(
              parsed.watchFor,
              "watchFor",
            );
            if (watchForValidation) return watchForValidation;
            return { valid: true, reason: "" };
          }
 return validateV61Output; }