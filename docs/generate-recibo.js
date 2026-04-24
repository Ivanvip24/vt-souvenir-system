import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, Header, Footer,
  PageNumber, ShadingType, VerticalAlign, convertInchesToTwip
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── AXKAN Brand Colors ───
const ROSA = 'e72a88';
const VERDE = '8ab73b';
const NARANJA = 'f39223';
const TURQUESA = '09adc2';
const ROJO = 'e52421';
const GRIS = '333333';
const GRIS_MED = '666666';
const GRIS_LIGHT = 'F2F2F2';
const WHITE = 'FFFFFF';

// ─── Official AXKAN_SOURCES logos ───
const jaguarPath = path.join(__dirname, '..', 'AXKAN_SOURCES', 'JAGUAR.png');
const fullLogoPath = path.join(__dirname, '..', 'AXKAN_SOURCES', 'JAGUAR_LETTERS.png');
const jaguarBuf = fs.readFileSync(jaguarPath);
const fullLogoBuf = fs.readFileSync(fullLogoPath);

const PAGE_W = 9360; // 6.5in in twips
const COL_LEFT = 4000;
const COL_RIGHT = PAGE_W - COL_LEFT;

// ─── Helpers ───
function spacer(pts = 120) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });
}

function pinkLine() {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ROSA } },
    children: []
  });
}

function thinLine(color = 'DDDDDD') {
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color } },
    children: []
  });
}

function txt(text, opts = {}) {
  return new TextRun({
    text,
    font: 'Helvetica Neue',
    size: opts.size || 20,
    color: opts.color || GRIS,
    bold: opts.bold || false,
    italics: opts.italics || false,
  });
}

function para(children, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 40, after: opts.after || 40 },
    children: Array.isArray(children) ? children : [children],
  });
}

// Today's date formatted
const today = new Date();
const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const dateStr = `${today.getDate()} de ${months[today.getMonth()]} de ${today.getFullYear()}`;

// ─── Receipt row helper ───
function receiptRow(label, value, opts = {}) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL_LEFT, type: WidthType.DXA },
        shading: opts.shaded ? { type: ShadingType.SOLID, color: GRIS_LIGHT } : undefined,
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { before: 60, after: 60 },
          indent: { left: 100 },
          children: [txt(label, { bold: true, size: 19, color: GRIS_MED })],
        })],
      }),
      new TableCell({
        width: { size: COL_RIGHT, type: WidthType.DXA },
        shading: opts.shaded ? { type: ShadingType.SOLID, color: GRIS_LIGHT } : undefined,
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { before: 60, after: 60 },
          alignment: AlignmentType.RIGHT,
          indent: { right: 100 },
          children: [txt(value, { bold: opts.boldValue || false, size: opts.valueSize || 20, color: opts.valueColor || GRIS })],
        })],
      }),
    ],
  });
}

// ─── Highlight row (for totals) ───
function highlightRow(label, value, bgColor, textColor = WHITE) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: COL_LEFT, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: bgColor },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { before: 80, after: 80 },
          indent: { left: 100 },
          children: [txt(label, { bold: true, size: 22, color: textColor })],
        })],
      }),
      new TableCell({
        width: { size: COL_RIGHT, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: bgColor },
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          spacing: { before: 80, after: 80 },
          alignment: AlignmentType.RIGHT,
          indent: { right: 100 },
          children: [txt(value, { bold: true, size: 26, color: textColor })],
        })],
      }),
    ],
  });
}

// ═══════════════════════════════════════
// BUILD DOCUMENT
// ═══════════════════════════════════════
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Helvetica Neue', size: 20, color: GRIS },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(0.8),
          bottom: convertInchesToTwip(0.6),
          left: convertInchesToTwip(1),
          right: convertInchesToTwip(1),
        },
        size: {
          width: convertInchesToTwip(8.5),
          height: convertInchesToTwip(11),
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: ROSA } },
            children: [],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: ROSA } },
            spacing: { before: 60 },
            children: [],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              txt('AXKAN  •  hola@axkan.mx  •  @axkan.mx  •  vtanunciando.com', { size: 14, color: GRIS_MED }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 20 },
            children: [
              txt('"Recuerdos Hechos Souvenir"', { size: 12, color: ROSA, italics: true }),
            ],
          }),
        ],
      }),
    },
    children: [
      // ═══ HEADER: Logo centered ═══
      spacer(60),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: fullLogoBuf,
            transformation: { width: 200, height: 165 },
            type: 'png',
          }),
        ],
      }),

      spacer(80),

      // ═══ RECIBO DE PAGO title ═══
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          txt('RECIBO DE PAGO', { bold: true, size: 32, color: ROSA }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 20, after: 0 },
        children: [
          txt('Anticipo de Pedido', { size: 20, color: GRIS_MED, italics: true }),
        ],
      }),

      spacer(40),
      pinkLine(),
      spacer(40),

      // ═══ Receipt number & date ═══
      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [COL_LEFT, COL_RIGHT],
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: COL_LEFT, type: WidthType.DXA },
                children: [para([
                  txt('Recibo No. ', { size: 18, color: GRIS_MED }),
                  txt(`AXK-${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`, { size: 18, bold: true, color: ROSA }),
                ])],
              }),
              new TableCell({
                width: { size: COL_RIGHT, type: WidthType.DXA },
                children: [para([
                  txt('Fecha: ', { size: 18, color: GRIS_MED }),
                  txt(dateStr, { size: 18, bold: true }),
                ], { align: AlignmentType.RIGHT })],
              }),
            ],
          }),
        ],
      }),

      spacer(80),

      // ═══ RECIBÍ DE ═══
      new Paragraph({
        children: [
          txt('RECIBÍ DE:', { bold: true, size: 18, color: ROSA }),
        ],
      }),
      spacer(20),

      // Client info table
      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [COL_LEFT, COL_RIGHT],
        rows: [
          receiptRow('Cliente', 'Ivan', { shaded: true, boldValue: true }),
          receiptRow('Concepto', 'Anticipo de pedido de souvenirs'),
        ],
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
      }),

      spacer(80),

      // ═══ DETALLE DEL PAGO ═══
      new Paragraph({
        children: [
          txt('DETALLE DEL PAGO:', { bold: true, size: 18, color: ROSA }),
        ],
      }),
      spacer(20),

      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [COL_LEFT, COL_RIGHT],
        rows: [
          receiptRow('Total del Pedido', '$2,000.00 MXN', { shaded: true }),
          receiptRow('Anticipo Recibido', '$500.00 MXN', { boldValue: true, valueColor: VERDE }),
          receiptRow('Saldo Pendiente', '$1,500.00 MXN', { shaded: true, boldValue: true, valueColor: ROJO }),
          receiptRow('Método de Pago', 'Transferencia / Efectivo'),
        ],
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
      }),

      spacer(60),

      // ═══ BIG HIGHLIGHT: Amount received ═══
      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [COL_LEFT, COL_RIGHT],
        rows: [
          highlightRow('CANTIDAD RECIBIDA', '$500.00 MXN', ROSA),
        ],
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
      }),

      spacer(40),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          txt('(Quinientos pesos 00/100 Moneda Nacional)', { size: 16, color: GRIS_MED, italics: true }),
        ],
      }),

      spacer(80),

      // ═══ NOTE ═══
      new Paragraph({
        children: [
          txt('NOTA:', { bold: true, size: 18, color: TURQUESA }),
        ],
      }),
      new Paragraph({
        spacing: { before: 20, after: 0 },
        children: [
          txt('El saldo restante de $1,500.00 MXN deberá liquidarse antes del envío del pedido. La producción inicia con la confirmación de este anticipo.', { size: 18, color: GRIS_MED }),
        ],
      }),

      spacer(200),

      // ═══ SIGNATURES ═══
      new Table({
        width: { size: PAGE_W, type: WidthType.DXA },
        columnWidths: [Math.floor(PAGE_W/2), Math.floor(PAGE_W/2)],
        borders: {
          top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('________________________________', { size: 20, color: GRIS_MED })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [txt('ENTREGA', { bold: true, size: 16, color: ROSA })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 10 }, children: [txt('AXKAN', { size: 14, color: GRIS_MED })] }),
                ],
              }),
              new TableCell({
                width: { size: Math.floor(PAGE_W/2), type: WidthType.DXA },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [txt('________________________________', { size: 20, color: GRIS_MED })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [txt('RECIBE', { bold: true, size: 16, color: ROSA })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 10 }, children: [txt('Ivan', { size: 14, color: GRIS_MED })] }),
                ],
              }),
            ],
          }),
        ],
      }),

      spacer(100),
      thinLine(ROSA),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40 },
        children: [
          txt('Este recibo ampara únicamente el anticipo señalado. No sustituye factura fiscal.', { size: 14, color: GRIS_MED, italics: true }),
        ],
      }),
    ],
  }],
});

// ─── Generate ───
const outputDocx = path.join(__dirname, 'AXKAN-Recibo-Ivan-Anticipo.docx');
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputDocx, buffer);
console.log(`✅ Receipt generated: ${outputDocx}`);
console.log(`   File size: ${(buffer.length / 1024).toFixed(1)} KB`);
