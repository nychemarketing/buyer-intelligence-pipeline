/**
 * batch-generate-images.ts
 * Generates Frankenstein images for all industries via fal.ai Ideogram v3.
 * Skips industries that already have an image unless --force is passed.
 *
 * Usage:
 *   npx ts-node scripts/batch-generate-images.ts
 *   npx ts-node scripts/batch-generate-images.ts --force
 *   npx ts-node scripts/batch-generate-images.ts --concurrency 3
 */

import { fal } from '@fal-ai/client';
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

const API_KEY = process.env.FAL_API_KEY;
if (!API_KEY) { console.error('FAL_API_KEY not set in .env'); process.exit(1); }

fal.config({ credentials: API_KEY as string });

const SCRIPTS_DIR = path.join(__dirname, '..', 'output', 'scripts');
const IMAGES_DIR = path.join(__dirname, '..', 'output', 'images');
const MODEL = 'fal-ai/ideogram/v3';

async function uploadReferenceImage(): Promise<string | null> {
  const envUrl = process.env.FRANKENSTEIN_REFERENCE_IMAGE_URL;
  if (envUrl) return envUrl;

  const localRef = path.join(__dirname, '..', 'data', 'frankenstein-reference.jpg');
  if (!fs.existsSync(localRef)) return null;

  console.log('Uploading reference image...');
  const fileBuffer = fs.readFileSync(localRef);
  const file = new File([fileBuffer], 'frankenstein-reference.jpg', { type: 'image/jpeg' });
  const url = await fal.storage.upload(file);
  console.log(`Reference URL: ${url}\n`);
  return url;
}

async function generateImage(slug: string, prompt: string, referenceUrl: string | null): Promise<string> {
  const cleanPrompt = prompt
    .replace(/--ar\s+\S+/g, '')
    .replace(/--v\s+\S+/g, '')
    .replace(/--style\s+\S+/g, '')
    .trim();

  const input: any = {
    prompt: cleanPrompt,
    width: 720,
    height: 1280,
    num_images: 1,
    output_format: 'jpeg',
    guidance_scale: 3.5,
    num_inference_steps: 28,
    safety_tolerance: 2,
  };

  if (referenceUrl) {
    input.image_url = referenceUrl;
    input.image_strength = 0.35;
  }

  const result = await fal.subscribe(MODEL, { input, logs: false });
  const imageUrl = (result.data as any)?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`No image URL in response for ${slug}`);
  return imageUrl;
}

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function processBatch(
  slugs: string[],
  scripts: Map<string, any>,
  referenceUrl: string | null,
  force: boolean
): Promise<{ done: string[], skipped: string[], failed: string[] }> {
  const done: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  await Promise.all(slugs.map(async (slug) => {
    const script = scripts.get(slug)!;
    const outputPath = path.join(IMAGES_DIR, `${slug}-frankenstein.jpg`);

    if (!force && fs.existsSync(outputPath)) {
      process.stdout.write(`  ↷ ${script.industry} (already exists)\n`);
      skipped.push(slug);
      return;
    }

    if (!script.frankensteinPrompt) {
      process.stdout.write(`  ✗ ${script.industry} (no prompt — run generate-frankenstein-prompts.ts first)\n`);
      failed.push(slug);
      return;
    }

    process.stdout.write(`  → ${script.industry}...`);
    try {
      const imageUrl = await generateImage(slug, script.frankensteinPrompt, referenceUrl);
      await downloadImage(imageUrl, outputPath);
      process.stdout.write(` ✓\n`);
      done.push(slug);
    } catch (err) {
      process.stdout.write(` ✗ ${err}\n`);
      failed.push(slug);
    }
  }));

  return { done, skipped, failed };
}

async function main() {
  const force = process.argv.includes('--force');
  const concurrencyIdx = process.argv.indexOf('--concurrency');
  const concurrency = concurrencyIdx !== -1 ? parseInt(process.argv[concurrencyIdx + 1]) : 2;

  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Load all scripts
  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'));
  const scripts = new Map<string, any>();
  for (const file of files) {
    const script = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf-8'));
    scripts.set(script.slug, script);
  }

  const slugs = [...scripts.keys()].sort();
  const referenceUrl = await uploadReferenceImage();

  console.log(`Generating images for ${slugs.length} industries`);
  console.log(`Model:       ${MODEL}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Force:       ${force}`);
  console.log(`Reference:   ${referenceUrl ? 'yes' : 'no'}\n`);

  const allDone: string[] = [];
  const allSkipped: string[] = [];
  const allFailed: string[] = [];

  // Process in batches
  for (let i = 0; i < slugs.length; i += concurrency) {
    const batch = slugs.slice(i, i + concurrency);
    const { done, skipped, failed } = await processBatch(batch, scripts, referenceUrl, force);
    allDone.push(...done);
    allSkipped.push(...skipped);
    allFailed.push(...failed);
  }

  console.log('\n' + '━'.repeat(60));
  console.log('BATCH COMPLETE');
  console.log('━'.repeat(60));
  console.log(`✓ Generated: ${allDone.length}`);
  console.log(`↷ Skipped:   ${allSkipped.length} (already existed)`);
  console.log(`✗ Failed:    ${allFailed.length}`);
  if (allFailed.length > 0) {
    console.log(`\nFailed industries: ${allFailed.join(', ')}`);
  }
  console.log(`\nImages saved to: output/images/`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
