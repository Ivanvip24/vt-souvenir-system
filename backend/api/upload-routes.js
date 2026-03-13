import express from 'express';
import multer from 'multer';
import { uploadImage, deleteImage } from '../shared/cloudinary-config.js';
import { isHeicFile, convertHeicToJpeg } from '../shared/heic-utils.js';

const router = express.Router();

// Configure multer for memory storage (we'll upload directly to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    const isHeic = file.originalname && /\.heic$/i.test(file.originalname);

    if (allowedTypes.includes(file.mimetype) || isHeic) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP, HEIC) o archivos PDF'), false);
    }
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

    console.log(`📤 Uploading payment receipt: ${req.file.originalname} (${req.file.size} bytes) for phone: ${phone}`);

    // Convert HEIC to JPEG if needed
    let fileBuffer = req.file.buffer;
    let fileMimetype = req.file.mimetype;
    if (isHeicFile(req.file)) {
      console.log('🔄 Converting HEIC to JPEG...');
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

    console.log(`✅ Payment receipt uploaded successfully: ${result.url}`);

    res.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      format: result.format
    });

  } catch (error) {
    console.error('❌ Upload error:', error);

    // Log details server-side, return generic message to client
    let errorType = 'upload_failed';
    if (error.message && error.message.includes('cloud_name')) {
      errorType = 'config_error';
      console.error('⚠️ Cloudinary config issue - check environment variables');
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

    console.log(`📤 Uploading ${req.files.length} files`);

    const uploadPromises = req.files.map(async (file, index) => {
      let fileBuffer = file.buffer;
      let fileMimetype = file.mimetype;
      if (isHeicFile(file)) {
        console.log(`🔄 Converting HEIC to JPEG: ${file.originalname}`);
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

    console.log(`✅ ${results.length} files uploaded successfully`);

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
    console.error('❌ Multi-upload error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
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

    console.log(`🗑️ Deleting image: ${decodedPublicId}`);

    const result = await deleteImage(decodedPublicId);

    res.json({
      success: result.success,
      message: result.success ? 'Imagen eliminada correctamente' : 'No se pudo eliminar la imagen'
    });

  } catch (error) {
    console.error('❌ Delete error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
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
      error: 'Error interno del servidor'
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }

  next();
});

export default router;
