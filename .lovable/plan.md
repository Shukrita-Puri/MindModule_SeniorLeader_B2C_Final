

# Insert sanctuary_content Data from CSV

## What This Does
Populates the `sanctuary_content` database table with the 39 content items from your uploaded CSV file. This table is currently empty, which is why the "Today's 3 Performance Priorities" card has been struggling to show diverse content.

## Technical Approach

The CSV uses semicolon delimiters and contains 39 rows matching the `sanctuary_content` table schema exactly. I'll use an `UPSERT` (INSERT ... ON CONFLICT) so it's safe to re-run if any rows already exist.

**Steps:**
1. Copy the CSV to the sandbox filesystem
2. Parse the semicolon-delimited CSV with Python
3. Generate and execute SQL INSERT statements via `psql` (or the Supabase insert tool if psql isn't available) using the service role, which bypasses the admin-only RLS policies
4. Verify all 39 rows were inserted

**Column mapping** (CSV → DB):
- `id`, `title`, `content_type`, `category`, `duration`, `difficulty`, `creator`, `origin`, `story_hook`, `used_by`, `sub_type`, `voice`, `language`, `thumbnail_url`, `audio_url`, `steps_count`, `tags` (JSON array → text[]), `is_active`, `display_order`, `created_at`, `updated_at`, `protocol_type`

**Key handling:**
- `tags` column: CSV has JSON arrays like `["fire","focus"]` — will convert to Postgres text array format `{fire,focus}`
- Empty fields → NULL
- `is_active` boolean: "true" → true
- `duration` as numeric
- `steps_count` as integer (nullable)

## Files Modified

| File | Change |
|------|--------|
| No codebase files | Data insert only — 39 rows into `sanctuary_content` table |

