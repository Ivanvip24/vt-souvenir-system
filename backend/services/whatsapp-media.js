/**
 * WhatsApp Media Service
 * Handles downloading, uploading, sending media via WhatsApp Cloud API,
 * and audio transcription via Google Speech-to-Text.
 */

import { v2 as cloudinary } from 'cloudinary';
import { log, logError } from '../shared/logger.js';
import { metaApiFetch, getPhoneNumberId } from './whatsapp-api.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Download media from WhatsApp Cloud API by media ID.
 * Step 1: Retrieve the media URL from Meta's API.
 * Step 2: Download the binary content from that URL (Meta CDN requires auth header).
 *
 * @param {string} mediaId - The WhatsApp media ID
 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
export async function downloadWhatsAppMedia(mediaId) {
  try {
    // Step 1: Get media URL from Meta API
    const metadataResponse = await metaApiFetch(`/${mediaId}`);

    if (!metadataResponse.ok) {
      const errorBody = await metadataResponse.text();
      throw new Error(`Failed to get media metadata (${metadataResponse.status}): ${errorBody}`);
    }

    const metadata = await metadataResponse.json();
    const { url, mime_type } = metadata;

    // Step 2: Download binary from the CDN URL (requires auth header)
    const mediaResponse = await metaApiFetch(url);

    if (!mediaResponse.ok) {
      const errorBody = await mediaResponse.text();
      throw new Error(`Failed to download media binary (${mediaResponse.status}): ${errorBody}`);
    }

    const arrayBuffer = await mediaResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, mimeType: mime_type };
  } catch (error) {
    logError('whatsapp.media.download_error', error, { mediaId });
    throw error;
  }
}

/**
 * Upload a media buffer to Cloudinary.
 *
 * @param {Buffer} buffer - The media binary data
 * @param {string} mimeType - MIME type of the media (e.g. 'image/jpeg', 'audio/ogg')
 * @param {string} [folder='whatsapp-media'] - Cloudinary folder
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadMediaToCloudinary(buffer, mimeType, folder = 'whatsapp-media') {
  try {
    const base64 = buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'auto',
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    logError('whatsapp.media.cloudinary_error', error);
    throw error;
  }
}

/**
 * Send an image message via WhatsApp Cloud API.
 *
 * @param {string} to - Recipient phone number (with country code, no +)
 * @param {string} imageUrl - Public URL of the image
 * @param {string} [caption=''] - Optional caption text
 * @returns {Promise<object>} API response data
 */
export async function sendWhatsAppImage(to, imageUrl, caption = '') {
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'image',
      image: {
        link: imageUrl,
        ...(caption && { caption }),
      },
    };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to send image (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logError('whatsapp.media.send_image_error', error, { to });
    throw error;
  }
}

/**
 * Send a document message via WhatsApp Cloud API.
 *
 * @param {string} to - Recipient phone number (with country code, no +)
 * @param {string} documentUrl - Public URL of the document
 * @param {string} filename - Display filename for the document
 * @param {string} [caption=''] - Optional caption text
 * @returns {Promise<object>} API response data
 */
export async function sendWhatsAppDocument(to, documentUrl, filename, caption = '') {
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: documentUrl,
        filename,
        ...(caption && { caption }),
      },
    };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to send document (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logError('whatsapp.media.send_document_error', error, { to });
    throw error;
  }
}

/**
 * Send an audio message via WhatsApp Cloud API.
 *
 * @param {string} to - Recipient phone number (with country code, no +)
 * @param {string} audioUrl - Public URL of the audio file
 * @returns {Promise<object>} API response data
 */
export async function sendWhatsAppAudio(to, audioUrl) {
  try {
    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: {
        link: audioUrl,
      },
    };

    const response = await metaApiFetch(`/${getPhoneNumberId()}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to send audio (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logError('whatsapp.media.send_audio_error', error, { to });
    throw error;
  }
}

/**
 * Transcribe audio using Google Cloud Speech-to-Text.
 * WhatsApp sends audio as audio/ogg with Opus codec.
 * Gracefully returns null if Google credentials are not configured.
 *
 * @param {Buffer} audioBuffer - The audio binary data
 * @param {string} mimeType - MIME type of the audio (e.g. 'audio/ogg; codecs=opus')
 * @returns {Promise<string|null>} Transcribed text, or null if transcription unavailable
 */
export async function transcribeAudio(audioBuffer, mimeType) {
  try {
    const credentialsEnv = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;

    if (!credentialsEnv) {
      log('warn', 'whatsapp.media.no_gcloud_credentials');
      return null;
    }

    const credentials = JSON.parse(credentialsEnv);
    const speech = await import('@google-cloud/speech');
    const SpeechClient = speech.SpeechClient || speech.default?.SpeechClient;
    const client = new SpeechClient({ credentials });

    log('info', 'whatsapp.media.transcribe_start', { size: audioBuffer.length, mimeType });

    const audioContent = audioBuffer.toString('base64');

    // WhatsApp voice notes use OGG Opus; let Google auto-detect sample rate
    const [response] = await client.recognize({
      audio: {
        content: audioContent,
      },
      config: {
        encoding: 'OGG_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'es-MX',
        alternativeLanguageCodes: ['es', 'en-US'],
        model: 'default',
        enableAutomaticPunctuation: true,
      },
    });

    const transcription = response.results
      .map(result => result.alternatives[0]?.transcript || '')
      .join(' ')
      .trim();

    log('info', 'whatsapp.media.transcribe_done', { hasResult: !!transcription });
    return transcription || null;
  } catch (error) {
    logError('whatsapp.media.transcribe_error', error);
    return null;
  }
}
