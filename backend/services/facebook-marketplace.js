/**
 * Facebook Marketplace Integration Service
 *
 * Handles:
 * - Queuing designs for Facebook Marketplace upload
 * - Generating CSV files for the bot
 * - Running the Python bot
 * - Tracking upload status
 */

import { query } from '../shared/database.js';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { log, logError } from '../shared/logger.js';

const execAsync = promisify(exec);

// Bot configuration
const BOT_PATH = path.join(process.cwd(), '..', 'facebook-marketplace-bot');
const CSV_PATH = path.join(BOT_PATH, 'csvs', 'items.csv');
const PHOTOS_BASE_PATH = path.join(BOT_PATH, 'fotos-axkan');

// Default listing settings
const DEFAULT_PRICE = '11';
const DEFAULT_CATEGORY = 'Home & Garden';
const DEFAULT_CONDITION = 'New';
const DEFAULT_BRAND = 'AXKAN';
const DEFAULT_LOCATION = 'Mexico City, Mexico';

const DEFAULT_DESCRIPTION = `🎁 SOUVENIRS PERSONALIZADOS AXKAN - SOUVENIRS ÚNICOS 🎁

✨ Imanes de MDF de alta calidad
✨ Diseños personalizados
✨ Perfectos para recuerdos, eventos y regalos

📦 Pedido mínimo: 100 piezas
💰 Precio por pieza desde $11 MXN

📱 Contáctanos para tu pedido personalizado
🌐 axkan-pedidos.vercel.app

#souvenirs #imanes #personalizados #recuerdos #eventos #bodas #xvaños #bautizos`;

/**
 * Queue a design image for Facebook Marketplace upload
 */
export async function queueDesignForUpload(orderId, orderItemId, imageUrl, title) {
  try {
    const result = await query(
      `INSERT INTO facebook_listings (order_id, order_item_id, image_url, listing_title, listing_status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (image_url) DO UPDATE SET
         listing_title = EXCLUDED.listing_title,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [orderId, orderItemId, imageUrl, title]
    );

    log('info', 'facebook.queued', { title });
    return result.rows[0];
  } catch (error) {
    logError('facebook.queue_error', error);
    throw error;
  }
}

/**
 * Get all pending uploads
 */
export async function getPendingUploads() {
  const result = await query(`
    SELECT * FROM facebook_listings
    WHERE listing_status = 'pending'
    ORDER BY created_at ASC
    LIMIT 50
  `);
  return result.rows;
}

/**
 * Get upload status for an order
 */
export async function getOrderFacebookStatus(orderId) {
  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE listing_status = 'uploaded') as uploaded,
      COUNT(*) FILTER (WHERE listing_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE listing_status = 'failed') as failed
    FROM facebook_listings
    WHERE order_id = $1
  `, [orderId]);

  return result.rows[0];
}

/**
 * Check if an image is already uploaded to Facebook
 */
export async function isImageUploaded(imageUrl) {
  const result = await query(
    `SELECT id, listing_status FROM facebook_listings WHERE image_url = $1`,
    [imageUrl]
  );

  if (result.rows.length === 0) return { queued: false, uploaded: false };

  return {
    queued: true,
    uploaded: result.rows[0].listing_status === 'uploaded',
    status: result.rows[0].listing_status
  };
}

/**
 * Generate CSV file for the bot from pending uploads
 */
export async function generateCSVForBot() {
  const pending = await getPendingUploads();

  if (pending.length === 0) {
    log('info', 'facebook.no_pending');
    return null;
  }

  log('info', 'facebook.csv.generating', { count: pending.length });

  // CSV header
  const header = '"Title","Photos Folder","Photos Names","Price","Category","Condition","Brand","Description","Location","Groups"';

  // Generate rows
  const rows = pending.map(listing => {
    // Extract filename from URL
    const imageUrl = listing.image_url;
    const fileName = path.basename(imageUrl);

    // Use a consistent photos folder (we'll need to download images first)
    const photosFolder = PHOTOS_BASE_PATH;

    // Escape double quotes in strings
    const escape = (str) => str ? str.replace(/"/g, '""') : '';

    return [
      `"${escape(listing.listing_title)}"`,
      `"${escape(photosFolder)}"`,
      `"${escape(fileName)}"`,
      `"${listing.listing_price || DEFAULT_PRICE}"`,
      `"${DEFAULT_CATEGORY}"`,
      `"${DEFAULT_CONDITION}"`,
      `"${DEFAULT_BRAND}"`,
      `"${escape(DEFAULT_DESCRIPTION)}"`,
      `"${DEFAULT_LOCATION}"`,
      `""`  // No groups for now
    ].join(',');
  });

  // Write CSV file
  const csvContent = [header, ...rows].join('\n');

  fs.writeFileSync(CSV_PATH, csvContent, 'utf8');
  log('info', 'facebook.csv.generated', { path: CSV_PATH });

  return {
    path: CSV_PATH,
    count: pending.length,
    listings: pending
  };
}

/**
 * Download images from URLs to local folder for bot to use
 */
export async function downloadImagesForBot(listings) {
  const downloadFolder = path.join(BOT_PATH, 'fotos-pending');

  // Create folder if it doesn't exist
  if (!fs.existsSync(downloadFolder)) {
    fs.mkdirSync(downloadFolder, { recursive: true });
  }

  log('info', 'facebook.download.start', { count: listings.length });

  for (const listing of listings) {
    try {
      const imageUrl = listing.image_url;
      const fileName = path.basename(imageUrl);
      const localPath = path.join(downloadFolder, fileName);

      // Skip if already exists
      if (fs.existsSync(localPath)) {
        log('info', 'facebook.download.skip', { fileName });
        continue;
      }

      // Download using curl
      await execAsync(`curl -s -o "${localPath}" "${imageUrl}"`);
      log('info', 'facebook.download.done', { fileName });

    } catch (error) {
      logError('facebook.download.error', error, { imageUrl: listing.image_url });
    }
  }

  return downloadFolder;
}

/**
 * Run the Facebook Marketplace bot
 */
export async function runFacebookBot() {
  log('info', 'facebook.bot.start');

  try {
    // Check if bot exists
    if (!fs.existsSync(BOT_PATH)) {
      throw new Error(`Bot not found at: ${BOT_PATH}`);
    }

    // Run the Python bot
    const { stdout, stderr } = await execAsync(
      `cd "${BOT_PATH}" && python3 main.py`,
      { timeout: 600000 } // 10 minute timeout
    );

    log('info', 'facebook.bot.output', { stdout });
    if (stderr) log('warn', 'facebook.bot.stderr', { stderr });

    return { success: true, output: stdout };

  } catch (error) {
    logError('facebook.bot.error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Mark listings as uploaded
 */
export async function markAsUploaded(listingIds) {
  await query(
    `UPDATE facebook_listings
     SET listing_status = 'uploaded',
         uploaded_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1)`,
    [listingIds]
  );

  log('info', 'facebook.marked_uploaded', { count: listingIds.length });
}

/**
 * Mark listing as failed
 */
export async function markAsFailed(listingId, errorMessage) {
  await query(
    `UPDATE facebook_listings
     SET listing_status = 'failed',
         upload_attempts = upload_attempts + 1,
         error_message = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [listingId, errorMessage]
  );
}

/**
 * Full upload process: generate CSV, download images, run bot, update status
 */
export async function runFullUploadProcess() {
  log('info', 'facebook.upload.start');
  ;

  try {
    // 1. Generate CSV
    const csvResult = await generateCSVForBot();

    if (!csvResult) {
      log('info', 'facebook.upload.none');
      return { success: true, uploaded: 0 };
    }

    // 2. Download images
    await downloadImagesForBot(csvResult.listings);

    // 3. Run the bot
    const botResult = await runFacebookBot();

    if (botResult.success) {
      // 4. Mark all as uploaded
      const listingIds = csvResult.listings.map(l => l.id);
      await markAsUploaded(listingIds);

      log('info', 'facebook.upload.complete', { count: listingIds.length });
      return { success: true, uploaded: listingIds.length };
    } else {
      log('error', 'facebook.upload.bot_failed');
      return { success: false, error: botResult.error };
    }

  } catch (error) {
    logError('facebook.upload.error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get Facebook upload statistics
 */
export async function getUploadStats() {
  const result = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE listing_status = 'uploaded') as uploaded,
      COUNT(*) FILTER (WHERE listing_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE listing_status = 'failed') as failed,
      MAX(uploaded_at) as last_upload
    FROM facebook_listings
  `);

  return result.rows[0];
}

export default {
  queueDesignForUpload,
  getPendingUploads,
  getOrderFacebookStatus,
  isImageUploaded,
  generateCSVForBot,
  downloadImagesForBot,
  runFacebookBot,
  markAsUploaded,
  markAsFailed,
  runFullUploadProcess,
  getUploadStats
};
