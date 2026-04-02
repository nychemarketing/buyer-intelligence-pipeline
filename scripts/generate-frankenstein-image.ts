/**
 * generate-frankenstein-image.ts
 * Generates a Frankenstein scene image via fal.ai Flux Pro.
 * Uses @fal-ai/client which handles polling internally — no timeout issues.
 *
 * Usage:
 *   npx ts-node scripts/generate-frankenstein-image.ts --industry roofer
 *   npx ts-node scripts/generate-frankenstein-image.ts --industry lash-artist
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
if (!API_KEY) {
  console.error('FAL_API_KEY not set in .env');
  process.exit(1);
}

fal.config({ credentials: API_KEY as string });

const SCRIPTS_DIR = path.join(__dirname, '..', 'output', 'scripts');
const IMAGES_DIR = path.join(__dirname, '..', 'output', 'images');

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function uploadToFalStorage(localPath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(localPath);
  const file = new File([fileBuffer], path.basename(localPath), { type: 'image/jpeg' });
  const url = await fal.storage.upload(file);
  return url;
}

async function main() {
  const industryIdx = process.argv.indexOf('--industry');
  const slug = industryIdx !== -1 ? process.argv[industryIdx + 1] : 'roofer';

  const modelIdx = process.argv.indexOf('--model');
  const model = modelIdx !== -1 ? process.argv[modelIdx + 1] : 'fal-ai/ideogram/v3';

  console.log(`Model: ${model}`);

  const scriptPath = path.join(SCRIPTS_DIR, `${slug}.json`);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }

  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));

  if (!script.frankensteinPrompt) {
    console.error(`No frankensteinPrompt found. Run generate-frankenstein-prompts.ts first.`);
    process.exit(1);
  }

  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  // Strip Midjourney-style flags
  const cleanPrompt = script.frankensteinPrompt
    .replace(/--ar\s+\S+/g, '')
    .replace(/--v\s+\S+/g, '')
    .replace(/--style\s+\S+/g, '')
    .trim();

  console.log(`Industry:  ${script.industry}`);
  console.log(`Prompt:    ${cleanPrompt.slice(0, 100)}...`);
  console.log('\nSubmitting to fal.ai Flux Pro...');

  // Reference image for character consistency
  const localRefPath = path.join(__dirname, '..', 'data', 'frankenstein-reference.jpg');
  let referenceImageUrl = process.env.FRANKENSTEIN_REFERENCE_IMAGE_URL ?? '';

  if (!referenceImageUrl && fs.existsSync(localRefPath)) {
    console.log('Uploading reference image to fal.ai storage...');
    referenceImageUrl = await uploadToFalStorage(localRefPath);
    console.log(`Reference URL: ${referenceImageUrl}`);
    console.log('Tip: add this to .env as FRANKENSTEIN_REFERENCE_IMAGE_URL to skip upload next time.');
  }

  const input: any = {
    prompt: cleanPrompt,
    width: 720,
    height: 1280,
    num_images: 1,
    output_format: 'jpeg',
    guidance_scale: 3.5,
    num_inference_steps: 28,
    safety_tolerance: 2,
    ...(referenceImageUrl ? { image_url: referenceImageUrl, image_strength: 0.35 } : {}),
  };

  if (referenceImageUrl) {
    console.log('Using reference image for character consistency.');
  }

  const result = await fal.subscribe(model, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      if (update.status === 'IN_QUEUE') {
        process.stdout.write(`  Queue position: ${update.queue_position ?? '—'}\r`);
      } else if (update.status === 'IN_PROGRESS') {
        process.stdout.write(`  Generating...                    \r`);
      }
    },
  });

  console.log('\nImage generated!');

  const imageUrl = (result.data as any)?.images?.[0]?.url;
  if (!imageUrl) {
    console.error('No image URL in response:', JSON.stringify(result.data, null, 2));
    process.exit(1);
  }

  const outputPath = path.join(IMAGES_DIR, `${slug}-frankenstein.jpg`);
  await downloadImage(imageUrl, outputPath);

  console.log('\n' + '━'.repeat(60));
  console.log('IMAGE READY');
  console.log('━'.repeat(60));
  console.log(`File:  output/images/${slug}-frankenstein.jpg`);
  console.log(`URL:   ${imageUrl}`);
  console.log('\nNext: npx ts-node scripts/animate-frankenstein.ts --industry ' + slug);
  console.log('━'.repeat(60));
}

main().catch(err => {
  if (err?.body?.detail) {
    console.error('Validation errors:', JSON.stringify(err.body.detail, null, 2));
  }
  console.error('Fatal error:', err);
  process.exit(1);
});
