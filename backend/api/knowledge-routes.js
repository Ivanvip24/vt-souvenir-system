/**
 * Knowledge Base Routes
 * Endpoints for searching and browsing Axkan brand content
 * Includes AI-powered Q&A and chat using Claude API
 */

import express from 'express';
import { employeeAuth } from './middleware/employee-auth.js';
import * as knowledgeIndex from '../services/knowledge-index.js';
import * as knowledgeAI from '../services/knowledge-ai.js';

const router = express.Router();

// ========================================
// SEARCH
// ========================================

/**
 * GET /api/knowledge/search
 * Search knowledge base (temporarily no auth for testing)
 */
router.get('/search', async (req, res) => {
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
 * Get index statistics (temporarily no auth for testing)
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = knowledgeIndex.getStats();
    console.log('Knowledge stats requested:', stats);

    res.json({
      success: true,
      stats,
      _version: 'v2-2025-12-31'  // Version check
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

// ========================================
// AI-POWERED ENDPOINTS
// ========================================

/**
 * POST /api/knowledge/ask
 * Single question/answer (no conversation history)
 */
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'La pregunta debe tener al menos 3 caracteres'
      });
    }

    const result = await knowledgeAI.askQuestion(question);

    res.json(result);

  } catch (error) {
    console.error('Ask question error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la pregunta'
    });
  }
});

/**
 * POST /api/knowledge/chat
 * Chat with conversation history
 */
router.post('/chat', async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!message || message.trim().length < 1) {
      return res.status(400).json({
        success: false,
        error: 'El mensaje no puede estar vacío'
      });
    }

    const result = await knowledgeAI.chat(conversationId, message);

    res.json(result);

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Error en el chat'
    });
  }
});

/**
 * POST /api/knowledge/chat/new
 * Start a new conversation
 */
router.post('/chat/new', async (req, res) => {
  try {
    const { userId } = req.body;
    const conversationId = knowledgeAI.startConversation(userId);

    res.json({
      success: true,
      conversationId
    });

  } catch (error) {
    console.error('New conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al iniciar conversación'
    });
  }
});

/**
 * GET /api/knowledge/chat/:conversationId
 * Get conversation history
 */
router.get('/chat/:conversationId', async (req, res) => {
  try {
    const conversation = knowledgeAI.getConversation(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversación no encontrada'
      });
    }

    res.json({
      success: true,
      conversation
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener conversación'
    });
  }
});

/**
 * DELETE /api/knowledge/chat/:conversationId
 * Clear/delete a conversation
 */
router.delete('/chat/:conversationId', async (req, res) => {
  try {
    const deleted = knowledgeAI.clearConversation(req.params.conversationId);

    res.json({
      success: true,
      deleted
    });

  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al eliminar conversación'
    });
  }
});

/**
 * GET /api/knowledge/ai/stats
 * Get AI service stats
 */
router.get('/ai/stats', async (req, res) => {
  try {
    const stats = knowledgeAI.getStats();

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('AI stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas'
    });
  }
});

/**
 * POST /api/knowledge/ai/reload
 * Reload brand content
 */
router.post('/ai/reload', employeeAuth, async (req, res) => {
  try {
    await knowledgeAI.reload();
    const stats = knowledgeAI.getStats();

    res.json({
      success: true,
      message: 'Contenido recargado correctamente',
      stats
    });

  } catch (error) {
    console.error('Reload error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al recargar contenido'
    });
  }
});

// ========================================
// MODEL SELECTION
// ========================================

/**
 * GET /api/knowledge/ai/models
 * Get available AI models
 */
router.get('/ai/models', async (req, res) => {
  try {
    const models = Object.entries(knowledgeAI.AVAILABLE_MODELS).map(([key, value]) => ({
      key,
      ...value
    }));

    const current = knowledgeAI.getCurrentModel();

    res.json({
      success: true,
      models,
      current
    });

  } catch (error) {
    console.error('Get models error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener modelos'
    });
  }
});

/**
 * POST /api/knowledge/ai/model
 * Set the AI model to use
 */
router.post('/ai/model', async (req, res) => {
  try {
    const { model } = req.body;

    if (!model) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere especificar el modelo'
      });
    }

    const success = knowledgeAI.setModel(model);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Modelo no válido. Opciones: haiku, sonnet, opus'
      });
    }

    const current = knowledgeAI.getCurrentModel();

    res.json({
      success: true,
      message: `Modelo cambiado a ${current.name}`,
      current
    });

  } catch (error) {
    console.error('Set model error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al cambiar modelo'
    });
  }
});

export default router;
