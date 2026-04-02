/**
 * assemble-video.ts
 * Assembles a full TikTok/Reel/Short from:
 *   - Frankenstein animated clip (hook, 5s)
 *   - B-roll per buyer persona
 *   - Ken Burns on Frankenstein still (hook/setup/insight/CTA sections)
 *   - ElevenLabs voiceover audio
 *   - Burned-in captions
 *
 * Usage:
 *   npx ts-node scripts/assemble-video.ts --industry roofer
 *   npx ts-node scripts/assemble-video.ts --industry roofer --avatar angela
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

// Ensure ffmpeg/ffprobe are on PATH (WinGet install location)
const FFMPEG_BIN = 'C:\\Users\\nyche\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin';
if (process.env.PATH && !process.env.PATH.includes('ffmpeg')) {
  process.env.PATH = FFMPEG_BIN + ';' + process.env.PATH;
}

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

const SCRIPTS_DIR   = path.join(__dirname, '..', 'output', 'scripts');
const CLIPS_DIR     = path.join(__dirname, '..', 'output', 'clips');
const BROLL_DIR     = path.join(__dirname, '..', 'output', 'broll');
const AUDIO_DIR     = path.join(__dirname, '..', 'output', 'audio');
const VIDEOS_DIR    = path.join(__dirname, '..', 'output', 'videos');
const TEMP_DIR      = path.join(__dirname, '..', 'output', '_tmp');

const WIDTH  = 720;
const HEIGHT = 1280;

function ffprobe(filePath: string, field: string): string {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', `stream=${field}`,
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf-8' });
  return result.stdout.trim();
}

function getAudioDuration(filePath: string): number {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ], { encoding: 'utf-8' });
  return parseFloat(result.stdout.trim());
}

function ffmpeg(args: string[], label: string): void {
  process.stdout.write(`  ${label}...`);
  const result = spawnSync('ffmpeg', ['-y', ...args], { encoding: 'utf-8' });
  if (result.status !== 0) {
    console.log(' ✗');
    console.error(result.stderr);
    throw new Error(`FFmpeg failed: ${label}`);
  }
  console.log(' ✓');
}

/**
 * Trim/pad a video clip to exactly `duration` seconds, scaled to 720x1280.
 */
function prepareClip(inputPath: string, outputPath: string, duration: number): void {
  ffmpeg([
    '-i', inputPath,
    '-t', String(duration),
    '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1`,
    '-r', '24',
    '-an',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    outputPath,
  ], `Prep clip ${path.basename(inputPath)}`);
}

/**
 * Generate a Ken Burns clip from a still image.
 * Slowly zooms in over the given duration.
 */
function kenBurns(imagePath: string, outputPath: string, duration: number, startZoom = 1.0, endZoom = 1.08): void {
  const frames = Math.round(duration * 24);
  const zoomStep = (endZoom - startZoom) / frames;
  ffmpeg([
    '-loop', '1', '-i', imagePath,
    '-t', String(duration),
    '-vf', [
      `scale=${WIDTH * 2}:${HEIGHT * 2}`,
      `zoompan=z='min(zoom+${zoomStep.toFixed(6)},${endZoom})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=24`,
      `setsar=1`,
    ].join(','),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-an',
    outputPath,
  ], `Ken Burns (${duration.toFixed(1)}s)`);
}

/**
 * Concatenate a list of prepared clips into one video.
 */
function concat(clipPaths: string[], outputPath: string): void {
  const listFile = path.join(TEMP_DIR, 'concat_list.txt');
  fs.writeFileSync(listFile, clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy',
    outputPath,
  ], 'Concat clips');
}

function formatAssTime(sec: number): string {
  const h  = Math.floor(sec / 3600);
  const m  = Math.floor((sec % 3600) / 60);
  const s  = Math.floor(sec % 60);
  const cs = Math.round((sec % 1) * 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

/**
 * Write an ASS subtitle file, burn it into the video, and mix audio.
 */
function mixAudioAndCaptions(
  videoPath: string,
  audioPath: string,
  captions: Array<{ text: string; start: number; end: number }>,
  outputPath: string,
): void {
  // Write ASS subtitle file — no escaping hell, handles any text
  const assPath = path.join(TEMP_DIR, 'captions.ass');
  const assLines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // White text, black outline, bold, bottom-center aligned (2), 80px margin from bottom
    'Style: Default,Arial,42,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,2,20,20,80,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...captions.map(({ text, start, end }) => {
      // ASS uses \N for newlines, strip actual newlines from inline text
      const assText = text.replace(/\n/g, ' ');
      return `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${assText}`;
    }),
  ];
  fs.writeFileSync(assPath, assLines.join('\n'), 'utf-8');

  // subtitles filter path: forward slashes, drive letter colon escaped as \:
  const assPathFwd = assPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):\//,  '$1\\:/');

  ffmpeg([
    '-i', videoPath,
    '-i', audioPath,
    '-vf', `subtitles='${assPathFwd}'`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    outputPath,
  ], 'Mix audio + captions');
}

async function main() {
  const industryIdx = process.argv.indexOf('--industry');
  const slug = industryIdx !== -1 ? process.argv[industryIdx + 1] : null;
  if (!slug) { console.error('Usage: --industry <slug>'); process.exit(1); }

  const avatarIdx = process.argv.indexOf('--avatar');
  const avatar = avatarIdx !== -1 ? process.argv[avatarIdx + 1] : 'angela';

  // Paths
  const scriptPath      = path.join(SCRIPTS_DIR, `${slug}.json`);
  const frankClipPath   = path.join(CLIPS_DIR, `${slug}-frankenstein.mp4`);
  const audioPath       = path.join(AUDIO_DIR, `${slug}-${avatar}.mp3`);
  const brollSlugDir    = path.join(BROLL_DIR, slug);
  const outputPath      = path.join(VIDEOS_DIR, `${slug}-${avatar}.mp4`);

  // Validate inputs
  for (const [label, p] of [
    ['Script JSON', scriptPath],
    ['Frankenstein clip', frankClipPath],
    ['Voiceover audio', audioPath],
  ] as const) {
    if (!fs.existsSync(p)) {
      console.error(`Missing ${label}: ${p}`);
      process.exit(1);
    }
  }

  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR))   fs.mkdirSync(TEMP_DIR,   { recursive: true });

  const script      = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const timingPath  = path.join(AUDIO_DIR, `${slug}-${avatar}.timing.json`);
  const audioDuration = getAudioDuration(audioPath);

  // Load precise segment timings if available, otherwise fall back to equal slices
  let timing: Record<string, { start: number; end: number }> | null = null;
  if (fs.existsSync(timingPath)) {
    timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8')).segments;
  }

  console.log(`\nAssembling: ${script.industry}`);
  console.log(`Audio duration: ${audioDuration.toFixed(1)}s`);
  console.log(`Timing source: ${timing ? 'ElevenLabs timestamps' : 'equal slices (fallback)'}`);

  // ── Timing layout (driven by real audio timestamps) ─────────────
  // [0 – buyersStart]           Frankenstein clip (hook + setup narration)
  // [buyersStart – insightStart] B-roll per buyer (exact durations from timing)
  // [insightStart – end]         Frankenstein clip (insight + CTA)

  const firstBuyerKey   = `buyer_${script.buyers[0].archetypeId}`;
  const insightKey      = 'insight';

  const buyersStart     = timing?.[firstBuyerKey]?.start   ?? 5;
  const insightStart    = timing?.[insightKey]?.start      ?? (audioDuration - 8);

  const FRANK_HOOK_DURATION   = buyersStart;
  const INSIGHT_CTA_DURATION  = audioDuration - insightStart;

  const buyerDurations = script.buyers.map((b: any) => {
    const key   = `buyer_${b.archetypeId}`;
    const start = timing?.[key]?.start ?? 0;
    const end   = timing?.[key]?.end   ?? 0;
    return end > start ? end - start : (audioDuration - buyersStart - INSIGHT_CTA_DURATION) / script.buyers.length;
  });

  console.log(`  Hook clip:    ${FRANK_HOOK_DURATION.toFixed(1)}s`);
  script.buyers.forEach((b: any, i: number) => {
    console.log(`  ${b.archetypeId}:      ${buyerDurations[i].toFixed(1)}s`);
  });
  console.log(`  Outro clip:   ${INSIGHT_CTA_DURATION.toFixed(1)}s`);
  console.log('');

  const preparedClips: string[] = [];

  // 1. Frankenstein animated clip (hook)
  const frankPrepPath = path.join(TEMP_DIR, '00_frank_clip.mp4');
  prepareClip(frankClipPath, frankPrepPath, FRANK_HOOK_DURATION);
  preparedClips.push(frankPrepPath);

  // 2. B-roll per buyer — each cut to exact duration from timing data
  for (let i = 0; i < script.buyers.length; i++) {
    const buyer    = script.buyers[i];
    const dur      = buyerDurations[i];
    const brollPath = path.join(brollSlugDir, `${buyer.archetypeId}.mp4`);
    const prepPath  = path.join(TEMP_DIR, `${String(i + 1).padStart(2, '0')}_buyer_${buyer.archetypeId}.mp4`);

    if (fs.existsSync(brollPath)) {
      prepareClip(brollPath, prepPath, dur);
    } else {
      console.log(`  ! No b-roll for ${buyer.archetypeId}, looping Frankenstein clip`);
      prepareClip(frankClipPath, prepPath, dur);
    }
    preparedClips.push(prepPath);
  }

  // 3. Frankenstein clip again for insight + CTA (loop if shorter than needed)
  const outroPrepPath = path.join(TEMP_DIR, `${String(script.buyers.length + 1).padStart(2, '0')}_frank_outro.mp4`);
  // Loop the clip to fill the duration if needed
  const frankDuration = parseFloat(ffprobe(frankClipPath, 'duration') || '5');
  if (INSIGHT_CTA_DURATION > frankDuration) {
    // Use -stream_loop to loop the input
    process.stdout.write(`  Loop Frankenstein clip (${INSIGHT_CTA_DURATION.toFixed(1)}s)...`);
    const result = spawnSync('ffmpeg', [
      '-y', '-stream_loop', '-1', '-i', frankClipPath,
      '-t', String(INSIGHT_CTA_DURATION),
      '-vf', `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},setsar=1`,
      '-r', '24', '-an',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      outroPrepPath,
    ], { encoding: 'utf-8' });
    if (result.status !== 0) { console.log(' ✗'); console.error(result.stderr); throw new Error('Loop failed'); }
    console.log(' ✓');
  } else {
    prepareClip(frankClipPath, outroPrepPath, INSIGHT_CTA_DURATION);
  }
  preparedClips.push(outroPrepPath);

  // Concat all clips
  const silentVideoPath = path.join(TEMP_DIR, 'silent_video.mp4');
  concat(preparedClips, silentVideoPath);

  // Build simple caption timing from script segments
  // We assign timing proportionally across the audio duration
  const captions: Array<{ text: string; start: number; end: number }> = [];
  const segmentTexts = [
    script.segments.hook,
    script.segments.setup,
    ...script.buyers.map((b: any) => b.specificLine),
    script.segments.insight,
    script.segments.cta,
  ].filter(Boolean);

  const segCount = segmentTexts.length;
  const segDur   = audioDuration / segCount;
  segmentTexts.forEach((text: string, i: number) => {
    captions.push({ text, start: i * segDur, end: (i + 1) * segDur - 0.3 });
  });

  // Mix audio + captions → final output
  mixAudioAndCaptions(silentVideoPath, audioPath, captions, outputPath);

  // Cleanup temp
  for (const f of fs.readdirSync(TEMP_DIR)) {
    fs.unlinkSync(path.join(TEMP_DIR, f));
  }

  console.log('\n' + '━'.repeat(60));
  console.log('VIDEO READY');
  console.log('━'.repeat(60));
  console.log(`File: output/videos/${slug}-${avatar}.mp4`);
  console.log(`Size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MB`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
