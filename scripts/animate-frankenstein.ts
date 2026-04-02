/**
 * animate-frankenstein.ts
 * Animates a Frankenstein image into a 5-second video via fal.ai Kling 2.5 Turbo.
 *
 * Usage:
 *   npx ts-node scripts/animate-frankenstein.ts --industry dentist
 *   npx ts-node scripts/animate-frankenstein.ts --industry roofer
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

const IMAGES_DIR = path.join(__dirname, '..', 'output', 'images');
const CLIPS_DIR = path.join(__dirname, '..', 'output', 'clips');

async function uploadImage(imagePath: string): Promise<string> {
  console.log('Uploading image to fal.ai storage...');
  const fileBuffer = fs.readFileSync(imagePath);
  const file = new File([fileBuffer], path.basename(imagePath), { type: 'image/jpeg' });
  const url = await fal.storage.upload(file);
  console.log(`Uploaded: ${url}`);
  return url;
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const industryIdx = process.argv.indexOf('--industry');
  const slug = industryIdx !== -1 ? process.argv[industryIdx + 1] : 'dentist';

  const imagePath = path.join(IMAGES_DIR, `${slug}-frankenstein.jpg`);
  if (!fs.existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    console.error(`Run first: npx ts-node scripts/generate-frankenstein-image.ts --industry ${slug}`);
    process.exit(1);
  }

  if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });

  console.log(`Industry: ${slug}`);
  console.log(`Image:    ${imagePath}`);

  const imageUrl = await uploadImage(imagePath);

  console.log('\nSubmitting to Kling 2.5 Turbo...');

  const result = await fal.subscribe('fal-ai/kling-video/v2.5-turbo/pro/image-to-video', {
    input: {
      image_url: imageUrl,
      prompt: 'Subtle natural movement — slight breathing, gentle hand motion, soft background ambiance. Completely deadpan. Cinematic.',
      duration: '5',
    },
    logs: true,
    onQueueUpdate: (update: any) => {
      if (update.status === 'IN_QUEUE') {
        process.stdout.write(`  Queue position: ${update.queue_position ?? '—'}\r`);
      } else if (update.status === 'IN_PROGRESS') {
        process.stdout.write(`  Generating video...              \r`);
      }
    },
  });

  console.log('\nVideo generated!');

  const videoUrl = (result.data as any)?.video?.url ?? (result.data as any)?.video_url;
  if (!videoUrl) {
    console.error('No video URL in response:', JSON.stringify(result.data, null, 2));
    process.exit(1);
  }

  const outputPath = path.join(CLIPS_DIR, `${slug}-frankenstein.mp4`);
  await downloadVideo(videoUrl, outputPath);

  console.log('\n' + '━'.repeat(60));
  console.log('CLIP READY');
  console.log('━'.repeat(60));
  console.log(`File: output/clips/${slug}-frankenstein.mp4`);
  console.log(`URL:  ${videoUrl}`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
