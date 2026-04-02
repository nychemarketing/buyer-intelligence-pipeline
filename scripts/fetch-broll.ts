/**
 * fetch-broll.ts
 * Downloads b-roll clips from Pexels for each buyer persona in a script.
 *
 * Usage:
 *   npx ts-node scripts/fetch-broll.ts --industry roofer
 *   npx ts-node scripts/fetch-broll.ts --industry roofer --force
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
  console.error('PEXELS_API_KEY not set in .env — get a free key at pexels.com/api');
  process.exit(1);
}

const SCRIPTS_DIR = path.join(__dirname, '..', 'output', 'scripts');
const BROLL_DIR = path.join(__dirname, '..', 'output', 'broll');

async function searchPexels(query: string): Promise<string | null> {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&size=medium&per_page=5`;
  const res = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY as string },
  });
  if (!res.ok) throw new Error(`Pexels API error: ${res.status} ${await res.text()}`);
  const data = await res.json() as any;

  const videos = data.videos ?? [];
  if (videos.length === 0) return null;

  // Prefer HD portrait video files
  for (const video of videos) {
    const files: any[] = video.video_files ?? [];
    // Find a 720p or smaller portrait file
    const portrait = files
      .filter((f: any) => f.width < f.height && f.width >= 360)
      .sort((a: any, b: any) => b.width - a.width)[0];
    if (portrait) return portrait.link;
  }
  return null;
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const industryIdx = process.argv.indexOf('--industry');
  const slug = industryIdx !== -1 ? process.argv[industryIdx + 1] : null;
  if (!slug) { console.error('Usage: --industry <slug>'); process.exit(1); }

  const force = process.argv.includes('--force');

  const scriptPath = path.join(SCRIPTS_DIR, `${slug}.json`);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const slugDir = path.join(BROLL_DIR, slug);
  if (!fs.existsSync(slugDir)) fs.mkdirSync(slugDir, { recursive: true });

  console.log(`Fetching b-roll for: ${script.industry}\n`);

  // Also fetch one industry-context clip
  const allQueries: Array<{ id: string; query: string }> = [
    { id: 'industry', query: script.brollIndustryQuery ?? script.industry },
    ...script.buyers.map((b: any) => ({ id: b.archetypeId, query: b.brollQuery })),
  ];

  for (const { id, query } of allQueries) {
    const outputPath = path.join(slugDir, `${id}.mp4`);
    if (!force && fs.existsSync(outputPath)) {
      console.log(`  ↷ ${id} (already exists)`);
      continue;
    }

    process.stdout.write(`  → ${id}: "${query}"...`);
    try {
      const videoUrl = await searchPexels(query);
      if (!videoUrl) {
        console.log(' ✗ no results');
        continue;
      }
      await downloadFile(videoUrl, outputPath);
      console.log(' ✓');
    } catch (err) {
      console.log(` ✗ ${err}`);
    }
  }

  console.log(`\nB-roll saved to: output/broll/${slug}/`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
