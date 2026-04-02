/**
 * generate-voice.ts
 * Generates voice audio via ElevenLabs API and saves as .mp3
 *
 * Usage:
 *   npx ts-node scripts/generate-voice.ts --industry roofer
 *   npx ts-node scripts/generate-voice.ts --industry roofer --avatar angela
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

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('ELEVENLABS_API_KEY not set in .env');
  process.exit(1);
}

// Strip timing markers and clean script for TTS
function cleanScriptText(raw: string): string {
  return raw
    .replace(/\[.*?\]\n/g, '')
    .replace(/•/g, '-')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

async function generateVoiceWithTimestamps(
  text: string,
  voiceId: string,
  outputPath: string,
  timestampsPath: string
): Promise<Alignment> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

  const body = {
    text,
    model_id: 'eleven_turbo_v2_5',
    voice_settings: {
      stability: 0.4,
      similarity_boost: 0.75,
      style: 0.35,
      use_speaker_boost: true,
      speed: 1.15,
    },
  };

  console.log(`\nRequesting audio from ElevenLabs (with timestamps)...`);
  console.log(`Voice ID: ${voiceId}`);
  console.log(`Model:    eleven_turbo_v2_5`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('ElevenLabs API error:', res.status, errText);
    process.exit(1);
  }

  const data = await res.json() as { audio_base64: string; alignment: Alignment };
  const audioBuffer = Buffer.from(data.audio_base64, 'base64');
  fs.writeFileSync(outputPath, audioBuffer);
  fs.writeFileSync(timestampsPath, JSON.stringify(data.alignment, null, 2), 'utf-8');

  const sizeKb = Math.round(audioBuffer.byteLength / 1024);
  console.log(`Audio saved: ${outputPath} (${sizeKb} KB)`);
  console.log(`Timestamps: ${timestampsPath}`);
  return data.alignment;
}

/** Find the start time (seconds) of a substring within the aligned text (case-insensitive) */
function findLineTime(alignment: Alignment, searchStr: string): number | null {
  const fullText = alignment.characters.join('').toLowerCase();
  const needle   = searchStr.trim().slice(0, 30).toLowerCase();
  const idx      = fullText.indexOf(needle);
  if (idx === -1) return null;
  return alignment.character_start_times_seconds[idx] ?? null;
}

async function main() {
  const industryIdx = process.argv.indexOf('--industry');
  const slug = industryIdx !== -1 ? process.argv[industryIdx + 1] : 'roofer';

  const avatarIdx = process.argv.indexOf('--avatar');
  const avatarId = avatarIdx !== -1 ? process.argv[avatarIdx + 1] : 'angela';

  // Load script
  const scriptPath = path.join(__dirname, '..', 'output', 'scripts', `${slug}.json`);
  if (!fs.existsSync(scriptPath)) {
    console.error(`Script not found: ${scriptPath}`);
    process.exit(1);
  }
  const scriptData = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const cleanScript = cleanScriptText(scriptData.fullScriptText as string);

  // Load avatar
  const avatarsPath = path.join(__dirname, '..', 'data', 'avatars.json');
  const avatars = JSON.parse(fs.readFileSync(avatarsPath, 'utf-8')) as any[];
  const avatar = avatars.find(a => a.id === avatarId);

  if (!avatar) {
    console.error(`Avatar "${avatarId}" not found in data/avatars.json`);
    process.exit(1);
  }

  if (!avatar.elevenLabsVoiceId) {
    console.error(`No elevenLabsVoiceId set for avatar "${avatarId}"`);
    process.exit(1);
  }

  console.log(`Industry: ${scriptData.industry}`);
  console.log(`Avatar:   ${avatar.displayName}`);
  console.log(`\nScript preview:\n${cleanScript.slice(0, 150)}...`);

  // Output paths
  const audioDir = path.join(__dirname, '..', 'output', 'audio');
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  const outputPath     = path.join(audioDir, `${slug}-${avatarId}.mp3`);
  const timestampsPath = path.join(audioDir, `${slug}-${avatarId}.json`);

  const alignment = await generateVoiceWithTimestamps(
    cleanScript, avatar.elevenLabsVoiceId, outputPath, timestampsPath
  );

  // Build segment timing map from alignment data and save alongside audio
  const segments: Record<string, any> = {};
  // Build search terms that will reliably match the spoken script text.
  // - Hook/setup/cta: use first 30 chars of segment text (lowercased for matching)
  // - Buyers: search for the archetypeId word which always appears in the script
  // - Insight: search for a reliable phrase from the insight segment
  const lines: Array<{ key: string; search: string }> = [
    { key: 'hook',    search: scriptData.segments.hook },
    { key: 'setup',   search: scriptData.segments.setup },
    ...scriptData.buyers.map((b: any) => ({ key: `buyer_${b.archetypeId}`, search: b.archetypeId })),
    { key: 'insight', search: 'use one message' },
    { key: 'cta',     search: scriptData.segments.cta },
  ];

  for (const { key, search } of lines) {
    const t = findLineTime(alignment, search);
    if (t !== null) segments[key] = { start: t };
  }

  // Fill end times from the next segment's start
  const keys = Object.keys(segments);
  const totalDuration = alignment.character_end_times_seconds.at(-1) ?? 0;
  keys.forEach((k, i) => {
    segments[k].end = i + 1 < keys.length ? segments[keys[i + 1]].start : totalDuration;
  });

  const timingPath = path.join(audioDir, `${slug}-${avatarId}.timing.json`);
  fs.writeFileSync(timingPath, JSON.stringify({ totalDuration, segments }, null, 2), 'utf-8');
  console.log(`Timing map: ${timingPath}`);

  console.log('\n' + '━'.repeat(60));
  console.log('VOICE READY');
  console.log('━'.repeat(60));
  console.log(`File:    output/audio/${slug}-${avatarId}.mp3`);
  console.log(`Timing:  output/audio/${slug}-${avatarId}.timing.json`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
