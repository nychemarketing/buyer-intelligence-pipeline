/**
 * pipeline.ts — CLI orchestrator for the Buyer Intelligence Pipeline
 *
 * Usage:
 *   npx ts-node scripts/pipeline.ts --status
 *   npx ts-node scripts/pipeline.ts --enrich-only
 *   npx ts-node scripts/pipeline.ts --enrich "Roofer"
 *   npx ts-node scripts/pipeline.ts --enrich "Roofer" --force
 *   npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle"
 *   npx ts-node scripts/pipeline.ts --add "Florist" --category "Lifestyle" --notes "Seasonal and event-driven"
 *   npx ts-node scripts/pipeline.ts --scripts-only
 *   npx ts-node scripts/pipeline.ts --briefs-only
 *   npx ts-node scripts/pipeline.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Load .env manually (no dotenv dependency) ─────────────────────────────────

function loadEnv(): void {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadEnv();

// ── Imports (after env load) ──────────────────────────────────────────────────

import {
  loadIndustries,
  loadArchetypes,
  saveIndustries,
  getIndustryState,
  enrichPendingIndustries,
  enrichIndustry,
  Industry,
  IndustryState,
} from './enrich-industry';

import { generateAllScripts, loadScripts } from './generate-scripts';
import { generateAllBriefs } from './generate-briefs';

// ── Status display ────────────────────────────────────────────────────────────

function printStatus(industries: Industry[]): void {
  const WIDTH = 42;
  const separator = '━'.repeat(WIDTH);

  console.log('\nIndustry Status Report');
  console.log(separator);

  let complete = 0, partial = 0, minimal = 0;

  for (const ind of industries) {
    const state: IndustryState = getIndustryState(ind);
    if (state === 'complete') complete++;
    else if (state === 'partial') partial++;
    else minimal++;

    const icon = state === 'complete' ? '✅' : state === 'partial' ? '⚠️ ' : '⚡';
    const label = state.padEnd(8);
    const name = ind.name.padEnd(22);
    const cat = `(${ind.category})`;
    const hint = state !== 'complete' ? '  → needs enrichment' : '';

    console.log(`${icon} ${label}  ${name} ${cat}${hint}`);
  }

  console.log(separator);
  console.log(`${complete} complete · ${partial} partial · ${minimal} minimal`);

  if (minimal + partial > 0) {
    console.log('Run: npx ts-node scripts/pipeline.ts --enrich-only');
  }
  console.log('');
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

// ── toSlug helper ─────────────────────────────────────────────────────────────

function toId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // No args → show help
  if (args.length === 0) {
    console.log(`
Buyer Intelligence Pipeline — CLI

Usage:
  --status                          List all industries with their state
  --enrich-only                     Enrich all pending industries
  --enrich "Name"                   Enrich a specific industry by name
  --enrich "Name" --force           Re-enrich even if already complete
  --add "Name" --category "Cat"     Add a new minimal industry and enrich it
  --add "Name" --category "Cat" --notes "..."  Add with context hint
  --scripts-only                    Generate script JSONs for complete industries
  --briefs-only                     Generate brief markdowns for complete industries
  --all                             Enrich pending + scripts + briefs
`);
    return;
  }

  // ── --status ──────────────────────────────────────────────────────────────
  if (hasFlag('--status')) {
    const industries = loadIndustries();
    printStatus(industries);
    return;
  }

  // ── --add ─────────────────────────────────────────────────────────────────
  if (hasFlag('--add')) {
    const newName = getArg('--add');
    const newCategory = getArg('--category');
    const notes = getArg('--notes');

    if (!newName || !newCategory) {
      console.error('Usage: --add "Name" --category "Category" [--notes "..."]');
      process.exit(1);
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.');
      process.exit(1);
    }

    const industries = loadIndustries();
    const archetypes = loadArchetypes();

    const existingId = toId(newName);
    if (industries.find(i => i.id === existingId)) {
      console.error(`Industry "${newName}" already exists (id: ${existingId}).`);
      process.exit(1);
    }

    const newEntry: Industry = {
      id: existingId,
      name: newName,
      category: newCategory,
      ...(notes ? { notes } : {}),
    };

    console.log(`Adding "${newName}" to industries.json...`);
    industries.push(newEntry);

    console.log(`Enriching "${newName}" via Claude...`);
    const enriched = await enrichIndustry(newEntry, archetypes);

    const idx = industries.findIndex(i => i.id === existingId);
    industries[idx] = enriched;
    saveIndustries(industries);

    console.log(`Done. "${newName}" added and enriched.`);
    printStatus([enriched]);
    return;
  }

  // ── --enrich "Name" ───────────────────────────────────────────────────────
  if (hasFlag('--enrich') && getArg('--enrich')) {
    const targetName = getArg('--enrich')!;
    const force = hasFlag('--force');

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: ANTHROPIC_API_KEY not set.');
      process.exit(1);
    }

    const industries = loadIndustries();
    const archetypes = loadArchetypes();

    const target = industries.find(
      i => i.name.toLowerCase() === targetName.toLowerCase()
    );

    if (!target) {
      console.error(`Industry "${targetName}" not found. Use --status to see available industries.`);
      process.exit(1);
    }

    if (getIndustryState(target) === 'complete' && !force) {
      console.log(`"${target.name}" is already complete. Use --force to re-enrich.`);
      return;
    }

    console.log(`Enriching "${target.name}"...`);
    const enriched = await enrichIndustry(target, archetypes);
    const idx = industries.findIndex(i => i.id === target.id);
    industries[idx] = enriched;
    saveIndustries(industries);
    console.log(`Done. "${target.name}" enriched and saved.`);
    return;
  }

  // ── --enrich-only ─────────────────────────────────────────────────────────
  if (hasFlag('--enrich-only')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.');
      process.exit(1);
    }

    const industries = loadIndustries();
    const archetypes = loadArchetypes();
    await enrichPendingIndustries(industries, archetypes);
    return;
  }

  // ── --scripts-only ────────────────────────────────────────────────────────
  if (hasFlag('--scripts-only')) {
    const industries = loadIndustries();
    const archetypes = loadArchetypes();
    console.log('Generating scripts for complete industries...');
    generateAllScripts(industries, archetypes);
    return;
  }

  // ── --briefs-only ─────────────────────────────────────────────────────────
  if (hasFlag('--briefs-only')) {
    const scripts = loadScripts();
    if (scripts.length === 0) {
      console.log('No script JSONs found in output/scripts/. Run --scripts-only first.');
      return;
    }
    console.log(`Generating briefs for ${scripts.length} scripts...`);
    generateAllBriefs(scripts);
    return;
  }

  // ── --all ─────────────────────────────────────────────────────────────────
  if (hasFlag('--all')) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Error: ANTHROPIC_API_KEY not set.');
      process.exit(1);
    }

    console.log('=== Phase 1: Enriching pending industries ===');
    let industries = loadIndustries();
    const archetypes = loadArchetypes();
    industries = await enrichPendingIndustries(industries, archetypes);

    console.log('\n=== Phase 2: Generating scripts ===');
    const scripts = generateAllScripts(industries, archetypes);

    console.log('\n=== Phase 3: Generating briefs ===');
    generateAllBriefs(scripts);

    console.log('\nPipeline complete.');
    return;
  }

  // ── Unknown flags ─────────────────────────────────────────────────────────
  console.error(`Unknown arguments: ${args.join(' ')}`);
  console.error('Run without arguments to see usage.');
  process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
