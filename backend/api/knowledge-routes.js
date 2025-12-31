/**
 * Knowledge Base Routes
 * Endpoints for searching and browsing Axkan brand content
 */

import express from 'express';
import { employeeAuth } from './middleware/employee-auth.js';
import * as knowledgeIndex from '../services/knowledge-index.js';

const router = express.Router();

// ========================================
// SEARCH
// ========================================

/**
 * GET /api/knowledge/search
 * Search knowledge base
 */
router.get('/search', employeeAuth, async (req, res) => {
  try {
    const { q, category, limit = 20, includeImages = 'true' } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La búsqueda debe tener al menos 2 caracteres'
      });
    }

    const results = knowledgeIndex.search(q, {
      limit: parseInt(limit),
      category: category || null,
      includeImages: includeImages === 'true'
    });

    res.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Knowledge search error:', error);
    res.status(500).json({
      success: false,
      error: 'Error en la búsqueda'
    });
  }
});

// ========================================
// DOCUMENT
// ========================================

/**
 * GET /api/knowledge/document/:id
 * Get full document by ID
 */
router.get('/document/:id', employeeAuth, async (req, res) => {
  try {
    const document = knowledgeIndex.getDocument(req.params.id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Documento no encontrado'
      });
    }

    res.json({
      success: true,
      document
    });

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener documento'
    });
  }
});

// ========================================
// IMAGES
// ========================================

/**
 * GET /api/knowledge/images
 * Get all brand images
 */
router.get('/images', employeeAuth, async (req, res) => {
  try {
    const { category } = req.query;
    const images = knowledgeIndex.getImages(category || null);

    res.json({
      success: true,
      images,
      total: images.length
    });

  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener imágenes'
    });
  }
});

// ========================================
// STATS & MANAGEMENT
// ========================================

/**
 * GET /api/knowledge/stats
 * Get index statistics
 */
router.get('/stats', employeeAuth, async (req, res) => {
  try {
    const stats = knowledgeIndex.getStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * POST /api/knowledge/reindex
 * Re-index the knowledge base
 */
router.post('/reindex', employeeAuth, async (req, res) => {
  try {
    await knowledgeIndex.reindex();
    const stats = knowledgeIndex.getStats();

    res.json({
      success: true,
      message: 'Índice actualizado correctamente',
      stats
    });

  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al re-indexar'
    });
  }
});

export default router;
