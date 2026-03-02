/**
 * Generate 15 photorealistic AI interviewer avatars using DALL-E 3
 * and upload them to Azure Blob Storage.
 *
 * Run once: node scripts/generateAvatars.js
 */
require('dotenv').config();

const { BlobServiceClient } = require('@azure/storage-blob');

const OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const OPENAI_KEY = process.env.AZURE_OPENAI_API_KEY;
const STORAGE_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'avatars';

// 15 diverse professional avatar prompts — varied gender, ethnicity, age, attire
const AVATAR_PROMPTS = [
  // --- Formal / Suit (for HR, Director, Panel personas) ---
  { id: 'avatar-01', prompt: 'Professional headshot portrait of a Black woman in her 30s wearing a navy blue blazer over a white blouse, warm confident smile, neutral gray studio background, soft professional lighting, photorealistic, 4K' },
  { id: 'avatar-02', prompt: 'Professional headshot portrait of a Caucasian man in his 50s wearing a charcoal gray suit with a subtle striped tie, distinguished look with silver temples, neutral studio background, soft lighting, photorealistic, 4K' },
  { id: 'avatar-03', prompt: 'Professional headshot portrait of a South Asian woman in her 40s wearing a dark burgundy blazer with gold earrings, confident expression, neutral studio background, professional lighting, photorealistic, 4K' },
  { id: 'avatar-04', prompt: 'Professional headshot portrait of a Hispanic man in his 30s wearing a fitted black suit with open collar white shirt, friendly approachable smile, neutral studio background, soft lighting, photorealistic, 4K' },
  { id: 'avatar-05', prompt: 'Professional headshot portrait of an East Asian woman in her 40s wearing a tailored slate gray blazer, pearl necklace, composed confident expression, neutral studio background, professional lighting, photorealistic, 4K' },

  // --- Business Casual (for Technical Lead personas) ---
  { id: 'avatar-06', prompt: 'Professional headshot portrait of a Caucasian woman in her 30s wearing a teal sweater over a collared shirt, relaxed friendly smile, neutral studio background, soft natural lighting, photorealistic, 4K' },
  { id: 'avatar-07', prompt: 'Professional headshot portrait of a Black man in his 40s wearing a dark green henley under a gray cardigan, thoughtful expression with glasses, neutral studio background, warm lighting, photorealistic, 4K' },
  { id: 'avatar-08', prompt: 'Professional headshot portrait of a Middle Eastern man in his 30s wearing a navy blue polo shirt, short neat beard, friendly confident expression, neutral studio background, soft lighting, photorealistic, 4K' },
  { id: 'avatar-09', prompt: 'Professional headshot portrait of an East Asian man in his 30s wearing a light blue button-down shirt with rolled sleeves, modern glasses, warm smile, neutral studio background, natural lighting, photorealistic, 4K' },
  { id: 'avatar-10', prompt: 'Professional headshot portrait of a Hispanic woman in her 30s wearing a soft gray crew neck sweater, natural curly hair, warm approachable smile, neutral studio background, soft lighting, photorealistic, 4K' },

  // --- More diverse formal/casual mix ---
  { id: 'avatar-11', prompt: 'Professional headshot portrait of a South Asian man in his 50s wearing a dark brown tweed blazer with elbow patches, distinguished professor look, neutral studio background, warm lighting, photorealistic, 4K' },
  { id: 'avatar-12', prompt: 'Professional headshot portrait of a Black woman in her 40s wearing a cream colored blazer over a dark top, statement glasses, confident leadership expression, neutral studio background, professional lighting, photorealistic, 4K' },
  { id: 'avatar-13', prompt: 'Professional headshot portrait of a Caucasian man in his 30s wearing a fitted dark navy sweater, clean shaven, approachable smile, neutral studio background, soft lighting, photorealistic, 4K' },
  { id: 'avatar-14', prompt: 'Professional headshot portrait of a Japanese woman in her 30s wearing a black blazer with a minimalist silver brooch, composed professional expression, neutral studio background, even lighting, photorealistic, 4K' },
  { id: 'avatar-15', prompt: 'Professional headshot portrait of a mixed race man in his 40s wearing a charcoal vest over a light blue dress shirt, confident warm smile, neutral studio background, professional lighting, photorealistic, 4K' },
];

async function generateImage(prompt) {
  const url = `${OPENAI_ENDPOINT}openai/deployments/dall-e-3/images/generations?api-version=2024-02-01`;
  const body = JSON.stringify({
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'standard',
    style: 'natural'
  });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'api-key': OPENAI_KEY, 'Content-Type': 'application/json' },
    body
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`DALL-E error ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return data.data[0].url; // temporary URL to the generated image
}

async function downloadImage(imageUrl) {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function uploadToBlob(blobName, buffer) {
  const blobServiceClient = BlobServiceClient.fromConnectionString(STORAGE_CONN);
  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  await containerClient.createIfNotExists({ access: 'blob' }); // public read for the images
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: 'image/png' }
  });
  return blockBlobClient.url;
}

async function main() {
  console.log('=== AI Avatar Generator ===');
  console.log(`Generating ${AVATAR_PROMPTS.length} avatars using DALL-E 3...\n`);

  const manifest = [];
  // DALL-E 3 rate limit: 3 requests/min — process with delay
  for (let i = 0; i < AVATAR_PROMPTS.length; i++) {
    const { id, prompt } = AVATAR_PROMPTS[i];
    const blobName = `${id}.png`;
    
    console.log(`[${i + 1}/${AVATAR_PROMPTS.length}] Generating ${id}...`);
    try {
      // Generate
      const tempUrl = await generateImage(prompt);
      console.log(`  ✓ Image generated`);

      // Download
      const buffer = await downloadImage(tempUrl);
      console.log(`  ✓ Downloaded (${(buffer.length / 1024).toFixed(0)} KB)`);

      // Upload to blob
      const blobUrl = await uploadToBlob(blobName, buffer);
      console.log(`  ✓ Uploaded → ${blobUrl}`);

      manifest.push({
        id,
        url: blobUrl,
        // Tag formal vs casual for persona matching
        style: i < 5 ? 'formal' : i < 10 ? 'casual' : 'mixed'
      });
    } catch (err) {
      console.error(`  ✗ FAILED: ${err.message}`);
      // Continue with remaining avatars
    }

    // Rate limit: wait 22 seconds between requests (3/min limit)
    if (i < AVATAR_PROMPTS.length - 1) {
      console.log(`  ⏳ Waiting 22s for rate limit...`);
      await new Promise(r => setTimeout(r, 22000));
    }
  }

  // Write manifest
  const manifestJson = JSON.stringify(manifest, null, 2);
  const fs = require('fs');
  const path = require('path');
  
  // Save to client/src for import
  const manifestPath = path.join(__dirname, '..', 'client', 'src', 'avatarManifest.json');
  fs.writeFileSync(manifestPath, manifestJson);
  console.log(`\n✓ Manifest saved to ${manifestPath}`);
  console.log(`✓ ${manifest.length}/${AVATAR_PROMPTS.length} avatars generated successfully`);
  console.log('\nManifest:');
  console.log(manifestJson);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
