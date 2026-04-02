# Changelog

All notable changes to the Buyer Intelligence Pipeline are documented here.

---

## [2.0.0] - 2026-04-02

### Added — Frankenstein Video Pipeline

Complete end-to-end video generation pipeline for the "Frankenstein as impossible customer" content format.

**Image generation**
- `generate-frankenstein-prompts.ts` — uses Claude to write cinematic editorial prompts per industry; Frankenstein is the CUSTOMER (impossible average buyer stitched from 5 archetypes), human professional is the overwhelmed service provider
- `generate-frankenstein-image.ts` — generates one Frankenstein scene image via fal.ai Ideogram v3 (720×1280, 9:16); supports reference image for character consistency via `FRANKENSTEIN_REFERENCE_IMAGE_URL`
- `batch-generate-images.ts` — generates all 56 industry images with concurrency control (default 2); skips existing unless `--force`

**Animation**
- `animate-frankenstein.ts` — animates a Frankenstein image into a 5-second clip via fal.ai Kling 2.5 Turbo (`fal-ai/kling-video/v2.5-turbo/pro/image-to-video`); uses `fal.storage.upload()` for image upload

**Voice generation**
- `generate-voice.ts` — generates ElevenLabs voiceover with character-level timestamps via the `/with-timestamps` endpoint; saves `.mp3` + `.timing.json` with precise start/end times for each script segment (hook, setup, each buyer, insight, CTA)

**B-roll**
- `fetch-broll.ts` — searches and downloads portrait b-roll clips from Pexels for each buyer archetype query; falls back gracefully if no results

**Video assembly**
- `assemble-video.ts` — full FFmpeg assembly pipeline:
  - Opens with Frankenstein animated clip (duration = time until first buyer mention)
  - Cuts to b-roll for each buyer, timed precisely to ElevenLabs character timestamps
  - Loops Frankenstein clip for insight + CTA outro
  - Burns ASS subtitles throughout
  - Outputs 720×1280 MP4 to `output/videos/`

### Changed
- `generate-scripts.ts` — updated core hashtags to brand set: `#personaaudit`, `#buyerintelligence`, `#knowyourbuyer`, `#frankensteinpage`, `#speaktoeveryone`
- `data/avatars.json` — added `elevenLabsVoiceId` (Matilda, temp) and `elevenLabsVoiceIdTarget` (Kristen, pending plan upgrade) for Angela

### Infrastructure
- FFmpeg required for video assembly (install via `winget install Gyan.FFmpeg`)
- New environment variables: `FAL_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `FRANKENSTEIN_REFERENCE_IMAGE_URL`

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
