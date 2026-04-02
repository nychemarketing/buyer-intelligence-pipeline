/**
 * generate-frankenstein-prompts.ts
 * Adds a frankensteinPrompt (Midjourney) to every script JSON in output/scripts/.
 * Frankenstein's monster appears IN the industry scene as a pattern-interrupt hook.
 *
 * Usage:
 *   npx ts-node scripts/generate-frankenstein-prompts.ts
 *   npx ts-node scripts/generate-frankenstein-prompts.ts --slug nail-salon
 */

import Anthropic from '@anthropic-ai/sdk';
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

const SCRIPTS_DIR = path.join(__dirname, '..', 'output', 'scripts');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generatePrompt(industryName: string, category: string): Promise<string> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You write cinematic editorial image generation prompts.

Write ONE prompt for a ${industryName} scene using this exact formula:

CONCEPT: Frankenstein's monster is the CUSTOMER — he represents the impossible "average customer" that businesses try to speak to with one message. He is stitched together from 5 different buyer types and impossible to please. The human is the SERVICE PROVIDER desperately trying to help him.

FRANKENSTEIN (the customer): Classic friendly Frankenstein — pale green skin, metallic neck bolts, flat-topped head with dark stitches across his forehead, large gentle eyes, normal humanoid proportions. NOT scary. Dressed as a normal ${industryName} customer/client. He is calm, serious, acting completely normal — pointing at something, gesturing, or waiting to be served. He has no idea he's unusual.

HUMAN (the service provider): A ${industryName} professional holding a clipboard or relevant tool, nodding politely but visibly sweating, eyes slightly wide, doing their absolute best to figure out what this impossible customer actually wants.

SETTING: Where a ${industryName} customer would naturally be — at the business location or a consultation. Realistic industry-specific props and environment.

COMEDY: Frankenstein is the calm one. The human professional is barely holding it together trying to serve him.

STYLE: Bright warm professional lighting, shallow depth of field, hyper-detailed skin textures, cinematic editorial photography. Close with: "captured with shallow depth of field and hyper-detailed textures that emphasize the surreal yet deadpan customer service scenario."

Industry: ${industryName}
Category: ${category}

Return ONLY the prompt text, nothing else. No --ar or --v flags.`
    }],
  });

  return response.content
    .filter(b => b.type === 'text')
    .map(b => (b as any).text)
    .join('')
    .trim();
}

async function main() {
  const slugIdx = process.argv.indexOf('--slug');
  const targetSlug = slugIdx !== -1 ? process.argv[slugIdx + 1] : null;

  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.json'));
  const targets = targetSlug
    ? files.filter(f => f === `${targetSlug}.json`)
    : files;

  if (targets.length === 0) {
    console.error(targetSlug
      ? `No script found for slug: ${targetSlug}`
      : 'No script files found in output/scripts/');
    process.exit(1);
  }

  console.log(`Generating Frankenstein prompts for ${targets.length} industries...\n`);

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    await Promise.all(batch.map(async (file) => {
      const filePath = path.join(SCRIPTS_DIR, file);
      const script = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Skip if already has a prompt (unless forcing)
      if (script.frankensteinPrompt && !process.argv.includes('--force')) {
        console.log(`  ↷ ${script.industry} (already has prompt, use --force to regenerate)`);
        return;
      }

      process.stdout.write(`  → ${script.industry}...`);
      try {
        const prompt = await generatePrompt(script.industry, script.category);
        script.frankensteinPrompt = prompt;
        fs.writeFileSync(filePath, JSON.stringify(script, null, 2), 'utf-8');
        console.log(' done');
      } catch (err) {
        console.log(` ERROR: ${err}`);
      }
    }));
  }

  console.log('\nAll done. Frankenstein prompts added to output/scripts/*.json');
  console.log('Field name: frankensteinPrompt');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
