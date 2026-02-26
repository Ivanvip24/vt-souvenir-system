/**
 * Payment Receipt Verifier Service
 * Uses Claude's Vision API to verify customer payment receipts and auto-approve orders
 */

import Anthropic from '@anthropic-ai/sdk';
import fetch from 'node-fetch';

let anthropicClient = null;

/**
 * Initialize the Anthropic client
 */
function initializeClient() {
  if (anthropicClient) {
    return anthropicClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  anthropicClient = new Anthropic({
    apiKey: apiKey
  });

  console.log('✅ Payment Receipt Verifier initialized');
  return anthropicClient;
}

/**
 * Download image from URL and convert to base64
 */
async function downloadImageAsBase64(imageUrl) {
  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    let mediaType = 'image/jpeg';
    if (contentType.includes('png')) mediaType = 'image/png';
    else if (contentType.includes('gif')) mediaType = 'image/gif';
    else if (contentType.includes('webp')) mediaType = 'image/webp';

    return { base64, mediaType };
  } catch (error) {
    console.error('❌ Error downloading image:', error.message);
    throw error;
  }
}

/**
 * Verify a payment receipt using Claude Vision
 * @param {string} receiptImageUrl - URL of the payment receipt image
 * @param {number} expectedAmount - Expected deposit amount
 * @param {string} orderNumber - Order number for context
 * @returns {Promise<Object>} - Verification result
 */
export async function verifyPaymentReceipt(receiptImageUrl, expectedAmount, orderNumber) {
  try {
    console.log(`🔍 Verifying payment receipt for order ${orderNumber}`);
    console.log(`   Expected amount: $${expectedAmount}`);
    console.log(`   Receipt URL: ${receiptImageUrl}`);

    const client = initializeClient();

    // Download and convert image to base64
    const { base64, mediaType } = await downloadImageAsBase64(receiptImageUrl);

    const systemPrompt = `Eres un experto verificador de comprobantes de pago bancarios mexicanos.
Tu trabajo es analizar imágenes de comprobantes de transferencia/pago y extraer información clave.

TIPOS DE COMPROBANTES QUE PUEDES ENCONTRAR:
- Transferencias SPEI
- Transferencias interbancarias
- Depósitos en efectivo
- Pagos con tarjeta
- Comprobantes de apps bancarias (BBVA, Santander, Banamex, Banorte, HSBC, Scotiabank, etc.)
- Comprobantes de apps de pago (Mercado Pago, PayPal, etc.)

FORMATOS DE COMPROBANTES BANCARIOS COMUNES:
- BBVA México: Muestra "COMPROBANTE DE LA OPERACION", "Importe transferido: $X.XX", folio, fecha, hora, concepto, cuenta origen/destino, nombre del beneficiario
- Santander: Similar con "Comprobante de Transferencia"
- Banamex/Citibanamex: Formato corporativo azul
- Banorte: Formato rojo/naranja

DEBES EXTRAER:
1. El MONTO de la transferencia/pago - busca campos como "Importe transferido", "Monto", "Cantidad", "$X.XX"
2. La FECHA de la operación (formato YYYY-MM-DD)
3. El FOLIO o número de operación (si existe)
4. La CLAVE DE RASTREO - es un código alfanumérico que identifica la transferencia SPEI. Busca campos como "Clave de rastreo", "Clave rastreo", "No. de rastreo", "Tracking". Es DIFERENTE al folio. Generalmente tiene formato como "MBAN01202502251234" o similar.
5. Si el comprobante parece LEGÍTIMO o sospechoso
6. El nombre del DESTINATARIO (si aparece)
7. El BANCO EMISOR (origen) y BANCO RECEPTOR (destino) - nombre exacto del banco (si aparece)

RESPONDE SIEMPRE EN FORMATO JSON con esta estructura exacta:
{
  "is_valid_receipt": true/false,
  "amount_detected": number or null,
  "currency": "MXN" or other,
  "date_detected": "YYYY-MM-DD" or null,
  "folio_number": "string" or null,
  "clave_rastreo": "string" or null,
  "recipient_name": "string" or null,
  "source_bank": "string" or null,
  "destination_bank": "string" or null,
  "confidence_level": "high" / "medium" / "low",
  "suspicious_indicators": [],
  "notes": "string with any relevant observations"
}

INDICADORES DE SOSPECHA (agregar a suspicious_indicators SOLO si realmente aplican):
- "edited_image" - Si la imagen claramente parece manipulada con Photoshop o similar
- "screenshot_of_screenshot" - Si es foto de pantalla muy borrosa e ilegible
- "mismatched_fonts" - Si las fuentes son claramente inconsistentes (señal de edición)
- "incomplete_info" - Si falta información crítica como monto o banco
- "unusual_format" - Si el formato no parece de ningún banco real conocido

IMPORTANTE:
- Si puedes leer el monto claramente (como "$655.00"), NO agregues "amount_unclear"
- Los comprobantes de BBVA con "Importe transferido" son legítimos y comunes
- Un comprobante con folio, fecha, monto y banco visible es válido
- suspicious_indicators debe estar VACÍO [] si el comprobante se ve normal y legítimo
- Confidence_level debe ser "high" si toda la información es legible

Si NO puedes leer el monto o la imagen no es un comprobante de pago, marca is_valid_receipt como false.`;

    const userPrompt = `Analiza este comprobante de pago.

INFORMACIÓN DEL PEDIDO:
- Número de pedido: ${orderNumber}
- Monto esperado del anticipo: $${expectedAmount.toFixed(2)} MXN

Verifica si:
1. Es un comprobante de pago real y legítimo
2. El monto coincide o es cercano al esperado ($${expectedAmount.toFixed(2)})
3. No hay señales de manipulación

Responde SOLO con el JSON estructurado.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }
      ],
      system: systemPrompt
    });

    // Extract the response text
    const responseText = response.content[0].text;
    console.log('📝 Claude response:', responseText);

    // Parse JSON from response
    let analysisResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response:', parseError);
      return {
        success: false,
        verified: false,
        error: 'Error al procesar la respuesta del análisis',
        raw_response: responseText
      };
    }

    // Calculate amount match
    const amountDetected = analysisResult.amount_detected;
    let amountMatches = false;
    let amountDifference = null;

    if (amountDetected !== null && amountDetected !== undefined) {
      amountDifference = amountDetected - expectedAmount;
      // Accept if amount is equal to or GREATER than expected (overpayment is OK)
      // Reject only if amount is LESS than expected
      amountMatches = amountDetected >= expectedAmount;
    }

    // Filter out contradictory suspicious indicators
    // If amount was detected successfully, remove "amount_unclear" flag
    let filteredIndicators = analysisResult.suspicious_indicators || [];
    if (amountDetected !== null && amountDetected !== undefined && amountDetected > 0) {
      filteredIndicators = filteredIndicators.filter(ind => ind !== 'amount_unclear');
    }

    // Critical indicators that should always block auto-approval
    const criticalIndicators = ['edited_image', 'mismatched_fonts'];
    const hasCriticalIndicator = filteredIndicators.some(ind => criticalIndicators.includes(ind));

    // Determine if we should auto-approve
    const shouldAutoApprove =
      analysisResult.is_valid_receipt === true &&
      amountMatches &&
      analysisResult.confidence_level !== 'low' &&
      !hasCriticalIndicator;

    // Update the analysis result with filtered indicators
    analysisResult.suspicious_indicators = filteredIndicators;

    const result = {
      success: true,
      verified: shouldAutoApprove,
      analysis: {
        is_valid_receipt: analysisResult.is_valid_receipt,
        amount_detected: amountDetected,
        expected_amount: expectedAmount,
        amount_matches: amountMatches,
        amount_difference: amountDifference,
        date_detected: analysisResult.date_detected,
        folio_number: analysisResult.folio_number,
        clave_rastreo: analysisResult.clave_rastreo || analysisResult.folio_number,
        recipient_name: analysisResult.recipient_name,
        source_bank: analysisResult.source_bank,
        destination_bank: analysisResult.destination_bank,
        confidence_level: analysisResult.confidence_level,
        suspicious_indicators: analysisResult.suspicious_indicators || [],
        notes: analysisResult.notes
      },
      recommendation: shouldAutoApprove ? 'AUTO_APPROVE' : 'MANUAL_REVIEW',
      recommendation_reason: getRecommendationReason(analysisResult, amountMatches, amountDetected, expectedAmount)
    };

    console.log(`✅ Receipt verification complete: ${result.recommendation}`);
    return result;

  } catch (error) {
    console.error('❌ Error verifying payment receipt:', error);
    return {
      success: false,
      verified: false,
      error: error.message,
      recommendation: 'MANUAL_REVIEW',
      recommendation_reason: `Error en análisis: ${error.message}`
    };
  }
}

/**
 * Generate human-readable recommendation reason
 */
function getRecommendationReason(analysis, amountMatches, amountDetected, expectedAmount) {
  const reasons = [];

  if (!analysis.is_valid_receipt) {
    reasons.push('El comprobante no parece ser válido o no es legible');
  }

  if (!amountMatches) {
    if (amountDetected === null || amountDetected === undefined) {
      reasons.push('No se pudo detectar el monto en el comprobante');
    } else {
      reasons.push(`Monto insuficiente: se detectó $${amountDetected.toFixed(2)}, se esperaba mínimo $${expectedAmount.toFixed(2)}`);
    }
  }

  if (analysis.confidence_level === 'low') {
    reasons.push('Baja confianza en la lectura del comprobante');
  }

  if (analysis.suspicious_indicators && analysis.suspicious_indicators.length > 0) {
    reasons.push(`Indicadores sospechosos: ${analysis.suspicious_indicators.join(', ')}`);
  }

  if (reasons.length === 0) {
    return 'Comprobante válido, monto correcto, sin indicadores sospechosos';
  }

  return reasons.join('. ');
}

/**
 * Check if Anthropic API is configured
 */
export function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export default {
  verifyPaymentReceipt,
  isConfigured
};
