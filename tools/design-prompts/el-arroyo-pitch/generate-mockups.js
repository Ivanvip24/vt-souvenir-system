const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyBOsXeKwdkwvRRkp9Oq_CNtytpsZEBdG0I';
const OUTPUT_DIR = path.join(__dirname, 'mockups');

const prompts = [
  {
    name: 'marquee-sign-magnet',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet, photographed at a 45-degree floating angle on a clean white background with soft studio lighting. The magnet has an organic cloud/scalloped silhouette shape (NOT rectangular), approximately 12cm wide. The visible MDF wood edge is warm tan/beige (#D4A574).

The magnet design features: A miniature recreation of El Arroyo's iconic marquee sign from Austin, Texas. The classic roadside letter board is rendered in detailed illustration style with black letters on white background reading "KEEP AUSTIN WEIRD". The sign sits against a warm sunset sky with the Austin skyline silhouette. Below the sign, colorful Tex-Mex elements: chili peppers, maracas, and a small cactus. The word "AUSTIN" appears at the bottom in bold, chunky letters where each letter is a different vibrant color (magenta, green, orange, turquoise, red) in a fun, playful font.

The magnet has a glossy, candy-like protective film finish catching studio light reflections. Soft drop shadow beneath. Professional product photography, 85mm lens, f/2.8, studio lighting.`
  },
  {
    name: 'queso-bottle-opener',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF bottle opener souvenir, photographed at a 45-degree floating angle on a clean white background with soft studio lighting. The bottle opener is approximately 10cm tall with an organic shape, featuring a metal opener mechanism at the bottom with double rivet detail, and a rear magnet. The visible MDF wood edge is warm tan/beige (#D4A574).

The bottle opener design features: A vibrant, fun Tex-Mex themed illustration celebrating El Arroyo Austin's famous queso culture. A steaming bowl of golden queso dip with tortilla chips arranged around it, decorated with jalapeño peppers and lime wedges. The background has warm orange (#EA7603) gradient tones. Text reads "QUESO IS MY LOVE LANGUAGE" in a bold, playful marquee-style font. Small El Arroyo marquee sign silhouette incorporated as a decorative element.

The product has a glossy, candy-like protective film finish catching studio light reflections. Soft drop shadow beneath. Professional product photography, 85mm lens, f/2.8, studio lighting.`
  },
  {
    name: 'taco-keychain',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF keychain souvenir, photographed at a 45-degree floating angle on a clean white background with soft studio lighting. The keychain is approximately 8cm tall with an organic cloud shape and a reinforced metal ring at the top. The visible MDF wood edge is warm tan/beige (#D4A574).

The keychain design features: A cheerful, cartoon-style taco character wearing a tiny cowboy hat and cowboy boots, in a fun celebratory pose. The taco is filled with colorful ingredients - lettuce, tomato, cheese, meat. Behind the taco character, the Austin Texas skyline silhouette in warm orange (#EA7603). The text "EL ARROYO" curves above in a classic Tex-Mex font style, and "AUSTIN, TX" appears below in smaller bold letters. Decorative chili pepper and star accents surround the design.

The product has a glossy, candy-like protective film finish catching studio light reflections. Soft drop shadow beneath. Professional product photography, 85mm lens, f/2.8, studio lighting.`
  },
  {
    name: 'margarita-magnet',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet, photographed at a 45-degree floating angle on a clean white background with soft studio lighting. The magnet has a flowing, organic wave shape (NOT rectangular), approximately 14cm wide (grande size). The visible MDF wood edge is warm tan/beige (#D4A574).

The magnet design features: A festive, vibrant illustration of a giant frozen margarita glass with a salted rim and lime wedge, surrounded by tropical elements - hibiscus flowers, palm leaves, and Mexican folk art patterns. The margarita glass reflects the Austin Congress Avenue Bridge and bat silhouettes at sunset. The text "MERRY MARGARITA" appears in fun, bold multicolored letters (each letter a different color: magenta #e72a88, green #8ab73b, orange #f39223, turquoise #09adc2). Below in smaller text: "EL ARROYO - AUSTIN TX". The overall color palette blends El Arroyo's signature orange with tropical greens and sunset pinks.

The magnet has a glossy, candy-like protective film finish catching studio light reflections. Soft drop shadow beneath. Professional product photography, 85mm lens, f/2.8, studio lighting.`
  },
  {
    name: 'sign-collection-display',
    prompt: `Ultra-realistic product photography showing a collection of 4 different premium laser-cut MDF souvenir magnets arranged in a pleasing scattered layout on a rustic wooden table surface with a white marble countertop partially visible. Each magnet has a different organic shape (cloud, wave, pebble, rounded) with visible warm tan MDF wood edges (#D4A574) and glossy protective film finish.

The magnets feature El Arroyo Austin themed designs:
1. A marquee sign reading "TACOS ARE THE ANSWER" with sunset sky background
2. A Tex-Mex themed design with a cowboy boot filled with queso, text "EL ARROYO AUSTIN"
3. An armadillo wearing sunglasses lounging by the Colorado River with Austin skyline, text "KEEP IT WEIRD"
4. A bowl of salsa with dancing chili peppers, text "OUR SALSA IS NO JOKE"

All designs use vibrant colors blending El Arroyo's orange (#EA7603) with Mexican folk art colors (magenta, turquoise, green). Each magnet approximately 10-14cm. Warm, inviting lifestyle photography with natural window light, 50mm lens, f/4, slightly overhead angle. A small potted cactus and a coffee mug with an El Arroyo logo visible in the soft background blur.`
  },
  {
    name: 'premium-gift-set',
    prompt: `Ultra-realistic product photography of a premium AXKAN souvenir gift box set arranged on an elegant dark charcoal surface. The gift box is open, revealing a curated collection of El Arroyo Austin custom products nestled in cream-colored tissue paper:

- 2 laser-cut MDF magnets (organic cloud shapes, ~12cm each) with El Arroyo marquee sign designs
- 1 laser-cut MDF bottle opener (~10cm) with Tex-Mex themed art and metal opener mechanism
- 1 laser-cut MDF keychain with reinforced metal ring, featuring a taco cowboy design
- 2 metallic pin buttons with witty El Arroyo sign sayings

All products show visible warm tan MDF wood edges (#D4A574) and glossy candy-like film finish catching light. The box has a premium feel with the AXKAN brand subtly embossed. A small card reads "Custom Collection - El Arroyo x AXKAN". The overall aesthetic is premium, gift-worthy, and distinctly Tex-Mex meets professional souvenir design.

Professional product photography, 85mm lens, f/2.8, studio lighting with warm accent light from the left. Clean, luxurious composition.`
  }
];

async function generateImage(prompt, filename) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.candidates && response.candidates[0]) {
            const parts = response.candidates[0].content.parts;
            for (const part of parts) {
              if (part.inlineData) {
                const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
                const ext = part.inlineData.mimeType.includes('png') ? 'png' : 'jpg';
                const filepath = path.join(OUTPUT_DIR, `${filename}.${ext}`);
                fs.writeFileSync(filepath, imageBuffer);
                console.log(`  Saved: ${filepath}`);
                resolve(filepath);
                return;
              }
            }
          }
          console.log(`  No image in response for ${filename}:`, JSON.stringify(response).substring(0, 200));
          reject(new Error('No image in response'));
        } catch (e) {
          console.log(`  Parse error for ${filename}:`, e.message);
          reject(e);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  Request error for ${filename}:`, e.message);
      reject(e);
    });

    req.write(requestBody);
    req.end();
  });
}

async function main() {
  console.log('Generating El Arroyo x AXKAN mockup images...\n');

  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const { name, prompt } = prompts[i];
    console.log(`[${i + 1}/${prompts.length}] Generating: ${name}...`);
    try {
      const filepath = await generateImage(prompt, name);
      results.push({ name, filepath, success: true });
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
      results.push({ name, success: false, error: err.message });
    }

    // Small delay between requests
    if (i < prompts.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\n--- Results ---');
  results.forEach(r => {
    console.log(`${r.success ? 'OK' : 'FAIL'} ${r.name}${r.filepath ? ` -> ${r.filepath}` : ''}`);
  });
}

main().catch(console.error);
