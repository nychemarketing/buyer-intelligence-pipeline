# Changelog

All notable changes to the Buyer Intelligence Pipeline are documented here.

---

## [1.1.0] - 2026-04-02

### Fixed
- **JSON parse recovery in `enrich-industry.ts`** — Claude occasionally returns malformed JSON followed by a self-corrected version after a `---` separator. The parser now scans all sections from last to first and recovers the valid JSON block instead of throwing a fatal error. Previously this caused `--enrich-only` to crash mid-batch if any single industry response was malformed.

---

## [1.0.0] - 2026-04-02

### Added
- Initial release of the Buyer Intelligence Pipeline
- 52 industries in `data/industries.json` (15 complete, 37 minimal)
- 15 universal buyer archetypes in `data/archetypes.json`
- 3 presenter avatars (Angela, Andrew, Nyssa) in `data/avatars.json` — placeholders for Phase 3
- `enrich-industry.ts` — Claude-powered enrichment of minimal/partial industry entries
- `generate-scripts.ts` — generates 30-second video script JSONs per industry
- `generate-briefs.ts` — generates production markdown briefs with b-roll direction, text overlays, and captions
- `pipeline.ts` — CLI orchestrator with the following commands:
  - `--status` — show all industries with their state
  - `--enrich-only` — enrich all pending industries in parallel
  - `--enrich "Name"` — enrich a specific industry
  - `--enrich "Name" --force` — re-enrich even if already complete
  - `--add "Name" --category "Cat"` — add and auto-enrich a new industry
  - `--scripts-only` — generate script JSONs for all complete industries
  - `--briefs-only` — generate markdown briefs from script JSONs
  - `--all` — full pipeline: enrich → scripts → briefs
- Script and caption templates in `templates/`
- `.env.example` with all required environment variable keys
