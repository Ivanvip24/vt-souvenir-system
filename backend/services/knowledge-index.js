/**
 * Knowledge Index Service
 * In-memory search index for Axkan brand content
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Configuration
const AXKAN_PATH = process.env.AXKAN_REPO_PATH || '/Users/ivanvalencia/Desktop/CLAUDE/OVEN/AXKAN';

const MARKDOWN_FILES = [
  'CLAUDE.md',
  'AXKAN-SALES-ASSISTANT-FB-MARKETPLACE.md',
  '.claude/skills/axkan/SKILL.md',
  'brand-manual/README.md',
  'axkan-skill-claude-code/SKILL.md',
  'axkan-skill-claude-code/README.md'
];

const IMAGE_DIRECTORIES = [
  'brand-manual',
  'video-analysis'
];

// In-memory index
let index = {
  documents: [],
  images: [],
  lastIndexed: null
};

/**
 * Generate a simple unique ID
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Parse markdown into sections based on headings
 */
function parseMarkdownSections(content, filename) {
  const lines = content.split('\n');
  const sections = [];
  let currentSection = null;
  let lineNum = 0;

  for (const line of lines) {
    lineNum++;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.endLine = lineNum - 1;
        sections.push(currentSection);
      }

      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        startLine: lineNum,
        endLine: null
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  // Don't forget last section
  if (currentSection) {
    currentSection.endLine = lineNum;
    sections.push(currentSection);
  }

  // Extract keywords from each section
  sections.forEach(section => {
    section.keywords = extractKeywords(section.content + ' ' + section.heading);
  });

  return sections;
}

/**
 * Extract keywords from text (simple tokenization)
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'el', 'la', 'los', 'las', 'de', 'del', 'en', 'con', 'para', 'por',
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
    'que', 'y', 'o', 'un', 'una', 'es', 'son', 'no', 'se', 'su', 'al',
    'this', 'that', 'these', 'those', 'it', 'its', 'to', 'of', 'in', 'on', 'at',
    'as', 'if', 'not', 'so', 'do', 'does', 'did', 'have', 'has', 'had'
  ]);

  return text
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü#-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .filter((word, i, arr) => arr.indexOf(word) === i); // unique
}

/**
 * Derive category from filename/path
 */
function deriveCategory(filepath) {
  if (filepath.includes('SKILL.md')) return 'brand-identity';
  if (filepath.includes('SALES-ASSISTANT')) return 'sales';
  if (filepath.includes('brand-manual')) return 'visual-assets';
  if (filepath.includes('CLAUDE.md')) return 'overview';
  return 'general';
}

/**
 * Get document title from content
 */
function extractTitle(content, filename) {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : filename.replace('.md', '');
}

/**
 * Get image description from README content
 */
function getImageDescription(filename, documents) {
  const readmeDoc = documents.find(d => d.filename === 'README.md' && d.filepath.includes('brand-manual'));
  if (!readmeDoc) return filename.replace('.png', '').replace(/-/g, ' ');

  // Look for table row or bullet mentioning this file
  const patterns = [
    new RegExp(`\\|\\s*\`?${filename.replace('.', '\\.')}\`?\\s*\\|\\s*\\*\\*(.+?)\\*\\*`, 'i'),
    new RegExp(`\\*\\*${filename.replace('.', '\\.')}\\*\\*[:\\s]+(.+?)(?:\\n|$)`, 'i'),
    new RegExp(`${filename.replace('.', '\\.')}[:\\s-]+(.+?)(?:\\n|$)`, 'i')
  ];

  for (const regex of patterns) {
    const match = readmeDoc.fullContent.match(regex);
    if (match) return match[1].trim();
  }

  return filename.replace('.png', '').replace(/-/g, ' ');
}

/**
 * Extract searchable tags from image
 */
function extractImageTags(filename, description) {
  const tags = [];
  const lower = (filename + ' ' + description).toLowerCase();

  if (lower.includes('logo')) tags.push('logo');
  if (lower.includes('color') || lower.includes('palette') || lower.includes('colores')) tags.push('colors');
  if (lower.includes('typography') || lower.includes('font') || lower.includes('tipografia')) tags.push('typography');
  if (lower.includes('product') || lower.includes('magnet') || lower.includes('producto')) tags.push('product');
  if (lower.includes('cover') || lower.includes('portada')) tags.push('cover');
  if (lower.includes('jaguar')) tags.push('jaguar');
  if (lower.includes('pattern') || lower.includes('patron')) tags.push('pattern');
  if (lower.includes('test')) tags.push('mockup');
  if (lower.includes('frame')) tags.push('video');

  // Add from filename
  const parts = filename.replace('.png', '').split(/[-_]/);
  tags.push(...parts.filter(p => p.length > 2 && !/^\d+$/.test(p)));

  return [...new Set(tags)];
}

/**
 * Build index from Axkan repository
 */
export async function buildIndex() {
  console.log('📚 Building knowledge index from:', AXKAN_PATH);

  const documents = [];
  const images = [];

  // Index markdown files
  for (const relativePath of MARKDOWN_FILES) {
    const fullPath = path.join(AXKAN_PATH, relativePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const filename = path.basename(relativePath);
      const stat = await fs.stat(fullPath);

      documents.push({
        id: generateId(),
        filename,
        filepath: relativePath,
        title: extractTitle(content, filename),
        category: deriveCategory(relativePath),
        sections: parseMarkdownSections(content, filename),
        fullContent: content,
        lastModified: stat.mtime
      });

      console.log(`  ✅ Indexed: ${filename} (${documents[documents.length-1].sections.length} sections)`);
    } catch (err) {
      console.warn(`  ⚠️ Could not index ${relativePath}:`, err.message);
    }
  }

  // Index images
  for (const imageDir of IMAGE_DIRECTORIES) {
    const dirPath = path.join(AXKAN_PATH, imageDir);

    try {
      const files = await fs.readdir(dirPath);
      const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|webp)$/i.test(f));

      for (const filename of imageFiles) {
        const description = getImageDescription(filename, documents);

        images.push({
          id: generateId(),
          filename,
          directory: imageDir,
          category: imageDir === 'brand-manual' ? 'brand-manual' : 'video-frames',
          description,
          tags: extractImageTags(filename, description),
          path: `${imageDir}/${filename}`
        });
      }

      console.log(`  ✅ Indexed ${imageFiles.length} images from ${imageDir}/`);
    } catch (err) {
      console.warn(`  ⚠️ Could not index images from ${imageDir}:`, err.message);
    }
  }

  index = {
    documents,
    images,
    lastIndexed: new Date()
  };

  console.log(`📚 Knowledge index complete: ${documents.length} documents, ${images.length} images`);

  return index;
}

/**
 * Calculate relevance score for a section
 */
function calculateRelevance(section, queryLower, queryWords) {
  const contentLower = section.content.toLowerCase();
  const headingLower = section.heading.toLowerCase();

  let score = 0;

  // Exact phrase match (highest priority)
  if (contentLower.includes(queryLower)) score += 10;
  if (headingLower.includes(queryLower)) score += 15;

  // All words present
  const contentMatches = queryWords.filter(w => contentLower.includes(w)).length;
  const headingMatches = queryWords.filter(w => headingLower.includes(w)).length;

  if (contentMatches === queryWords.length) score += 5;
  score += contentMatches;
  score += headingMatches * 3;

  // Keyword matches
  const keywordMatches = queryWords.filter(w => section.keywords.some(k => k.includes(w))).length;
  score += keywordMatches * 0.5;

  return score;
}

/**
 * Extract relevant snippet with context
 */
function extractSnippet(content, queryWords, maxLength = 200) {
  const lines = content.split('\n').filter(l => l.trim());

  // Find line with most matches
  let bestLine = '';
  let bestScore = 0;

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    const matches = queryWords.filter(w => lineLower.includes(w)).length;

    if (matches > bestScore) {
      bestScore = matches;
      bestLine = line;
    }
  }

  if (!bestLine && lines.length > 0) {
    bestLine = lines[0];
  }

  // Truncate if needed
  if (bestLine.length > maxLength) {
    const queryWord = queryWords[0];
    const idx = bestLine.toLowerCase().indexOf(queryWord);

    if (idx > maxLength / 2) {
      const start = Math.max(0, idx - Math.floor(maxLength / 2));
      bestLine = '...' + bestLine.slice(start, start + maxLength) + '...';
    } else {
      bestLine = bestLine.slice(0, maxLength) + '...';
    }
  }

  // Remove markdown formatting for cleaner display
  bestLine = bestLine
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/\|/g, ' ')
    .replace(/#+\s*/g, '')
    .trim();

  return bestLine;
}

/**
 * Search the index
 */
export function search(query, options = {}) {
  const { limit = 20, category = null, includeImages = true } = options;

  if (!query || query.length < 2) {
    return { results: [], images: [], query, totalResults: 0, totalImages: 0 };
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

  const results = [];

  // Search documents
  for (const doc of index.documents) {
    if (category && doc.category !== category) continue;

    for (const section of doc.sections) {
      const score = calculateRelevance(section, queryLower, queryWords);

      if (score > 0) {
        results.push({
          type: 'section',
          documentId: doc.id,
          documentTitle: doc.title,
          filename: doc.filename,
          category: doc.category,
          sectionHeading: section.heading,
          sectionLevel: section.level,
          snippet: extractSnippet(section.content, queryWords),
          score,
          startLine: section.startLine
        });
      }
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.score - a.score);

  // Search images
  let imageResults = [];
  if (includeImages) {
    for (const img of index.images) {
      if (category && img.category !== category) continue;

      const imgText = (img.filename + ' ' + img.description + ' ' + img.tags.join(' ')).toLowerCase();
      const matches = queryWords.filter(w => imgText.includes(w)).length;

      if (matches > 0 || imgText.includes(queryLower)) {
        imageResults.push({
          ...img,
          score: imgText.includes(queryLower) ? 10 : matches
        });
      }
    }

    imageResults.sort((a, b) => b.score - a.score);
  }

  return {
    results: results.slice(0, limit),
    images: imageResults.slice(0, 10),
    query,
    totalResults: results.length,
    totalImages: imageResults.length
  };
}

/**
 * Get full document content by ID
 */
export function getDocument(documentId) {
  return index.documents.find(d => d.id === documentId) || null;
}

/**
 * Get all images, optionally filtered by category
 */
export function getImages(category = null) {
  if (category) {
    return index.images.filter(img => img.category === category);
  }
  return index.images;
}

/**
 * Get index statistics
 */
export function getStats() {
  return {
    documentCount: index.documents.length,
    imageCount: index.images.length,
    totalSections: index.documents.reduce((sum, d) => sum + d.sections.length, 0),
    categories: [...new Set(index.documents.map(d => d.category))],
    lastIndexed: index.lastIndexed
  };
}

/**
 * Re-index (can be called to refresh)
 */
export async function reindex() {
  return buildIndex();
}

/**
 * Check if index is built
 */
export function isIndexed() {
  return index.lastIndexed !== null;
}

export default {
  buildIndex,
  search,
  getDocument,
  getImages,
  getStats,
  reindex,
  isIndexed
};
