
# Seed sanctuary_content Table for Mastery Plan Regulate Module

## Problem

The `generate-mastery-plan` edge function correctly implements the full Mastery Practice architecture (Regulate / Align / Prepare / Integrate modules, theme-to-module mapping, time-of-day logic, evening close). However, it queries the `sanctuary_content` database table for content -- and that table has **zero rows**.

The content displayed on `/recalibrate` pages comes from a **client-side** file (`src/data/practicesAndSoundscapes.ts`, 1831 lines, ~35+ items). The edge function cannot see this client-side data. This is why the Evening Close shows no Regulate practice -- there is nothing for `selectContent()` to select from.

## Design Intent Confirmation

The edge function **does** contain the full design intent:
- Module ordering: Regulate -> Align -> Prepare -> Integrate
- Evening sessions: Regulate + Integrate (coach card), with Align/Prepare suppressed unless high-priority next-day event
- Time-of-day session labels (Morning Practice / Afternoon Reset / Evening Close)
- Duration ceilings by calendar load
- Content scoring with favourites, coach insights, effectiveness, intensity matching, and date-seeded deterministic selection
- Theme-to-module mapping for all 40 theme phrases across 4 tiers

The architecture is complete. The only gap is **empty content in the database**.

## Solution

Seed the `sanctuary_content` table with all content from the client-side `practicesAndSoundscapes.ts` file. This includes:

- **~10 soundbaths** (pause/power-up/presence categories)
- **~6 guided practices** (breathing, somatic, grounding)
- **~25 micro-practices** (mindset and tool sub-types)

Each row will include: `id`, `title`, `content_type`, `category`, `tags`, `duration`, `sub_type`, `difficulty`, `protocol_type`, `thumbnail_url`, `is_active = true`.

## Steps

1. **Insert all content into `sanctuary_content`** using the data insert tool -- mapping fields from the client-side TypeScript objects to the DB columns (`contentType` -> `content_type`, `storyHook` -> `story_hook`, etc.)

2. **Insert structured tags into `sanctuary_content_metadata`** for content items that have `structuredTags` defined, so the edge function's metadata merge logic works correctly.

3. **Verify** the edge function can now select Regulate content for evening sessions by testing the function.

## Technical Details

Column mapping from `practicesAndSoundscapes.ts` to `sanctuary_content` table:

```text
Client Field        -> DB Column
id                  -> id
title               -> title
contentType         -> content_type
category            -> category
tags                -> tags (text array)
duration            -> duration (numeric, in minutes)
difficulty          -> difficulty
subType             -> sub_type
voice               -> voice
thumbnail (URL)     -> thumbnail_url
audioSrc            -> audio_url
steps count         -> steps_count
creator             -> creator
origin              -> origin
storyHook           -> story_hook
usedBy              -> used_by
is_active           -> true (all active)
```

For `sanctuary_content_metadata`:
```text
content_id          -> id from sanctuary_content
structured_tags     -> structuredTags as JSONB
mastery_category    -> derived from structuredTags.pillar
```

No schema changes required -- both tables already exist with the correct columns.
