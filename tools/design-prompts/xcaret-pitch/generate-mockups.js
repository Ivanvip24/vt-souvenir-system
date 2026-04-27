const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyBOsXeKwdkwvRRkp9Oq_CNtytpsZEBdG0I';
const OUTPUT_DIR = path.join(__dirname, 'mockups');

const prompts = [
  {
    name: '01-xcaret-jaguar',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has an organic cloud/jungle-canopy silhouette shape (NOT circular, NOT rectangular), approximately 14cm wide. The visible MDF wood edge is warm tan/beige. The magnet has a glossy candy-like protective film finish catching studio light reflections.

The design features: A majestic jaguar emerging from lush tropical jungle foliage in the style of a vibrant Mexican folk art illustration. Dense emerald green tropical leaves, bright scarlet macaws perching on branches, colorful butterflies, pink tropical flowers, and a hidden cenote with crystal turquoise water visible below. The word "XCARET" appears at the bottom in bold chunky playful letters, each letter a different vibrant color (green, pink, yellow, turquoise, red). Below in elegant script: "by Mexico". The overall palette is rich greens, tropical pinks, Caribbean turquoise, and golden yellows - explosively colorful and detailed.

Photographed at 45-degree floating angle, soft drop shadow beneath. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '02-xelha-sea-turtle',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has an organic flowing wave silhouette shape (like an ocean swell, NOT circular), approximately 14cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A magnificent sea turtle swimming through crystal-clear Caribbean waters rendered in vivid, detailed illustration style. The turquoise water gradients from light aqua at the top to deep blue at the bottom. Tropical fish, coral reef elements, and rays of golden sunlight filter through the water. A silhouette of the Xel-Ha lighthouse (El Faro) is visible at the top against a sunset sky. The text "XEL-HA" appears in bold aquatic-styled letters with a water texture effect in turquoise and teal. Below: "Hidden Wonder - by Xcaret, Mexico". Seashells and starfish decorative accents frame the edges.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '03-xplor-adventure',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a dynamic organic stalactite/cave-mouth silhouette shape (NOT circular), approximately 12cm tall. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: An epic underground river scene in a massive limestone cavern. A tiny human figure on a zip-line soars across the cavern with dramatic golden light streaming from above. Glowing stalactites and stalagmites frame the composition. Underground turquoise river below with crystal reflections. Lush jungle ferns grow at the cave entrance. The style is dramatic and adventurous, rich with amber, gold, turquoise and earth tones. The text "XPLOR" appears in bold stone-carved style letters with an earthy texture. Below: "by Xcaret, Mexico". Cave painting motifs subtly decorate the border.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '04-xplor-fuego',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a dramatic flame-inspired organic silhouette shape (NOT circular, NOT rectangular), approximately 13cm tall. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A dramatic nighttime scene with a massive flaming dinosaur skeleton (T-Rex) silhouetted against a blazing fire backdrop. Torches line a dark jungle path, their flames creating orange and red light that illuminates the prehistoric bones. Sparks and embers float upward against a deep dark purple-black night sky. The atmosphere is intense and thrilling. The text "XPLOR FUEGO" appears in fiery letters that glow orange-red as if made of molten lava and embers. Below: "by Xcaret, Mexico". The color palette is dramatic: deep blacks, fiery oranges, reds, amber golds, and purple shadows.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '05-xenses-surreal',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a psychedelic, surreal organic swirl silhouette shape (NOT circular), approximately 13cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A mind-bending surrealist illustration inspired by the Xenses sensory park. An impossible landscape where everything is tilted and dreamlike - an upside-down house, a river flowing uphill, oversized flowers, and tiny human figures in colorful rain ponchos sliding through a kaleidoscopic world. Vibrant neon colors: electric purple, hot pink, lime green, bright yellow, electric blue. Geometric patterns from Maya art blend with psychedelic optical illusions. Paint splashes and confetti burst from the edges. The text "XENSES" appears in 3D chrome-effect letters that seem to float. Below: "by Xcaret, Mexico". The entire design bursts with sensory overload and joy.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '06-xoximilco-fiesta',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a festive organic scalloped shape reminiscent of a papel picado banner (NOT circular), approximately 14cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A vibrant Mexican floating fiesta scene on colorful trajinera boats (like Xochimilco). Mariachi musicians in full charro outfits playing guitars and trumpets on a brightly decorated boat. Papel picado banners string across the top. Colorful flower arches frame the boats. The water reflects warm golden lantern light. A lucha libre mask, maracas, and tequila bottle add festive cultural touches. Mexican flag colors weave through the composition. The text "XOXIMILCO" appears in bold, fiesta-style letters decorated with flowers and ribbons in magenta, green, and gold. Below: "Mexican Floating Fiesta - by Xcaret, Mexico". Rich, warm palette: magenta, gold, royal blue, emerald green, sunset orange.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '07-xavage-wild',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a fierce claw-scratch organic silhouette shape (NOT circular), approximately 12cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: An explosive action-packed extreme adventure composition. A puma mid-leap dominates the center, surrounded by dynamic elements: white water rapids splashing, a monster truck wheel, zip-line cables cutting across, and jet boat water spray. The jungle bursts in from the edges with wild vegetation. Three diagonal claw scratches reveal the turquoise Caribbean ocean beneath, as if the wild surface is being torn open. Raw energy and adrenaline radiate from every element. The text "XAVAGE" appears in bold, rugged, distressed military-style stencil letters. Below: "Unleash the Wild Within - by Xcaret, Mexico". Color palette: army green, turquoise, burnt orange, black, and metallic bronze accents.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '08-xcaret-mexico-espectacular',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has a grand theatrical curtain/stage silhouette shape (NOT circular, NOT rectangular), approximately 14cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A spectacular celebration of Mexican cultural diversity inspired by the "Mexico Espectacular" show. Center: the Virgin of Guadalupe rendered in beautiful golden and green tones, surrounded by folk dancers from different Mexican states in their traditional costumes (Jalisco, Oaxaca, Veracruz). A pre-Hispanic pyramid silhouette rises behind. Papel picado borders the top. Below: Day of the Dead sugar skull motifs, marigold flowers, and a Mexican eagle. The overall composition is rich, layered, and celebrates Mexico's cultural tapestry. The text "XCARET" appears in ornate gold-embossed style letters. Below: "Mexico Espectacular". Palette: deep gold, emerald green, ruby red, royal purple, warm earth tones - like a living mural.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '09-xenotes-cenote',
    prompt: `Ultra-realistic product photography of a premium laser-cut MDF souvenir magnet on a clean white background with soft studio lighting. The magnet has an organic cenote-opening silhouette shape (round-ish but with natural rock edges, NOT a perfect circle), approximately 12cm wide. The visible MDF wood edge is warm tan/beige. Glossy candy-like protective film finish.

The design features: A breathtaking birds-eye view looking down into a sacred cenote. Lush green jungle vegetation frames the circular opening. Crystal-clear turquoise water at the bottom reveals an underwater cave system. Hanging vines and aerial roots descend from the rim. A tiny kayaker floats on the pristine water below. Rays of golden sunlight pierce through the canopy creating god-rays in the water. Ancient Maya stone carvings subtly line the cenote walls. Small butterflies and a hummingbird hover near the opening. The text "XENOTES" appears at the bottom in elegant nature-inspired letters with leaf and vine details. Below: "by Xcaret, Mexico". Palette: lush greens, crystal turquoise, golden light, limestone grey, earth brown.

Photographed at 45-degree floating angle, soft drop shadow. Professional product photography, 85mm lens, f/2.8.`
  },
  {
    name: '10-collection-lifestyle',
    prompt: `Ultra-realistic lifestyle product photography showing a beautiful collection of 6 different premium laser-cut MDF souvenir magnets artfully displayed on a rustic Mexican wooden surface with tropical leaves as props. Each magnet has a different organic shape (NOT circular, NOT rectangular) with visible warm tan MDF wood edges and glossy protective film finish catching warm light.

The magnets feature different Xcaret park themed designs in explosively vibrant colors:
1. A jungle jaguar with tropical foliage for "XCARET"
2. A sea turtle in turquoise waters for "XEL-HA"
3. A flaming dinosaur skeleton for "XPLOR FUEGO"
4. A colorful fiesta scene for "XOXIMILCO"
5. A surreal psychedelic design for "XENSES"
6. An underground cave adventure for "XPLOR"

Each magnet is approximately 10-14cm. The overall composition feels premium, artisanal, and authentically Mexican. A small potted succulent plant and a hand-woven Mexican textile add warmth to the scene. Warm natural daylight from a window, 50mm lens, f/4, slightly overhead angle. The magnets look collectible and high-quality, clearly NOT cheap Chinese imports.

Clean white background visible in the background areas. Professional lifestyle product photography.`
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
          console.log(`  No image for ${filename}:`, JSON.stringify(response).substring(0, 300));
          reject(new Error('No image in response'));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(requestBody);
    req.end();
  });
}

async function main() {
  console.log('Generating Xcaret x AXKAN mockup images (10 designs)...\n');
  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const { name, prompt } = prompts[i];
    console.log(`[${i + 1}/${prompts.length}] Generating: ${name}...`);
    try {
      const filepath = await generateImage(prompt, name);
      results.push({ name, filepath, success: true });
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      results.push({ name, success: false });
    }
    if (i < prompts.length - 1) await new Promise(r => setTimeout(r, 3000));
  }

  console.log('\n=== RESULTS ===');
  results.forEach(r => console.log(`${r.success ? 'OK' : 'FAIL'} ${r.name}`));
  console.log(`\nSuccess: ${results.filter(r => r.success).length}/${results.length}`);
}

main().catch(console.error);
