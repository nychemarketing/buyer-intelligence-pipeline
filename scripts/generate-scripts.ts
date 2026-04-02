import * as fs from 'fs';
import * as path from 'path';
import { Industry, BuyerArchetype, getIndustryState, loadIndustries, loadArchetypes } from './enrich-industry';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ScriptBuyer {
  archetypeId: string;
  name: string;
  specificLine: string;
  brollQuery: string;
  emotionalState: string;
  visualCue: string;
}

export interface ScriptOutput {
  industry: string;
  category: string;
  slug: string;
  fullScriptText: string;
  segments: {
    hook: string;
    setup: string;
    buyers: string;
    insight: string;
    cta: string;
  };
  buyers: ScriptBuyer[];
  brollIndustryQuery: string;
  hashtags: {
    tiktok: string;
    instagram: string;
    facebook: string;
  };
  frankensteinPrompt?: string;
  generatedAt: string;
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const SCRIPTS_DIR = path.join(OUTPUT_DIR, 'scripts');
const MASTER_PATH = path.join(OUTPUT_DIR, 'master-scripts.md');

// ── Helpers ───────────────────────────────────────────────────────────────────

function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('s')) return name + 'es';
  return name + 's';
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildHashtagString(
  industry: Industry,
  platform: 'tiktok' | 'instagram' | 'facebook'
): string {
  const coreTags = ['#personaaudit', '#buyerintelligence', '#knowyourbuyer', '#frankensteinpage', '#speaktoeveryone'];
  const reachTags = ['#fyp', '#smallbusinesstips', '#localbusiness', '#marketingstrategy'];
  const categoryTags = industry.hashtags?.category ?? [];
  const industryTags = industry.hashtags?.industry ?? [];

  if (platform === 'tiktok') {
    return [...coreTags, ...industryTags, ...categoryTags, ...reachTags].join(' ');
  }
  if (platform === 'instagram') {
    return [...coreTags, ...categoryTags, ...industryTags, ...reachTags].join(' ');
  }
  // facebook — shorter, more selective
  return [...coreTags.slice(0, 2), ...industryTags, ...categoryTags.slice(0, 2)].join(' ');
}

function buildScript(industry: Industry, archetypes: BuyerArchetype[]): ScriptOutput {
  const archetypeMap = new Map(archetypes.map(a => [a.id, a]));
  const plural = pluralize(industry.name);

  const buyers: ScriptBuyer[] = (industry.defaultBuyers ?? []).map(buyerId => {
    const archetype = archetypeMap.get(buyerId);
    if (!archetype) throw new Error(`Unknown archetype id "${buyerId}" in industry "${industry.name}"`);
    return {
      archetypeId: buyerId,
      name: archetype.name,
      specificLine: industry.specificLines?.[buyerId] ?? archetype.scriptHook,
      brollQuery: industry.brollBuyerQueries?.[buyerId] ?? '',
      emotionalState: archetype.emotionalState,
      visualCue: archetype.visualCue,
    };
  });

  const hook = `Most ${plural} don't have a content problem… they have a Buyer Intelligence problem.`;
  const setup = `Let's take a ${industry.name}.`;
  const buyersText = `There are 5 types of buyers:\n\n${buyers
    .map(b => `• ${b.name} — ${b.specificLine}`)
    .join('\n')}`;
  const insight = `But most ${plural} use ONE message for ALL of them.\n\nThat's why their content doesn't convert.`;
  const cta = `Comment "AUDIT" — I'll map your Buyer Intelligence at personaaudit.com`;

  const fullScriptText = [
    `[HOOK — 0–3s]\n${hook}`,
    `[SETUP — 3–6s]\n${setup}`,
    `[BUYERS — 6–22s]\n${buyersText}`,
    `[INSIGHT — 22–27s]\n${insight}`,
    `[CTA — 27–30s]\n${cta}`,
  ].join('\n\n');

  return {
    industry: industry.name,
    category: industry.category,
    slug: toSlug(industry.name),
    fullScriptText,
    segments: { hook, setup, buyers: buyersText, insight, cta },
    buyers,
    brollIndustryQuery: industry.brollIndustryQuery ?? '',
    hashtags: {
      tiktok: buildHashtagString(industry, 'tiktok'),
      instagram: buildHashtagString(industry, 'instagram'),
      facebook: buildHashtagString(industry, 'facebook'),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Master markdown builder ───────────────────────────────────────────────────

function buildMasterMarkdown(scripts: ScriptOutput[]): string {
  const lines: string[] = [
    '# Master Scripts — Buyer Intelligence Pipeline',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total scripts: ${scripts.length}`,
    '',
    '---',
    '',
  ];

  for (const script of scripts) {
    lines.push(`## ${script.industry} (${script.category})`);
    lines.push('');
    lines.push('```');
    lines.push(script.fullScriptText);
    lines.push('```');
    lines.push('');
    lines.push('**Hashtags (TikTok):**');
    lines.push(script.hashtags.tiktok);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

export function generateAllScripts(
  industries: Industry[],
  archetypes: BuyerArchetype[]
): ScriptOutput[] {
  const complete = industries.filter(ind => getIndustryState(ind) === 'complete');

  if (complete.length === 0) {
    console.log('No complete industries found. Run --enrich-only first.');
    return [];
  }

  // Ensure output/scripts directory exists
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  }

  const scripts: ScriptOutput[] = [];

  for (const industry of complete) {
    try {
      const script = buildScript(industry, archetypes);
      const outPath = path.join(SCRIPTS_DIR, `${script.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify(script, null, 2), 'utf-8');
      console.log(`  ✓ ${industry.name} → output/scripts/${script.slug}.json`);
      scripts.push(script);
    } catch (err) {
      console.error(`  ✗ ${industry.name}: ${err}`);
    }
  }

  // Write master doc
  const masterMd = buildMasterMarkdown(scripts);
  fs.writeFileSync(MASTER_PATH, masterMd, 'utf-8');
  console.log(`\nWrote master-scripts.md (${scripts.length} scripts).`);

  return scripts;
}

// ── Script loader (for generate-briefs) ──────────────────────────────────────

export function loadScripts(): ScriptOutput[] {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, f), 'utf-8')) as ScriptOutput);
}

// ── Standalone entry ──────────────────────────────────────────────────────────

if (require.main === module) {
  const industries = loadIndustries();
  const archetypes = loadArchetypes();
  generateAllScripts(industries, archetypes);
}
