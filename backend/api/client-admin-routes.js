/**
 * Client Admin Routes
 * Admin-level client management, address autocomplete, Google Maps import,
 * bulk label generation, and payment notes (cuentas).
 *
 * Extracted from server.js — Playbook S4
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../shared/database.js';
import { log, logError } from '../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

/**
 * GET /api/clients
 * Get all clients with address information for shipping database
 */
// Mexican postal code prefix → state mapping (first 2 digits)
const MX_POSTAL_STATE = {
  '01':'Ciudad de México','02':'Ciudad de México','03':'Ciudad de México','04':'Ciudad de México',
  '05':'Ciudad de México','06':'Ciudad de México','07':'Ciudad de México','08':'Ciudad de México',
  '09':'Ciudad de México','10':'Ciudad de México','11':'Ciudad de México','12':'Ciudad de México',
  '13':'Ciudad de México','14':'Ciudad de México','15':'Ciudad de México','16':'Ciudad de México',
  '20':'Aguascalientes',
  '21':'Baja California','22':'Baja California',
  '23':'Baja California Sur',
  '24':'Campeche',
  '25':'Coahuila','26':'Coahuila','27':'Coahuila',
  '28':'Colima',
  '29':'Chiapas','30':'Chiapas',
  '31':'Chihuahua','32':'Chihuahua','33':'Chihuahua',
  '34':'Durango','35':'Durango',
  '36':'Guanajuato','37':'Guanajuato','38':'Guanajuato',
  '39':'Guerrero','40':'Guerrero','41':'Guerrero',
  '42':'Hidalgo','43':'Hidalgo',
  '44':'Jalisco','45':'Jalisco','46':'Jalisco','47':'Jalisco','48':'Jalisco','49':'Jalisco',
  '50':'Estado de México','51':'Estado de México','52':'Estado de México','53':'Estado de México',
  '54':'Estado de México','55':'Estado de México','56':'Estado de México','57':'Estado de México',
  '58':'Michoacán','59':'Michoacán','60':'Michoacán','61':'Michoacán',
  '62':'Morelos','63':'Morelos',
  '64':'Nuevo León','65':'Nuevo León','66':'Nuevo León','67':'Nuevo León',
  '68':'Oaxaca','69':'Oaxaca','70':'Oaxaca','71':'Oaxaca',
  '72':'Puebla','73':'Puebla','74':'Puebla','75':'Puebla',
  '76':'Querétaro',
  '77':'Quintana Roo',
  '78':'San Luis Potosí','79':'San Luis Potosí',
  '80':'Sinaloa','81':'Sinaloa','82':'Sinaloa',
  '83':'Sonora','84':'Sonora','85':'Sonora',
  '86':'Tabasco',
  '87':'Tamaulipas','88':'Tamaulipas','89':'Tamaulipas',
  '90':'Tlaxcala',
  '91':'Veracruz','92':'Veracruz','93':'Veracruz','94':'Veracruz','95':'Veracruz','96':'Veracruz',
  '97':'Yucatán',
  '98':'Zacatecas','99':'Zacatecas'
};

function getStateFromPostal(postalCode) {
  if (!postalCode) return null;
  const code = postalCode.toString().trim();
  if (code.length < 2) return null;
  return MX_POSTAL_STATE[code.substring(0, 2)] || null;
}

router.get('/clients', async (req, res) => {
  try {
    const { search, city, state, hasAddress, recent, sort = 'recent', page = 1, limit = 50 } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Search filter — expanded to all address fields, check both postal columns
    if (search) {
      conditions.push(`(
        LOWER(c.name) LIKE LOWER($${paramIndex}) OR
        c.phone LIKE $${paramIndex} OR
        LOWER(c.email) LIKE LOWER($${paramIndex}) OR
        LOWER(c.street) LIKE LOWER($${paramIndex}) OR
        LOWER(c.colonia) LIKE LOWER($${paramIndex}) OR
        LOWER(c.city) LIKE LOWER($${paramIndex}) OR
        LOWER(c.state) LIKE LOWER($${paramIndex}) OR
        COALESCE(c.postal, c.postal_code) LIKE $${paramIndex} OR
        LOWER(c.address) LIKE LOWER($${paramIndex})
      )`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    // City filter
    if (city) {
      conditions.push(`c.city = $${paramIndex++}`);
      params.push(city);
    }

    // State filter
    if (state) {
      conditions.push(`c.state = $${paramIndex++}`);
      params.push(state);
    }

    // Has address filter — check street-based fields + postal (both columns)
    if (hasAddress === 'true') {
      conditions.push(`(c.street IS NOT NULL AND c.street != '' AND c.city IS NOT NULL AND c.city != '' AND c.state IS NOT NULL AND c.state != '' AND COALESCE(c.postal, c.postal_code) IS NOT NULL AND COALESCE(c.postal, c.postal_code) != '')`);
    } else if (hasAddress === 'false') {
      conditions.push(`(c.street IS NULL OR c.street = '' OR c.city IS NULL OR c.city = '' OR c.state IS NULL OR c.state = '' OR (c.postal IS NULL AND c.postal_code IS NULL) OR (COALESCE(c.postal, c.postal_code) = ''))`);
    }

    // Recent filter — last 7 days
    if (recent === 'true') {
      conditions.push(`c.updated_at >= NOW() - INTERVAL '7 days'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Sort order
    const orderBy = sort === 'alpha' ? 'ORDER BY c.name ASC' : 'ORDER BY c.updated_at DESC NULLS LAST';

    // Get total count
    const countResult = await query(`SELECT COUNT(*) as total FROM clients c ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated clients
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const result = await query(`
      SELECT
        c.id,
        c.name,
        c.phone,
        c.email,
        c.address,
        c.street,
        c.street_number,
        c.colonia,
        c.city,
        c.state,
        COALESCE(c.postal, c.postal_code) as postal_code,
        c.postal,
        c.reference_notes,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT o.id) as order_count,
        MAX(o.order_date) as last_order_date,
        (SELECT destination FROM orders WHERE client_id = c.id AND destination IS NOT NULL AND destination != '' ORDER BY order_date DESC LIMIT 1) as destination
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      ${whereClause}
      GROUP BY c.id
      ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, parseInt(limit), offset]);

    // Get unique cities and states for filters
    const citiesResult = await query(`
      SELECT DISTINCT city FROM clients WHERE city IS NOT NULL AND city != '' ORDER BY city
    `);
    const statesResult = await query(`
      SELECT DISTINCT state FROM clients WHERE state IS NOT NULL AND state != '' ORDER BY state
    `);

    // Get stats — use street-based completeness check, check both postal columns
    const statsResult = await query(`
      SELECT
        COUNT(*) as total_clients,
        COUNT(CASE WHEN street IS NOT NULL AND street != '' AND city IS NOT NULL AND city != '' AND state IS NOT NULL AND state != '' AND COALESCE(postal, postal_code) IS NOT NULL AND COALESCE(postal, postal_code) != '' THEN 1 END) as with_address,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(CASE WHEN updated_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_count
      FROM clients
    `);

    // Auto-fill missing state from postal code using local lookup
    const clientsToFixInDB = [];
    const enrichedData = result.rows.map(client => {
      const postal = client.postal_code || client.postal || '';
      if (postal && (!client.state || client.state.trim() === '')) {
        const derivedState = getStateFromPostal(postal);
        if (derivedState) {
          clientsToFixInDB.push({ id: client.id, state: derivedState });
          return { ...client, state: derivedState };
        }
      }
      return client;
    });

    // Fire-and-forget: save derived states to DB so it's permanent
    if (clientsToFixInDB.length > 0) {
      (async () => {
        for (const fix of clientsToFixInDB) {
          try {
            await query('UPDATE clients SET state = $1, updated_at = NOW() WHERE id = $2 AND (state IS NULL OR state = \'\')', [fix.state, fix.id]);
          } catch (e) { /* ignore */ }
        }
        log('info', 'client-admin.auto-fixed-state-for-clients-from-postal-codes');
      })();
    }

    res.json({
      success: true,
      data: enrichedData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      filters: {
        cities: citiesResult.rows.map(r => r.city),
        states: statesResult.rows.map(r => r.state)
      },
      stats: statsResult.rows[0]
    });
  } catch (error) {
    logError('client-admin.error-fetching-clients', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/clients/autocomplete-addresses
 * Auto-fill city/state/colonia from postal codes for clients missing those fields
 */
router.post('/clients/autocomplete-addresses', async (req, res) => {
  try {
    // Find clients with a postal code (either column) but missing city, state, or colonia
    const result = await query(`
      SELECT id, COALESCE(postal, postal_code) as postal_value, city, state, colonia
      FROM clients
      WHERE COALESCE(postal, postal_code) IS NOT NULL AND COALESCE(postal, postal_code) != ''
        AND (city IS NULL OR city = '' OR state IS NULL OR state = '' OR colonia IS NULL OR colonia = '')
    `);

    if (result.rows.length === 0) {
      return res.json({ success: true, updated: 0, message: 'No clients need auto-completion' });
    }

    let updated = 0;
    let errors = 0;

    for (const client of result.rows) {
      try {
        const postal = client.postal_value.trim();
        if (!/^\d{5}$/.test(postal)) continue;

        // Rate limit: small delay between API calls
        if (updated > 0) await new Promise(r => setTimeout(r, 200));

        const apiRes = await fetch(`https://api.zippopotam.us/mx/${postal}`);
        if (!apiRes.ok) continue;

        const data = await apiRes.json();
        if (!data.places || data.places.length === 0) continue;

        const place = data.places[0];
        const updates = [];
        const values = [];
        let idx = 1;

        if ((!client.state || client.state.trim() === '') && data.state) {
          updates.push(`state = $${idx++}`);
          values.push(data.state);
        }
        if ((!client.city || client.city.trim() === '') && place['place name']) {
          updates.push(`city = $${idx++}`);
          values.push(place['place name']);
        }
        if ((!client.colonia || client.colonia.trim() === '') && place['place name']) {
          updates.push(`colonia = $${idx++}`);
          values.push(place['place name']);
        }

        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          values.push(client.id);
          await query(
            `UPDATE clients SET ${updates.join(', ')} WHERE id = $${idx}`,
            values
          );
          updated++;
        }
      } catch (e) {
        errors++;
      }
    }

    res.json({
      success: true,
      updated,
      errors,
      total_candidates: result.rows.length,
      message: `${updated} clientes actualizados con datos de codigo postal`
    });
  } catch (error) {
    logError('client-admin.error-auto-completing-addresses', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/clients/from-google-maps
 * Extract client data from a Google Maps URL
 */
function isGoogleMapsUrl(url) {
  try {
    const parsed = new URL(url);
    return ['www.google.com', 'google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl'].includes(parsed.hostname);
  } catch { return false; }
}

function parseGoogleMapsUrl(url) {
  const result = { name: null, lat: null, lng: null };
  try {
    // Extract place name from /place/NAME/ segment
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch) {
      result.name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
        .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    // Extract coordinates from @lat,lng
    const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) {
      result.lat = parseFloat(coordMatch[1]);
      result.lng = parseFloat(coordMatch[2]);
    }
    // Fallback: extract from !3d...!4d... data params
    if (!result.lat) {
      const lat3d = url.match(/!3d(-?\d+\.?\d*)/);
      const lng4d = url.match(/!4d(-?\d+\.?\d*)/);
      if (lat3d && lng4d) {
        result.lat = parseFloat(lat3d[1]);
        result.lng = parseFloat(lng4d[1]);
      }
    }
  } catch (e) { logError('client-admin.error-parsing-google-maps-url', e); }
  return result;
}

async function resolveGoogleMapsUrl(url) {
  // Follow redirects for shortened URLs (goo.gl, maps.app.goo.gl)
  try {
    const parsed = new URL(url);
    if (['goo.gl', 'maps.app.goo.gl'].includes(parsed.hostname)) {
      const resp = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' } });
      const location = resp.headers.get('location');
      if (location) return location;
    }
  } catch (e) { logError('client-admin.error-resolving-shortened-url', e); }
  return url;
}

async function scrapeGoogleMapsPage(url) {
  const result = { name: null, phone: null, address: null };
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-MX,es;q=0.9'
      },
      signal: AbortSignal.timeout(10000)
    });
    const html = await resp.text();

    // Try to extract phone from embedded data - look for Mexican phone patterns
    const phonePatterns = [
      /\"(\+?52\s?\d{2,3}\s?\d{3,4}\s?\d{4})\"/,
      /\"(\d{2,3}[\s-]?\d{3,4}[\s-]?\d{4})\"/,
      /\\u0022(\+?52\s?\d[\d\s-]{8,14})\\u0022/,
      /tel:(\+?\d[\d-]{8,15})/
    ];
    for (const pattern of phonePatterns) {
      const match = html.match(pattern);
      if (match) {
        const cleaned = match[1].replace(/[\s-]/g, '');
        if (cleaned.length >= 10 && cleaned.length <= 15) {
          result.phone = cleaned;
          break;
        }
      }
    }

    // Try to extract business name from title tag
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      const title = titleMatch[1].replace(/\s*[-–]\s*Google Maps.*$/i, '').trim();
      if (title && title !== 'Google Maps') result.name = title;
    }

    // Try to extract address from meta description or embedded data
    const metaDescMatch = html.match(/<meta[^>]+content="([^"]*)"[^>]*name="description"/i)
      || html.match(/<meta[^>]+name="description"[^>]*content="([^"]*)"/i);
    if (metaDescMatch) {
      result.address = metaDescMatch[1].trim();
    }

  } catch (e) { logError('client-admin.error-scraping-google-maps-page', e); }
  return result;
}

async function reverseGeocodeNominatim(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es&zoom=18`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'AxkanSouvenirSystem/1.0 (admin shipping tool)' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await resp.json();
    if (!data || !data.address) return null;

    const addr = data.address;
    return {
      street: addr.road || addr.pedestrian || addr.street || null,
      street_number: addr.house_number || null,
      colonia: addr.suburb || addr.neighbourhood || addr.quarter || null,
      city: addr.city || addr.town || addr.village || addr.municipality || null,
      state: addr.state || null,
      postal_code: addr.postcode || null
    };
  } catch (e) { logError('client-admin.error-reverse-geocoding', e); return null; }
}

router.post('/clients/from-google-maps', async (req, res) => {
  try {
    const { url: rawUrl } = req.body;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'URL is required' });

    // Resolve shortened URLs
    const url = await resolveGoogleMapsUrl(rawUrl);
    if (!isGoogleMapsUrl(url)) {
      return res.status(400).json({ success: false, error: 'Not a valid Google Maps URL' });
    }

    const result = { name: null, phone: null, street: null, street_number: null,
                     colonia: null, city: null, state: null, postal_code: null };
    const sources = {};

    // Layer 1: Parse URL for name and coordinates
    const urlData = parseGoogleMapsUrl(url);
    if (urlData.name) { result.name = urlData.name; sources.name = 'url'; }

    // Layer 2: Scrape Google Maps page for phone/name/address
    const scrapeData = await scrapeGoogleMapsPage(url);
    if (scrapeData.name) { result.name = scrapeData.name; sources.name = 'scrape'; }
    if (scrapeData.phone) { result.phone = scrapeData.phone; sources.phone = 'scrape'; }

    // Layer 3: Nominatim reverse geocoding for address
    if (urlData.lat && urlData.lng) {
      const geo = await reverseGeocodeNominatim(urlData.lat, urlData.lng);
      if (geo) {
        if (geo.street) { result.street = geo.street; sources.street = 'nominatim'; }
        if (geo.street_number) { result.street_number = geo.street_number; sources.street_number = 'nominatim'; }
        if (geo.colonia) { result.colonia = geo.colonia; sources.colonia = 'nominatim'; }
        if (geo.city) { result.city = geo.city; sources.city = 'nominatim'; }
        if (geo.state) { result.state = geo.state; sources.state = 'nominatim'; }
        if (geo.postal_code) { result.postal_code = geo.postal_code; sources.postal_code = 'nominatim'; }
      }
    }

    // Layer 4: State fallback from postal code
    if (result.postal_code && !result.state) {
      result.state = getStateFromPostal(result.postal_code);
      if (result.state) sources.state = 'postal_map';
    }

    // Layer 5: SEPOMEX fallback for colonia (and city/state if still missing)
    if (result.postal_code && (!result.colonia || !result.city || !result.state)) {
      try {
        const sepResp = await fetch(`https://sepomex.icalialabs.com/api/v1/zip_codes?zip_code=${result.postal_code.trim()}`, {
          signal: AbortSignal.timeout(8000)
        });
        if (sepResp.ok) {
          const sepData = await sepResp.json();
          if (sepData.zip_codes && sepData.zip_codes.length > 0) {
            const entries = sepData.zip_codes;
            if (!result.colonia) {
              // Prefer colonia containing "Centro" (most common for city-center businesses)
              const centro = entries.find(e => /centro/i.test(e.d_asenta));
              // Fallback to first Colonia-type entry, then any entry
              const colType = entries.find(e => e.d_tipo_asenta === 'Colonia');
              const pick = centro || colType || entries[0];
              result.colonia = pick.d_asenta;
              sources.colonia = 'sepomex';
            }
            const ref = entries[0];
            if (!result.city && ref.d_mnpio) {
              result.city = ref.d_mnpio;
              sources.city = 'sepomex';
            }
            if (!result.state && ref.d_estado) {
              result.state = ref.d_estado;
              sources.state = 'sepomex';
            }
          }
        }
      } catch (e) { logError('client-admin.sepomex-fallback-error', e); }
    }

    const filledFields = Object.values(result).filter(v => v !== null).length;
    const confidence = filledFields >= 6 ? 'high' : filledFields >= 3 ? 'partial' : 'low';

    res.json({ success: true, data: result, sources, confidence });
  } catch (error) {
    logError('client-admin.error-extracting-google-maps-data', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/shipping/labels/bulk
 * Generate a PDF with shipping labels for multiple clients
 */
router.post('/shipping/labels/bulk', async (req, res) => {
  try {
    const { clientIds } = req.body;

    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      return res.status(400).json({ success: false, error: 'clientIds array required' });
    }

    // Fetch all clients
    const placeholders = clientIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await query(`
      SELECT id, name, phone, email, street, street_number, colonia, city, state,
             COALESCE(postal, postal_code) as postal_code, reference_notes
      FROM clients
      WHERE id IN (${placeholders})
    `, clientIds);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No clients found' });
    }

    const clients = result.rows;

    // Generate PDF with pdfkit
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });

    const filename = `etiquetas_${Date.now()}.pdf`;
    const filepath = path.join(__dirname, '../labels', filename);
    const stream = fs.createWriteStream(filepath);
    doc.pipe(stream);

    // Layout: 2 columns x 5 rows per page = 10 labels per page
    const labelW = 252;  // ~3.5 inches
    const labelH = 130;  // ~1.8 inches
    const colGap = 28;
    const rowGap = 12;
    const startX = 40;
    const startY = 40;

    clients.forEach((client, index) => {
      const labelsPerPage = 10;
      const posOnPage = index % labelsPerPage;

      if (index > 0 && posOnPage === 0) {
        doc.addPage();
      }

      const col = posOnPage % 2;
      const row = Math.floor(posOnPage / 2);
      const x = startX + col * (labelW + colGap);
      const y = startY + row * (labelH + rowGap);

      // Label border
      doc.save();
      doc.roundedRect(x, y, labelW, labelH, 6)
         .lineWidth(1)
         .strokeColor('#d1d5db')
         .stroke();

      // Pink left accent
      doc.roundedRect(x, y, 5, labelH, 3)
         .fillColor('#E91E63')
         .fill();

      // Name
      doc.fillColor('#111827')
         .font('Helvetica-Bold')
         .fontSize(11)
         .text(client.name || '', x + 14, y + 10, { width: labelW - 24, lineBreak: true });

      // Phone
      if (client.phone) {
        doc.fillColor('#6b7280')
           .font('Helvetica')
           .fontSize(9)
           .text(`Tel: ${client.phone}`, x + 14, y + 28, { width: labelW - 24 });
      }

      // Address lines
      let addrY = y + 44;
      const addrParts = [];
      if (client.street) {
        let streetLine = client.street;
        if (client.street_number) streetLine += ` #${client.street_number}`;
        addrParts.push(streetLine);
      }
      if (client.colonia) addrParts.push(`Col. ${client.colonia}`);

      const cityLine = [client.city, client.state].filter(Boolean).join(', ');
      if (cityLine) addrParts.push(cityLine);
      if (client.postal_code) addrParts.push(`CP ${client.postal_code}`);

      doc.fillColor('#374151')
         .font('Helvetica')
         .fontSize(9);

      addrParts.forEach(line => {
        doc.text(line, x + 14, addrY, { width: labelW - 24 });
        addrY += 12;
      });

      // Reference notes (if fits)
      if (client.reference_notes && addrY < y + labelH - 16) {
        doc.fillColor('#9ca3af')
           .fontSize(8)
           .text(`Ref: ${client.reference_notes}`, x + 14, addrY + 2, {
             width: labelW - 24,
             height: y + labelH - addrY - 8,
             ellipsis: true
           });
      }

      doc.restore();
    });

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      success: true,
      pdfUrl: `${baseUrl}/labels/${filename}`,
      filename,
      clientCount: clients.length
    });

  } catch (error) {
    logError('client-admin.error-generating-bulk-labels', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/clients/:id
 * Get single client by ID
 */
router.get('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(`
      SELECT
        c.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'orderNumber', o.order_number,
            'orderDate', o.order_date,
            'totalPrice', o.total_price,
            'status', o.status,
            'destination', o.destination
          ) ORDER BY o.order_date DESC
        ) FILTER (WHERE o.id IS NOT NULL) as orders
      FROM clients c
      LEFT JOIN orders o ON c.id = o.client_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    // Fetch saved addresses
    const addressesResult = await query(
      'SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY is_default DESC, last_used_at DESC',
      [id]
    );

    const clientData = result.rows[0];
    clientData.addresses = addressesResult.rows;

    res.json({ success: true, data: clientData });
  } catch (error) {
    logError('client-admin.error-fetching-client', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ═══════════════════════════════════════════════
// PAYMENT NOTES
// ═══════════════════════════════════════════════

/**
 * GET /api/payment-notes/client/:clientId
 * List all cuentas for a client
 */
router.get('/payment-notes/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const result = await query(
      'SELECT id, client_id, name, data, created_at, updated_at FROM payment_notes WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logError('client-admin.error-fetching-payment-notes', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/payment-notes/cuenta/:cuentaId
 * Get a single cuenta by ID
 */
router.get('/payment-notes/cuenta/:cuentaId', async (req, res) => {
  try {
    const { cuentaId } = req.params;
    const result = await query('SELECT * FROM payment_notes WHERE id = $1', [cuentaId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('client-admin.error-fetching-cuenta', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/payment-notes
 * Create a new cuenta for a client
 */
router.post('/payment-notes', async (req, res) => {
  try {
    const { clientId, name, data } = req.body;
    if (!clientId) return res.status(400).json({ success: false, error: 'clientId is required' });

    const result = await query(`
      INSERT INTO payment_notes (client_id, name, data)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [clientId, name || '', JSON.stringify(data || {})]);

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('client-admin.error-creating-cuenta', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/payment-notes/cuenta/:cuentaId
 * Update a cuenta
 */
router.put('/payment-notes/cuenta/:cuentaId', async (req, res) => {
  try {
    const { cuentaId } = req.params;
    const { data, name } = req.body;

    let setClauses = ['updated_at = NOW()'];
    let params = [];
    let paramIdx = 1;

    if (data !== undefined) {
      setClauses.push(`data = $${paramIdx}`);
      params.push(JSON.stringify(data));
      paramIdx++;
    }
    if (name !== undefined) {
      setClauses.push(`name = $${paramIdx}`);
      params.push(name);
      paramIdx++;
    }

    params.push(cuentaId);
    const result = await query(
      `UPDATE payment_notes SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cuenta not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('client-admin.error-updating-cuenta', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/payment-notes/cuenta/:cuentaId
 * Delete a single cuenta
 */
router.delete('/payment-notes/cuenta/:cuentaId', async (req, res) => {
  try {
    const { cuentaId } = req.params;
    await query('DELETE FROM payment_notes WHERE id = $1', [cuentaId]);
    res.json({ success: true });
  } catch (error) {
    logError('client-admin.error-deleting-cuenta', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/clients
 * Create a new client
 */
router.post('/clients', async (req, res) => {
  try {
    const { name, phone, email, address, street, street_number, colonia, city, state, postal_code, reference_notes } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const result = await query(`
      INSERT INTO clients (name, phone, email, address, street, street_number, colonia, city, state, postal_code, reference_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [name, phone || null, email || null, address || null, street || null, street_number || null, colonia || null, city || null, state || null, postal_code || null, reference_notes || null]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('client-admin.error-creating-client', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * PUT /api/clients/:id
 * Update a client
 */
router.put('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, street, street_number, colonia, city, state, postal_code, reference_notes } = req.body;

    const result = await query(`
      UPDATE clients
      SET name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          email = COALESCE($3, email),
          street = COALESCE($4, street),
          street_number = COALESCE($5, street_number),
          colonia = COALESCE($6, colonia),
          city = COALESCE($7, city),
          state = COALESCE($8, state),
          postal_code = COALESCE($9, postal_code),
          reference_notes = COALESCE($10, reference_notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $11
      RETURNING *
    `, [name, phone, email, street, street_number, colonia, city, state, postal_code, reference_notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logError('client-admin.error-updating-client', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * DELETE /api/clients/:id
 * Delete a client (sets client_id to NULL on orders if any exist)
 */
router.delete('/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Unlink any orders from this client
    await query('UPDATE orders SET client_id = NULL WHERE client_id = $1', [id]);

    // Unlink any shipping labels from this client
    await query('UPDATE shipping_labels SET client_id = NULL WHERE client_id = $1', [id]);

    // Unlink whatsapp conversations
    await query('UPDATE whatsapp_conversations SET client_id = NULL WHERE client_id = $1', [id]);

    // Unlink quotes
    await query('UPDATE quotes SET client_id = NULL WHERE client_id = $1', [id]).catch(() => {});

    // Then delete the client
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Client not found' });
    }

    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (error) {
    logError('client-admin.error-deleting-client', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});


export default router;
