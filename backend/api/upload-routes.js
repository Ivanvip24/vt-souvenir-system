import express from 'express';
import multer from 'multer';
import { uploadImage, deleteImage } from '../shared/cloudinary-config.js';
import { isHeicFile, convertHeicToJpeg } from '../shared/heic-utils.js';
import { uploadMediaToCloudinary } from '../services/whatsapp-media.js';
import { log, logError } from '../shared/logger.js';

const router = express.Router();

// Configure multer for memory storage (we'll upload directly to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types (images, PDFs, documents, etc.)
    cb(null, true);
  }
});

// ========================================
// UPLOAD PAYMENT RECEIPT
// ========================================
// Endpoint for clients to upload payment proof images
// Requires a phone number to prevent anonymous abuse
router.post('/payment-receipt', upload.single('receipt'), async (req, res) => {
  try {
    // Require a phone number to prevent anonymous spam uploads
    const phone = (req.body.phone || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un número de teléfono válido para subir comprobantes'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se recibió ningún archivo'
      });
    }

    log('info', 'upload.uploading-payment-receipt-bytes-for-phone');

    // Convert HEIC to JPEG if needed
    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;
    if (isHeicFile(req.file)) {
      log('info', 'upload.converting-heic-to-jpeg');
      const converted = await convertHeicToJpeg(fileBuffer);
      fileBuffer = converted.buffer;
      fileMimetype = converted.mimetype;
    }

    // Convert buffer to base64 data URI for Cloudinary
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${fileMimetype};base64,${b64}`;

    // Generate custom public ID with timestamp
    const timestamp = Date.now();
    const publicId = `receipt_${timestamp}`;

    // Upload to Cloudinary
    const result = await uploadImage(dataURI, 'payment-receipts', publicId);

    log('info', 'upload.payment-receipt-uploaded-successfully');

    res.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      format: result.format
    });

  } catch (error) {
    logError('upload.upload-error', error);

    // Log details server-side, return generic message to client
    let errorType = 'upload_failed';
    if (error.message && error.message.includes('cloud_name')) {
      errorType = 'config_error';
      log('error', 'upload.cloudinary-config-issue-check-environment-variable');
    } else if (error.message && error.message.includes('Invalid image file')) {
      errorType = 'invalid_file';
    } else if (error.http_code === 401) {
      errorType = 'auth_error';
    }

    res.status(500).json({
      success: false,
      error: 'Error al subir el archivo',
      errorType
    });
  }
});

// ========================================
// UPLOAD MEDIA (images + videos) for WhatsApp
// ========================================
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024, // 16MB for videos
  },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

router.post('/media', mediaUpload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No se recibió ningún archivo' });
    }

    const isVideo = req.file.mimetype && req.file.mimetype.startsWith('video/');
    const isImage = req.file.mimetype && req.file.mimetype.startsWith('image/');

    log('info', 'upload.uploading-media-bytes');

    let url;

    if (isVideo) {
      // Use uploadMediaToCloudinary which handles resource_type: 'auto'
      const result = await uploadMediaToCloudinary(req.file.buffer, req.file.mimetype, 'whatsapp-media');
      url = result.url;
    } else {
      // Images: convert HEIC if needed, then upload
      let fileBuffer = req.file.buffer;
      let fileMimetype = req.file.mimetype;
      if (isHeicFile(req.file)) {
        const converted = await convertHeicToJpeg(fileBuffer);
        fileBuffer = converted.buffer;
        fileMimetype = converted.mimetype;
      }
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${fileMimetype};base64,${b64}`;
      const result = await uploadImage(dataURI, 'whatsapp-media');
      url = result.url;
    }

    log('info', 'upload.media-uploaded');
    res.json({ success: true, url });
  } catch (error) {
    logError('upload.media-upload-error', error);
    res.status(500).json({ success: false, error: 'Error al subir el archivo' });
  }
});

// ========================================
// UPLOAD MULTIPLE FILES
// ========================================
// Endpoint for uploading multiple images (e.g., design references)
router.post('/multiple', upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se recibieron archivos'
      });
    }

    log('info', 'upload.uploading-files');

    const uploadPromises = req.files.map(async (file, index) => {
      let fileBuffer = file.buffer;
      let fileMimetype = file.mimetype;
      if (isHeicFile(file)) {
        log('info', 'upload.converting-heic-to-jpeg');
        const converted = await convertHeicToJpeg(fileBuffer);
        fileBuffer = converted.buffer;
        fileMimetype = converted.mimetype;
      }
      const b64 = Buffer.from(fileBuffer).toString('base64');
      const dataURI = `data:${fileMimetype};base64,${b64}`;

      const timestamp = Date.now();
      const publicId = `upload_${timestamp}_${index}`;

      return await uploadImage(dataURI, 'order-images', publicId);
    });

    const results = await Promise.all(uploadPromises);

    log('info', 'upload.files-uploaded-successfully');

    res.json({
      success: true,
      files: results.map((result, index) => ({
        url: result.url,
        publicId: result.publicId,
        fileName: req.files[index].originalname,
        fileSize: req.files[index].size,
        format: result.format
      }))
    });

  } catch (error) {
    logError('upload.multi-upload-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// DELETE IMAGE
// ========================================
// Endpoint to delete an image from Cloudinary
router.delete('/image/:publicId', async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        error: 'Public ID is required'
      });
    }

    // Decode the public ID (it might be URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);

    log('info', 'upload.deleting-image');

    const result = await deleteImage(decodedPublicId);

    res.json({
      success: result.success,
      message: result.success ? 'Imagen eliminada correctamente' : 'No se pudo eliminar la imagen'
    });

  } catch (error) {
    logError('upload.delete-error', error);
    res.status(500).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }
});

// ========================================
// ERROR HANDLER FOR MULTER
// ========================================
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'El archivo es demasiado grande. Tamaño máximo: 10MB'
      });
    }
    return res.status(400).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: (error.message || 'Error desconocido')
    });
  }

  next();
});

export default router;
