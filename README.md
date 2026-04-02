# Buyer Intelligence Pipeline

Automated CLI pipeline that generates video scripts, production briefs, and social captions for any service-based industry — powered by Claude AI.

Built for PersonaAudit.com, but designed to be reusable across any SaaS project doing buyer persona content.

---

## What it does

1. Maintains a library of 52 industries and 15 buyer archetypes
2. Auto-enriches minimal industry entries via Claude (buyer profiles, b-roll queries, hashtags)
3. Generates 30-second video scripts tailored to 5 buyer types per industry
4. Outputs production briefs with b-roll direction, text overlays, and captions for TikTok, Instagram, and Facebook

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env

# 3. Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=sk-ant-...

# 4. Verify setup
npx ts-node scripts/pipeline.ts --status
```

---

## CLI Commands

### Check status of all industries
```bash
npx ts-node scripts/pipeline.ts --status
```
Shows a formatted table of all 52 industries with their state (complete / partial / minimal).

### Enrich all pending industries
```bash
npx ts-node scripts/pipeline.ts --enrich-only
```
Sends all minimal/partial industries to Claude in parallel, writes enriched data back to `data/industries.json`.

### Enrich a specific industry
```bash
npx ts-node scripts/pipeline.ts --enrich "Roofer"

# Force re-enrich even if already complete
npx ts-node scripts/pipeline.ts --enrich "Roofer" --force
```

### Add a new industry (then auto-enrich)
```bash
# Minimal — Claude figures out the rest
npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle"

# With a context hint for Claude
npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle" --notes "Seasonal and event-driven, heavy gift buyer segment"
```

### Generate script JSONs
```bash
npx ts-node scripts/pipeline.ts --scripts-only
```
Writes one JSON per complete industry to `output/scripts/{slug}.json` and a combined `output/master-scripts.md`.

### Generate production briefs
```bash
npx ts-node scripts/pipeline.ts --briefs-only
```
Reads script JSONs and writes one markdown brief per industry to `output/briefs/{slug}.md`.

### Run the full pipeline
```bash
npx ts-node scripts/pipeline.ts --all
```
Enriches pending → generates scripts → generates briefs in one pass.

### npm shortcuts
```bash
npm run status    # --status
npm run enrich    # --enrich-only
npm run pipeline  # --all (no flags, shows help)
```

---

## How to add a new industry

**Option 1: Edit `data/industries.json` directly**
Add a minimal entry:
```json
{
  "id": "florist",
  "name": "Florist",
  "category": "Lifestyle"
}
```
Then run `--enrich-only`.

**Option 2: Use the --add flag**
```bash
npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle"
```

**Option 3: Add with notes for Claude**
```bash
npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle" --notes "Event-driven, heavy gift buyer segment, seasonal demand peaks"
```
Notes are passed to Claude as context to improve the enrichment quality.

---

## Industry states

| State | Description |
|-------|-------------|
| `complete` | Has defaultBuyers, specificLines, brollIndustryQuery, brollBuyerQueries, and hashtags — ready to generate scripts |
| `partial` | Has some fields but not all — Claude will fill in gaps |
| `minimal` | Only name and category — fully enriched by Claude |

15 industries ship as `complete`. The other 37 are `minimal` and need one enrichment run.

---

## Data model

### `data/archetypes.json`
15 universal buyer archetypes. Each has:
- `id` — used as key throughout the system
- `name`, `desc` — display names
- `scriptHook` — fallback line if no specificLine defined
- `emotionalState` — used in production briefs
- `visualCue` — b-roll direction hint

### `data/industries.json`
52 industries. Complete entries have:
- `defaultBuyers` — ordered list of 5 archetype IDs
- `specificLines` — `{ archetypeId: "buyer's situation in 8-12 words" }`
- `brollIndustryQuery` — Pexels query for establishing shot
- `brollBuyerQueries` — `{ archetypeId: "Pexels query" }`
- `hashtags` — `{ category: string[], industry: string[] }`

### `data/avatars.json`
3 presenter avatars (Angela, Andrew, Nyssa) with HeyGen IDs — placeholders until Phase 3.

### `output/scripts/{slug}.json`
Full script output per industry including segments, buyer details, and platform hashtags.

### `output/briefs/{slug}.md`
Production-ready markdown brief with script, b-roll table, text overlay list, and captions.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full history of changes.

---

## Phase 3 (coming soon)

Phase 3 adds HeyGen video generation and Pexels b-roll stitching. Requires:
- `HEYGEN_API_KEY` — for avatar video generation
- `PEXELS_API_KEY` — for b-roll clip search and download

Once Phase 3 is implemented, the pipeline will produce ready-to-post `.mp4` files per industry per avatar.

---

## Project structure

```
/data
  archetypes.json     — 15 universal buyer archetypes
  industries.json     — 52 industries (15 complete, 37 minimal)
  avatars.json        — 3 presenter avatars

/templates
  script.template.txt    — 30s video script template
  caption.template.txt   — TikTok/Instagram/Facebook caption template

/scripts
  enrich-industry.ts     — Claude enrichment logic
  generate-scripts.ts    — Script JSON builder
  generate-briefs.ts     — Markdown brief generator
  pipeline.ts            — CLI orchestrator

/output
  scripts/               — Generated script JSONs (gitignored)
  briefs/                — Generated brief markdowns (gitignored)
  master-scripts.md      — All scripts in one doc (gitignored)
```
