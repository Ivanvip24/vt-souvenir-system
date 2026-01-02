/**
 * AI-Powered Knowledge Service
 * Uses Claude API to interact with Axkan brand content
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const AXKAN_PATH = process.env.AXKAN_REPO_PATH || path.resolve(__dirname, '../assets/axkan');

const MARKDOWN_FILES = [
  'CLAUDE.md',
  'AXKAN-SALES-ASSISTANT-FB-MARKETPLACE.md',
  '.claude/skills/axkan/SKILL.md',
  'brand-manual/README.md',
  'axkan-skill-claude-code/SKILL.md',
  'axkan-skill-claude-code/README.md'
];

// Available Claude models
export const AVAILABLE_MODELS = {
  haiku: { id: 'claude-haiku-4-20250514', name: 'Haiku', description: 'Fastest & cheapest' },
  sonnet: { id: 'claude-sonnet-4-20250514', name: 'Sonnet', description: 'Balanced' },
  opus: { id: 'claude-opus-4-20250514', name: 'Opus', description: 'Most capable' }
};

// Default model (cheapest)
let currentModel = 'haiku';

// In-memory content store
let brandContent = {
  documents: [],
  fullContext: '',
  lastLoaded: null
};

// Active conversations (in-memory, could be moved to Redis/DB for persistence)
const conversations = new Map();

/**
 * Set the AI model to use
 */
export function setModel(modelKey) {
  if (AVAILABLE_MODELS[modelKey]) {
    currentModel = modelKey;
    console.log(`🤖 AI Model switched to: ${AVAILABLE_MODELS[modelKey].name}`);
    return true;
  }
  return false;
}

/**
 * Get current model info
 */
export function getCurrentModel() {
  return {
    key: currentModel,
    ...AVAILABLE_MODELS[currentModel]
  };
}

/**
 * Get model ID for API calls
 */
function getModelId() {
  return AVAILABLE_MODELS[currentModel].id;
}

// Initialize Anthropic client
let anthropic = null;

function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

/**
 * Load all brand content from Axkan repository
 */
export async function loadBrandContent() {
  console.log('📚 Loading Axkan brand content from:', AXKAN_PATH);

  const documents = [];
  let fullContext = '';

  for (const relativePath of MARKDOWN_FILES) {
    const fullPath = path.join(AXKAN_PATH, relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const filename = path.basename(relativePath);

      documents.push({
        filename,
        path: relativePath,
        content,
        charCount: content.length
      });

      // Build full context with document separators
      fullContext += `\n\n---\n## ${filename}\n---\n${content}`;

      console.log(`  ✅ Loaded: ${filename} (${content.length} chars)`);
    } catch (err) {
      console.warn(`  ⚠️ Could not load ${relativePath}:`, err.message);
    }
  }

  brandContent = {
    documents,
    fullContext,
    lastLoaded: new Date()
  };

  console.log(`📚 Brand content loaded: ${documents.length} documents, ${fullContext.length} total chars`);

  return brandContent;
}

/**
 * Get the system prompt with brand context
 */
function getSystemPrompt() {
  return `Eres el asistente de conocimiento de marca AXKAN. Tienes acceso completo a toda la información de la marca, incluyendo:

- Identidad de marca (colores, tipografía, valores)
- Catálogo de productos (imanes decorativos artesanales mexicanos)
- Guiones de ventas para Facebook Marketplace
- Precios y políticas
- Guía de estilo visual

Tu rol es ayudar al equipo de AXKAN (diseñadores, vendedores, producción) respondiendo preguntas sobre la marca de manera clara, precisa y útil.

IMPORTANTE:
- Responde en español a menos que te pregunten en inglés
- Sé conciso pero completo
- Si mencionas colores, incluye los códigos HEX
- Si mencionas precios, usa el formato correcto (ej: $45 MXN)
- Puedes hacer recomendaciones basadas en el contexto de la marca
- Si no tienes información suficiente, dilo claramente

---
CONTENIDO DE MARCA AXKAN:
${brandContent.fullContext}
---`;
}

/**
 * Single question/answer (no conversation history)
 */
export async function askQuestion(question, options = {}) {
  const { maxTokens = 1024 } = options;

  if (!brandContent.fullContext) {
    await loadBrandContent();
  }

  const client = getClient();

  try {
    const response = await client.messages.create({
      model: getModelId(),
      max_tokens: maxTokens,
      system: getSystemPrompt(),
      messages: [
        { role: 'user', content: question }
      ]
    });

    return {
      success: true,
      answer: response.content[0].text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  } catch (error) {
    console.error('Claude API error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Start a new conversation
 */
export function startConversation(userId = null) {
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  conversations.set(conversationId, {
    id: conversationId,
    userId,
    messages: [],
    createdAt: new Date(),
    lastActivity: new Date()
  });

  return conversationId;
}

/**
 * Send a message in an existing conversation
 */
export async function chat(conversationId, message, options = {}) {
  const { maxTokens = 1024 } = options;

  if (!brandContent.fullContext) {
    await loadBrandContent();
  }

  let conversation = conversations.get(conversationId);

  // Auto-create conversation if doesn't exist
  if (!conversation) {
    conversationId = startConversation();
    conversation = conversations.get(conversationId);
  }

  // Add user message to history
  conversation.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date()
  });

  const client = getClient();

  try {
    // Build messages array for API (without timestamps)
    const apiMessages = conversation.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await client.messages.create({
      model: getModelId(),
      max_tokens: maxTokens,
      system: getSystemPrompt(),
      messages: apiMessages
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    conversation.messages.push({
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date()
    });

    conversation.lastActivity = new Date();

    return {
      success: true,
      conversationId,
      answer: assistantMessage,
      messageCount: conversation.messages.length,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens
      }
    };
  } catch (error) {
    console.error('Claude API error:', error);

    // Remove the failed user message
    conversation.messages.pop();

    return {
      success: false,
      conversationId,
      error: error.message
    };
  }
}

/**
 * Get conversation history
 */
export function getConversation(conversationId) {
  const conversation = conversations.get(conversationId);
  if (!conversation) return null;

  return {
    id: conversation.id,
    messages: conversation.messages,
    createdAt: conversation.createdAt,
    lastActivity: conversation.lastActivity
  };
}

/**
 * Clear a conversation
 */
export function clearConversation(conversationId) {
  return conversations.delete(conversationId);
}

/**
 * Get service stats
 */
export function getStats() {
  return {
    documentsLoaded: brandContent.documents.length,
    totalChars: brandContent.fullContext.length,
    lastLoaded: brandContent.lastLoaded,
    activeConversations: conversations.size,
    apiConfigured: !!process.env.ANTHROPIC_API_KEY
  };
}

/**
 * Reload brand content
 */
export async function reload() {
  return loadBrandContent();
}

export default {
  loadBrandContent,
  askQuestion,
  startConversation,
  chat,
  getConversation,
  clearConversation,
  getStats,
  reload,
  setModel,
  getCurrentModel,
  AVAILABLE_MODELS
};
