/**
 * Import a WhatsApp exported chat (.zip) into the database.
 * Usage: node scripts/import-whatsapp-chat.js /path/to/chat.zip [phone_number]
 *
 * - Parses _chat.txt for messages
 * - Uploads media (photos, videos, audio, docs) to Cloudinary
 * - Creates conversation + messages in PostgreSQL
 */

import 'dotenv/config';
import { query } from '../shared/database.js';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Parse WhatsApp chat export format: [DD/MM/YY, HH:MM:SS] Sender: Message
function parseChatFile(chatText) {
  const lines = chatText.split('\n');
  const messages = [];
  // Match: [DD/MM/YY, HH:MM:SS a.m./p.m.] Sender: Message
  const lineRegex = /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?)\]?\s+(.+?):\s(.+)$/i;

  for (const line of lines) {
    const cleaned = line.replace(/\u200e/g, '').replace(/\u202a/g, '').replace(/\u202c/g, '').trim();
    if (!cleaned) continue;

    const match = cleaned.match(lineRegex);
    if (match) {
      const [, dateStr, timeStr, sender, content] = match;

      // Parse date (DD/MM/YY format)
      const [day, month, yearShort] = dateStr.split('/').map(Number);
      const year = yearShort < 100 ? 2000 + yearShort : yearShort;

      // Parse time
      let timePart = timeStr.toLowerCase().replace(/\s+/g, ' ').trim();
      let hours, minutes, seconds = 0;
      const isPM = timePart.includes('p.m') || timePart.includes('pm');
      const isAM = timePart.includes('a.m') || timePart.includes('am');
      timePart = timePart.replace(/[ap]\.?\s*m\.?/gi, '').trim();
      const timeParts = timePart.split(':').map(Number);
      hours = timeParts[0];
      minutes = timeParts[1];
      seconds = timeParts[2] || 0;

      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;

      const date = new Date(year, month - 1, day, hours, minutes, seconds);

      // Check for media attachment
      const attachMatch = content.match(/<attached:\s*(.+?)>/);
      let messageType = 'text';
      let mediaFile = null;
      let textContent = content;

      if (attachMatch) {
        mediaFile = attachMatch[1].trim();
        textContent = content.replace(/<attached:\s*.+?>/, '').replace(/\u200e/g, '').trim();

        if (mediaFile.match(/\.(jpg|jpeg|png|gif|webp)$/i)) messageType = 'image';
        else if (mediaFile.match(/\.(mp4|mov|avi)$/i)) messageType = 'video';
        else if (mediaFile.match(/\.(opus|ogg|mp3|m4a|wav)$/i)) messageType = 'audio';
        else if (mediaFile.match(/\.(pdf|doc|docx|xls|xlsx)$/i)) messageType = 'document';
      }

      // Skip system messages
      if (content.includes('end-to-end encrypted') || content.includes('Messages and calls')) continue;
      if (content.includes('replied to your') && content.includes('ad')) {
        textContent = 'Respondió a tu anuncio de Facebook';
      }

      messages.push({
        date,
        sender: sender.trim(),
        content: textContent || '',
        messageType,
        mediaFile,
      });
    } else if (messages.length > 0) {
      // Continuation line — append to last message
      messages[messages.length - 1].content += '\n' + cleaned;
    }
  }

  return messages;
}

async function uploadToCloudinary(filePath, resourceType = 'image') {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: resourceType === 'audio' ? 'video' : resourceType, // Cloudinary treats audio as video
      folder: 'whatsapp-imports',
      timeout: 60000,
    });
    return result.secure_url;
  } catch (err) {
    console.error(`  ❌ Upload failed for ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

async function main() {
  const zipPath = process.argv[2];
  const phoneOverride = process.argv[3];

  if (!zipPath) {
    console.error('Usage: node scripts/import-whatsapp-chat.js /path/to/chat.zip [phone_number]');
    process.exit(1);
  }

  // Extract zip to temp dir
  const extractDir = '/tmp/wa-import-' + Date.now();
  fs.mkdirSync(extractDir, { recursive: true });
  execSync(`unzip -o "${zipPath}" -d "${extractDir}"`, { stdio: 'pipe' });

  // Find chat file
  const chatFile = path.join(extractDir, '_chat.txt');
  if (!fs.existsSync(chatFile)) {
    console.error('❌ _chat.txt not found in zip');
    process.exit(1);
  }

  const chatText = fs.readFileSync(chatFile, 'utf8');
  const messages = parseChatFile(chatText);
  console.log(`📱 Parsed ${messages.length} messages`);

  // Detect senders
  const senders = [...new Set(messages.map(m => m.sender))];
  console.log(`👥 Senders: ${senders.join(', ')}`);

  // Determine which is the business (Axkan/Ivan) and which is the client
  const businessNames = ['axkan', 'ivan', 'iván', 'vt anunciando'];
  let businessSender = null;
  let clientSender = null;

  for (const s of senders) {
    if (businessNames.some(b => s.toLowerCase().includes(b))) {
      businessSender = s;
    } else {
      clientSender = s;
    }
  }

  if (!businessSender || !clientSender) {
    console.log('⚠️  Could not auto-detect senders. Using first two:');
    clientSender = senders[0];
    businessSender = senders[1] || senders[0];
  }

  console.log(`🏪 Business: "${businessSender}" | 👤 Client: "${clientSender}"`);

  // Extract phone from zip filename or use override
  let clientPhone = phoneOverride;
  if (!clientPhone) {
    const phoneMatch = path.basename(zipPath).match(/\+?\d[\d\s]{8,}/);
    if (phoneMatch) {
      clientPhone = phoneMatch[0].replace(/\s+/g, '');
      if (!clientPhone.startsWith('52')) clientPhone = '52' + clientPhone;
    }
  }
  clientPhone = clientPhone || 'imported_' + Date.now();
  console.log(`📞 Client phone: ${clientPhone}`);

  // Create conversation
  const convResult = await query(
    `INSERT INTO whatsapp_conversations (wa_id, client_name, status, last_message_at, created_at)
     VALUES ($1, $2, 'active', $3, $4)
     ON CONFLICT (wa_id) DO UPDATE SET client_name = $2, last_message_at = $3, updated_at = NOW()
     RETURNING id`,
    [clientPhone, clientSender, messages[messages.length - 1]?.date || new Date(), messages[0]?.date || new Date()]
  );
  const conversationId = convResult.rows[0].id;
  console.log(`💬 Conversation ID: ${conversationId}`);

  // Import messages
  let imported = 0;
  let mediaUploaded = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isClient = msg.sender === clientSender;
    const direction = isClient ? 'inbound' : 'outbound';
    const sender = isClient ? 'client' : 'admin';

    let mediaUrl = null;

    // Upload media if present
    if (msg.mediaFile) {
      const mediaPath = path.join(extractDir, msg.mediaFile);
      if (fs.existsSync(mediaPath)) {
        const resourceType = msg.messageType === 'video' ? 'video' :
                            msg.messageType === 'audio' ? 'audio' :
                            msg.messageType === 'document' ? 'raw' : 'image';
        process.stdout.write(`  📤 Uploading ${msg.mediaFile}...`);
        mediaUrl = await uploadToCloudinary(mediaPath, resourceType);
        if (mediaUrl) {
          mediaUploaded++;
          process.stdout.write(` ✅\n`);
        } else {
          process.stdout.write(` ❌\n`);
        }
      }
    }

    const content = msg.content || (msg.mediaFile ? `[${msg.messageType}]` : '');

    await query(
      `INSERT INTO whatsapp_messages (conversation_id, wa_message_id, direction, sender, message_type, content, media_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        conversationId,
        `import_${i}_${Date.now()}`,
        direction,
        sender,
        msg.messageType,
        content,
        mediaUrl,
        msg.date,
      ]
    );

    imported++;
    if (imported % 20 === 0) console.log(`  📝 ${imported}/${messages.length} messages imported...`);
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   📝 ${imported} messages imported`);
  console.log(`   📤 ${mediaUploaded} media files uploaded to Cloudinary`);
  console.log(`   💬 Conversation ID: ${conversationId}`);
  console.log(`   📞 Phone: ${clientPhone}`);
  console.log(`   👤 Client: ${clientSender}`);

  // Cleanup
  execSync(`rm -rf "${extractDir}"`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
