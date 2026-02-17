import express from 'express';
import multer from 'multer';
import { uploadImage, deleteImage } from '../shared/cloudinary-config.js';

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
router.post('/payment-receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No se recibió ningún archivo'
      });
    }

    console.log(`📤 Uploading payment receipt: ${req.file.originalname} (${req.file.size} bytes)`);

    // Convert buffer to base64 data URI for Cloudinary
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

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

    // Check for specific Cloudinary errors
    let errorMessage = error.message || 'Error al subir el archivo';
    let errorType = 'upload_failed';

    if (error.message && error.message.includes('cloud_name')) {
      errorMessage = 'Cloudinary no está configurado correctamente';
      errorType = 'config_error';
      console.error('⚠️ Cloudinary config issue - check environment variables');
    } else if (error.message && error.message.includes('Invalid image file')) {
      errorMessage = 'Archivo de imagen no válido';
      errorType = 'invalid_file';
    } else if (error.http_code === 401) {
      errorMessage = 'Credenciales de Cloudinary inválidas';
      errorType = 'auth_error';
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      errorType,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      const b64 = Buffer.from(file.buffer).toString('base64');
      const dataURI = `data:${file.mimetype};base64,${b64}`;

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
      error: error.message || 'Error al subir los archivos'
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
      error: error.message || 'Error al eliminar la imagen'
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
      error: error.message
    });
  }

  if (error) {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  next();
});

export default router;
