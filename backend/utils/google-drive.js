import { google } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';

/**
 * Google Drive Integration Module
 *
 * This module handles uploading files to Google Drive.
 *
 * SETUP INSTRUCTIONS:
 *
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing one
 * 3. Enable Google Drive API
 * 4. Go to "Credentials" → "Create Credentials" → "Service Account"
 * 5. Download the JSON key file
 * 6. Save it as backend/google-drive-credentials.json
 * 7. Share your Google Drive folder with the service account email
 *    (found in the credentials JSON as "client_email")
 * 8. Add GOOGLE_DRIVE_FOLDER_ID to your .env file
 *
 * The folder ID can be found in the URL of your Google Drive folder:
 * https://drive.google.com/drive/folders/YOUR_FOLDER_ID
 */

let drive = null;
let isConfigured = false;

/**
 * Initialize Google Drive client
 */
function initializeDrive() {
  try {
    // Check if credentials file exists
    const credentialsPath = path.join(process.cwd(), 'google-drive-credentials.json');

    // Check if file actually exists before trying to use it
    if (!fs.existsSync(credentialsPath)) {
      throw new Error('Credentials file not found');
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    drive = google.drive({ version: 'v3', auth });
    isConfigured = true;
    console.log('✅ Google Drive integration configured');
  } catch (error) {
    console.log('⚠️  Google Drive not configured. Files will be stored locally.');
    console.log('   To enable: Add google-drive-credentials.json and GOOGLE_DRIVE_FOLDER_ID to .env');
    isConfigured = false;
    drive = null;
  }
}

/**
 * Upload a file to Google Drive
 *
 * @param {Object} params
 * @param {Buffer|string} params.fileData - File data (Buffer or base64 string)
 * @param {string} params.fileName - Name for the file
 * @param {string} params.mimeType - MIME type of the file
 * @param {string} params.folderId - Google Drive folder ID (optional, uses env var if not provided)
 * @returns {Promise<Object>} Result object with file URL and metadata
 */
export async function uploadToGoogleDrive({ fileData, fileName, mimeType, folderId }) {
  if (!isConfigured) {
    throw new Error('Google Drive is not configured. Please add credentials file.');
  }

  try {
    const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!targetFolderId) {
      throw new Error('No folder ID provided. Set GOOGLE_DRIVE_FOLDER_ID in .env');
    }

    // Convert base64 to buffer if needed
    let buffer = fileData;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const base64Data = fileData.split(',')[1];
      buffer = Buffer.from(base64Data, 'base64');
    }

    // Create a readable stream from the buffer
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

    // Upload file metadata and content
    const fileMetadata = {
      name: fileName,
      parents: [targetFolderId],
    };

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink',
    });

    // Make the file publicly accessible (optional - comment out if you want private files)
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Get the direct download link
    const file = await drive.files.get({
      fileId: response.data.id,
      fields: 'id, name, webViewLink, webContentLink, thumbnailLink',
    });

    console.log(`✅ File uploaded to Google Drive: ${fileName}`);
    console.log(`   File ID: ${file.data.id}`);

    return {
      success: true,
      fileId: file.data.id,
      fileName: file.data.name,
      viewUrl: file.data.webViewLink,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${file.data.id}`,
      thumbnailUrl: file.data.thumbnailLink,
      // Direct image URL that can be used in <img> tags
      directImageUrl: `https://drive.google.com/uc?export=view&id=${file.data.id}`,
    };
  } catch (error) {
    console.error('❌ Error uploading to Google Drive:', error.message);
    throw error;
  }
}

/**
 * Delete a file from Google Drive
 *
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<boolean>} Success status
 */
export async function deleteFromGoogleDrive(fileId) {
  if (!isConfigured) {
    return false;
  }

  try {
    await drive.files.delete({ fileId });
    console.log(`✅ File deleted from Google Drive: ${fileId}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting from Google Drive:', error.message);
    return false;
  }
}

/**
 * Check if Google Drive is configured and ready to use
 *
 * @returns {boolean} Configuration status
 */
export function isGoogleDriveConfigured() {
  return isConfigured;
}

// Initialize on module load
initializeDrive();
