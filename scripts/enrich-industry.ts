import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BuyerArchetype {
  id: string;
  name: string;
  desc: string;
  scriptHook: string;
  emotionalState: string;
  visualCue: string;
}

export interface IndustryHashtags {
  category: string[];
  industry: string[];
}

export interface Industry {
  id: string;
  name: string;
  category: string;
  defaultBuyers?: string[];
  specificLines?: Record<string, string>;
  brollIndustryQuery?: string;
  brollBuyerQueries?: Record<string, string>;
  hashtags?: IndustryHashtags;
  notes?: string;
  _enrichedAt?: string;
  _enrichedBy?: string;
}

export type IndustryState = 'minimal' | 'partial' | 'complete';

// ── Paths ─────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(__dirname, '..', 'data');
const INDUSTRIES_PATH = path.join(DATA_DIR, 'industries.json');
const ARCHETYPES_PATH = path.join(DATA_DIR, 'archetypes.json');

// ── State detection ───────────────────────────────────────────────────────────

export function getIndustryState(industry: Industry): IndustryState {
  const hasDefaultBuyers = Array.isArray(industry.defaultBuyers) && industry.defaultBuyers.length > 0;
  const hasSpecificLines = industry.specificLines && Object.keys(industry.specificLines).length > 0;
  const hasBrollQuery = !!industry.brollIndustryQuery;
  const hasBrollBuyerQueries = industry.brollBuyerQueries && Object.keys(industry.brollBuyerQueries).length > 0;
  const hasHashtags = industry.hashtags &&
    Array.isArray(industry.hashtags.category) && industry.hashtags.category.length > 0 &&
    Array.isArray(industry.hashtags.industry) && industry.hashtags.industry.length > 0;

  if (hasDefaultBuyers && hasSpecificLines && hasBrollQuery && hasBrollBuyerQueries && hasHashtags) {
    return 'complete';
  }
  if (hasDefaultBuyers || hasSpecificLines || hasBrollQuery) {
    return 'partial';
  }
  return 'minimal';
}

// ── JSON parse helper ─────────────────────────────────────────────────────────

function parseClaudeResponse(rawText: string, industryName: string): Partial<Industry> {
  // Strip markdown code fences if present
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstErr) {
    // Claude sometimes returns malformed JSON then self-corrects with an explanation.
    // Find all { positions and try parsing from each one (last to first) up to the last }.
    // The corrected JSON block is always last in the response.
    const lastBrace = rawText.lastIndexOf('}');
    const starts: number[] = [];
    let searchFrom = 0;
    while (true) {
      const idx = rawText.indexOf('{', searchFrom);
      if (idx === -1) break;
      starts.push(idx);
      searchFrom = idx + 1;
    }
    for (let i = starts.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(rawText.slice(starts[i], lastBrace + 1));
      } catch {
        // try next start position
      }
    }
    throw new Error(
      `Failed to parse Claude response for industry "${industryName}".\nRaw response:\n${rawText}\nParse error: ${firstErr}`
    );
  }
}

// ── Claude enrichment ─────────────────────────────────────────────────────────

export async function enrichIndustry(
  industry: Industry,
  archetypes: BuyerArchetype[]
): Promise<Industry> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const archetypeList = archetypes.map(a => `- ${a.id}: "${a.name}" — ${a.desc}`).join('\n');

  const notesHint = industry.notes ? `\nContext/notes for this industry: ${industry.notes}\n` : '';

  const prompt = `You are a buyer psychology expert. Your job is to enrich a minimal industry entry for a video script pipeline targeting small business owners.

Industry: ${industry.name}
Category: ${industry.category}${notesHint}

Available buyer archetypes (use ONLY these IDs):
${archetypeList}

Return ONLY valid JSON (no markdown, no explanation) with exactly these fields:

{
  "defaultBuyers": ["id1", "id2", "id3", "id4", "id5"],
  "specificLines": {
    "id1": "Short specific buyer situation (8-12 words)",
    "id2": "Short specific buyer situation (8-12 words)",
    "id3": "Short specific buyer situation (8-12 words)",
    "id4": "Short specific buyer situation (8-12 words)",
    "id5": "Short specific buyer situation (8-12 words)"
  },
  "brollIndustryQuery": "3-5 word Pexels search query for this industry",
  "brollBuyerQueries": {
    "id1": "4-6 word Pexels search query for this buyer type",
    "id2": "4-6 word Pexels search query for this buyer type",
    "id3": "4-6 word Pexels search query for this buyer type",
    "id4": "4-6 word Pexels search query for this buyer type",
    "id5": "4-6 word Pexels search query for this buyer type"
  },
  "hashtags": {
    "category": ["#hashtag1", "#hashtag2", "#hashtag3"],
    "industry": ["#hashtag1", "#hashtag2"]
  }
}

Rules:
- Pick the 5 most realistic buyer archetypes for this industry
- specificLines should be punchy, realistic, first-person situation descriptions
- brollIndustryQuery should describe stock footage that shows this industry at work
- brollBuyerQueries should describe realistic stock footage of that buyer type in context
- hashtags.category: 3 broad category hashtags (e.g. #homeservices)
- hashtags.industry: 2 industry-specific hashtags (e.g. #plumber, #plumbing)
- All hashtag strings must start with #
- Return ONLY the JSON object, nothing else`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('');

  const enriched = parseClaudeResponse(rawText, industry.name);

  return {
    ...industry,
    defaultBuyers: enriched.defaultBuyers,
    specificLines: enriched.specificLines,
    brollIndustryQuery: enriched.brollIndustryQuery,
    brollBuyerQueries: enriched.brollBuyerQueries,
    hashtags: enriched.hashtags,
    _enrichedAt: new Date().toISOString(),
    _enrichedBy: 'claude-sonnet-4-6',
  };
}

// ── Batch enrichment ──────────────────────────────────────────────────────────

export async function enrichPendingIndustries(
  industries: Industry[],
  archetypes: BuyerArchetype[],
  forceIds?: string[]
): Promise<Industry[]> {
  const pending = industries.filter(ind => {
    if (forceIds && forceIds.length > 0) {
      return forceIds.includes(ind.id);
    }
    return getIndustryState(ind) !== 'complete';
  });

  if (pending.length === 0) {
    console.log('No industries need enrichment.');
    return industries;
  }

  console.log(`Enriching ${pending.length} industries in parallel...`);

  const enrichedResults = await Promise.all(
    pending.map(async (ind) => {
      process.stdout.write(`  → Enriching: ${ind.name}...`);
      try {
        const result = await enrichIndustry(ind, archetypes);
        console.log(' done');
        return result;
      } catch (err) {
        console.log(` ERROR: ${err}`);
        throw err;
      }
    })
  );

  // Merge back into the full list
  const enrichedMap = new Map(enrichedResults.map(r => [r.id, r]));
  const merged = industries.map(ind => enrichedMap.get(ind.id) ?? ind);

  // Write back to disk
  fs.writeFileSync(INDUSTRIES_PATH, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`\nWrote updated industries.json (${merged.length} entries).`);

  return merged;
}

// ── Data loaders ──────────────────────────────────────────────────────────────

export function loadIndustries(): Industry[] {
  return JSON.parse(fs.readFileSync(INDUSTRIES_PATH, 'utf-8')) as Industry[];
}

export function loadArchetypes(): BuyerArchetype[] {
  return JSON.parse(fs.readFileSync(ARCHETYPES_PATH, 'utf-8')) as BuyerArchetype[];
}

export function saveIndustries(industries: Industry[]): void {
  fs.writeFileSync(INDUSTRIES_PATH, JSON.stringify(industries, null, 2), 'utf-8');
}
