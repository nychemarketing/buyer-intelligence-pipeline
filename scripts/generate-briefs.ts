import * as fs from 'fs';
import * as path from 'path';
import { ScriptOutput, loadScripts } from './generate-scripts';

// ── Paths ─────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const BRIEFS_DIR = path.join(OUTPUT_DIR, 'briefs');

// ── Timing helpers ────────────────────────────────────────────────────────────

// Buyer b-roll segments start at 3s, each lasts 4s
function buyerTiming(index: number): string {
  const start = 3 + index * 4;
  const end = start + 4;
  return `${start}–${end}s`;
}

// ── Brief builder ─────────────────────────────────────────────────────────────

function buildBrief(script: ScriptOutput): string {
  const lines: string[] = [];

  lines.push(`# Buyer Intelligence Breakdown: ${script.industry}`);
  lines.push('');
  lines.push(`**Category**: ${script.category}  `);
  lines.push(`**Target audience**: ${script.industry} business owners  `);
  lines.push('**Video length**: 28–32 seconds  ');
  lines.push('**Format**: Floating talking head over b-roll  ');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Script');
  lines.push('');
  lines.push('**[HOOK — 0–3s]**');
  lines.push(`"${script.segments.hook}"`);
  lines.push('');
  lines.push('**[SETUP — 3–6s]**');
  lines.push(`"${script.segments.setup}"`);
  lines.push('');
  lines.push('**[BUYERS — 6–22s]**');
  lines.push(`"${script.segments.buyers}"`);
  lines.push('');
  lines.push('**[INSIGHT — 22–27s]**');
  lines.push(`"${script.segments.insight}"`);
  lines.push('');
  lines.push('**[CTA — 27–30s]**');
  lines.push(`"${script.segments.cta}"`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## B-Roll Direction');
  lines.push('');
  lines.push('| Segment | Timing | Pexels Query |');
  lines.push('|---------|--------|--------------|');
  lines.push(`| Establishing shot | 0–3s | \`${script.brollIndustryQuery}\` |`);

  script.buyers.forEach((buyer, i) => {
    lines.push(`| ${buyer.name} | ${buyerTiming(i)} | \`${buyer.brollQuery}\` |`);
  });

  lines.push(`| CTA | 23–30s | \`${script.brollIndustryQuery}\` |`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Text Overlays');
  lines.push('');
  lines.push('Each buyer name appears on screen as it\'s spoken — white bold text, slides in from left, holds 4s:');

  script.buyers.forEach(buyer => {
    lines.push(`- ${buyer.name}`);
  });

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Captions');
  lines.push('');

  // TikTok
  lines.push('**TikTok:**');
  lines.push(`Most ${pluralize(script.industry)} don't have a content problem… they have a Buyer Intelligence problem. 🎯`);
  lines.push(script.hashtags.tiktok);
  lines.push('');

  // Instagram
  lines.push('**Instagram:**');
  lines.push(`Most ${pluralize(script.industry)} are losing clients — not because their service is bad, but because their message is for everyone.`);
  lines.push('');
  lines.push('When you speak to everyone, you connect with no one.');
  lines.push('');
  lines.push(`There are 5 types of ${script.industry} buyers. Until you know which one you're talking to, your content will keep missing.`);
  lines.push('');
  lines.push('Comment "AUDIT" and I\'ll break yours down — personaaudit.com');
  lines.push(script.hashtags.instagram);
  lines.push('');

  // Facebook
  lines.push('**Facebook:**');
  lines.push(`This is something I see constantly with ${script.industry} businesses…`);
  lines.push('');
  lines.push('They\'re posting consistently, but not getting results. And it usually comes down to one thing: they\'re using one message for five completely different types of buyers.');
  lines.push('');
  lines.push('Do you know exactly who your content is speaking to?');
  lines.push('');
  lines.push('Comment "AUDIT" — I\'ll take a look at your messaging.');
  lines.push(script.hashtags.facebook);

  return lines.join('\n');
}

function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('s')) return name + 'es';
  return name + 's';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateAllBriefs(scripts: ScriptOutput[]): void {
  if (scripts.length === 0) {
    console.log('No scripts found. Run --scripts-only first.');
    return;
  }

  if (!fs.existsSync(BRIEFS_DIR)) {
    fs.mkdirSync(BRIEFS_DIR, { recursive: true });
  }

  for (const script of scripts) {
    const brief = buildBrief(script);
    const outPath = path.join(BRIEFS_DIR, `${script.slug}.md`);
    fs.writeFileSync(outPath, brief, 'utf-8');
    console.log(`  ✓ ${script.industry} → output/briefs/${script.slug}.md`);
  }

  console.log(`\nGenerated ${scripts.length} briefs in output/briefs/`);
}

// ── Standalone entry ──────────────────────────────────────────────────────────

if (require.main === module) {
  const scripts = loadScripts();
  generateAllBriefs(scripts);
}
