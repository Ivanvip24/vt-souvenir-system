import { v2 as cloudinary } from 'cloudinary';

// Validate required Cloudinary environment variables
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  throw new Error('Cloudinary configuration is required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set in environment variables');
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET
});

/**
 * Upload image to Cloudinary
 * @param {Buffer|string} file - File buffer or base64 string
 * @param {string} folder - Folder name in Cloudinary (e.g., 'payment-receipts')
 * @param {string} publicId - Optional custom public ID
 * @returns {Promise<Object>} Upload result with secure_url
 */
export async function uploadImage(file, folder = 'payment-receipts', publicId = null) {
  try {
    const options = {
      folder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'],
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' }, // Limit max dimensions
        { quality: 'auto:good' }, // Automatic quality optimization
        { fetch_format: 'auto' } // Automatic format selection
      ]
    };

    if (publicId) {
      options.public_id = publicId;
    }

    const result = await cloudinary.uploader.upload(file, options);

    console.log(`✅ Image uploaded to Cloudinary: ${result.secure_url}`);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes
    };

  } catch (error) {
    console.error('❌ Cloudinary upload error:', error.message);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteImage(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);

    console.log(`🗑️ Image deleted from Cloudinary: ${publicId}`);

    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error.message);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Get optimized URL for an image
 * @param {string} publicId - The public ID of the image
 * @param {Object} options - Transformation options
 * @returns {string} Optimized image URL
 */
export function getOptimizedUrl(publicId, options = {}) {
  const defaultOptions = {
    quality: 'auto:good',
    fetch_format: 'auto',
    ...options
  };

  return cloudinary.url(publicId, defaultOptions);
}

export default cloudinary;
