import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, Header, Footer,
  PageNumber, NumberFormat, HeadingLevel, ShadingType, VerticalAlign,
  TabStopPosition, TabStopType, convertInchesToTwip, PageBreak
} from 'docx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── AXKAN Brand Colors ───
const ROSA_MEXICANO = 'e72a88';
const VERDE_SELVA = '8ab73b';
const NARANJA_CALIDO = 'f39223';
const TURQUESA_CARIBE = '09adc2';
const ROJO_MEXICANO = 'e52421';
const ORO_MAYA = 'D4A574';
const GRIS_OSCURO = '333333';
const GRIS_MEDIO = '666666';
const GRIS_CLARO = 'F5F5F5';
const WHITE = 'FFFFFF';

// ─── Load logo ───
const logoPath = path.join(__dirname, '..', 'AXKAN', 'brand-manual', 'web', 'LOGO-01.png');
const logoBuffer = fs.readFileSync(logoPath);

// ─── Reusable helpers ───
function pinkLine() {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: ROSA_MEXICANO }
    },
    children: []
  });
}

function thinPinkLine() {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 2, color: ROSA_MEXICANO }
    },
    children: []
  });
}

function spacer(pts = 120) {
  return new Paragraph({ spacing: { before: pts, after: 0 }, children: [] });
}

function heading(text, color = ROSA_MEXICANO) {
  return new Paragraph({
    spacing: { before: 300, after: 100 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        bold: true,
        size: 24,
        color: color,
        font: 'Helvetica Neue',
      })
    ]
  });
}

function subheading(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 20,
        color: GRIS_OSCURO,
        font: 'Helvetica Neue',
      })
    ]
  });
}

function bodyText(text, opts = {}) {
  return new Paragraph({
    spacing: { before: opts.spaceBefore || 60, after: opts.spaceAfter || 60 },
    alignment: opts.alignment || AlignmentType.JUSTIFIED,
    indent: opts.indent ? { left: convertInchesToTwip(0.3) } : undefined,
    children: [
      new TextRun({
        text,
        size: 20,
        color: opts.color || GRIS_OSCURO,
        font: 'Helvetica Neue',
        bold: opts.bold || false,
        italics: opts.italics || false,
      })
    ]
  });
}

function bulletPoint(text, color = ROSA_MEXICANO) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.2) },
    children: [
      new TextRun({ text: '● ', size: 16, color, font: 'Helvetica Neue' }),
      new TextRun({ text, size: 20, color: GRIS_OSCURO, font: 'Helvetica Neue' }),
    ]
  });
}

function numberedItem(num, text, bold = false) {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    indent: { left: convertInchesToTwip(0.4), hanging: convertInchesToTwip(0.25) },
    children: [
      new TextRun({ text: `${num}. `, size: 20, color: ROSA_MEXICANO, bold: true, font: 'Helvetica Neue' }),
      new TextRun({ text, size: 20, color: GRIS_OSCURO, font: 'Helvetica Neue', bold }),
    ]
  });
}

function fillLine(label) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, color: GRIS_OSCURO, font: 'Helvetica Neue' }),
      new TextRun({ text: '________________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
    ]
  });
}

function signatureBlock(role) {
  return [
    spacer(300),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: '________________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 0 },
      children: [
        new TextRun({ text: role, bold: true, size: 18, color: ROSA_MEXICANO, font: 'Helvetica Neue' }),
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 0 },
      children: [
        new TextRun({ text: 'Nombre: ____________________________', size: 18, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
      ]
    }),
  ];
}

// ─── Vacation table ───
// Page width = 8.5in - 1in left - 1in right = 6.5in = 9360 twips
const TABLE_WIDTH_TWIPS = 9360;
const HALF_WIDTH = Math.floor(TABLE_WIDTH_TWIPS / 2);

function vacationTable() {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        shading: { type: ShadingType.SOLID, color: ROSA_MEXICANO },
        verticalAlign: VerticalAlign.CENTER,
        width: { size: HALF_WIDTH, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ANTIGÜEDAD', bold: true, size: 18, color: WHITE, font: 'Helvetica Neue' })] })],
      }),
      new TableCell({
        shading: { type: ShadingType.SOLID, color: ROSA_MEXICANO },
        verticalAlign: VerticalAlign.CENTER,
        width: { size: HALF_WIDTH, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'DÍAS DE VACACIONES', bold: true, size: 18, color: WHITE, font: 'Helvetica Neue' })] })],
      }),
    ],
  });

  const data = [['1 año', '12 días'], ['2 años', '14 días'], ['3 años', '16 días'], ['4 años', '18 días'], ['5 años', '20 días']];
  const rows = data.map((d, i) => new TableRow({
    children: [
      new TableCell({
        shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: GRIS_CLARO } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: HALF_WIDTH, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d[0], size: 18, color: GRIS_OSCURO, font: 'Helvetica Neue' })] })],
      }),
      new TableCell({
        shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: GRIS_CLARO } : undefined,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: HALF_WIDTH, type: WidthType.DXA },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: d[1], size: 18, color: GRIS_OSCURO, font: 'Helvetica Neue' })] })],
      }),
    ],
  }));

  return new Table({
    width: { size: TABLE_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [HALF_WIDTH, HALF_WIDTH],
    rows: [headerRow, ...rows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: ROSA_MEXICANO },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: ROSA_MEXICANO },
      left: { style: BorderStyle.SINGLE, size: 1, color: ROSA_MEXICANO },
      right: { style: BorderStyle.SINGLE, size: 1, color: ROSA_MEXICANO },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
    },
  });
}

// ─── BUILD DOCUMENT ───
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: 'Helvetica Neue',
          size: 20,
          color: GRIS_OSCURO,
        },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          bottom: convertInchesToTwip(0.8),
          left: convertInchesToTwip(1),
          right: convertInchesToTwip(1),
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new ImageRun({
                data: logoBuffer,
                transformation: { width: 50, height: 55 },
                type: 'png',
              }),
            ],
          }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: ROSA_MEXICANO } },
            children: [],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: ROSA_MEXICANO } },
            spacing: { before: 80 },
            children: [],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'AXKAN  •  hola@axkan.mx  •  @axkan.mx', size: 14, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 20 },
            children: [
              new TextRun({ text: 'Página ', size: 14, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: ROSA_MEXICANO, font: 'Helvetica Neue' }),
            ],
          }),
        ],
      }),
    },
    children: [

      // ═══ COVER / TITLE SECTION ═══
      spacer(200),

      // Centered logo
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: logoBuffer,
            transformation: { width: 120, height: 132 },
            type: 'png',
          }),
        ],
      }),

      spacer(100),

      // AXKAN title - each letter different brand color
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: 'A', bold: true, size: 56, color: ROSA_MEXICANO, font: 'Helvetica Neue' }),
          new TextRun({ text: 'X', bold: true, size: 56, color: VERDE_SELVA, font: 'Helvetica Neue' }),
          new TextRun({ text: 'K', bold: true, size: 56, color: NARANJA_CALIDO, font: 'Helvetica Neue' }),
          new TextRun({ text: 'A', bold: true, size: 56, color: TURQUESA_CARIBE, font: 'Helvetica Neue' }),
          new TextRun({ text: 'N', bold: true, size: 56, color: ROJO_MEXICANO, font: 'Helvetica Neue' }),
        ],
      }),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 0 },
        children: [
          new TextRun({ text: 'Recuerdos Hechos Souvenir', italics: true, size: 18, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
        ],
      }),

      spacer(200),
      pinkLine(),
      spacer(60),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'CONTRATO INDIVIDUAL DE TRABAJO',
            bold: true,
            size: 32,
            color: ROSA_MEXICANO,
            font: 'Helvetica Neue',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 40, after: 0 },
        children: [
          new TextRun({
            text: 'POR TIEMPO INDETERMINADO CON PERIODO DE PRUEBA',
            bold: true,
            size: 22,
            color: GRIS_OSCURO,
            font: 'Helvetica Neue',
          }),
        ],
      }),

      spacer(60),
      pinkLine(),

      spacer(200),

      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'En la ciudad de __________________, Estado de __________________', size: 20, color: GRIS_OSCURO, font: 'Helvetica Neue' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60 },
        children: [
          new TextRun({ text: 'a ______ de __________________ de 20____', size: 20, color: GRIS_OSCURO, font: 'Helvetica Neue' }),
        ],
      }),

      // ═══ SECTION: COMPARECEN ═══
      spacer(200),
      heading('COMPARECEN'),
      thinPinkLine(),

      subheading('PATRÓN'),
      fillLine('Nombre / Razón Social'),
      fillLine('RFC'),
      fillLine('Domicilio del centro de trabajo'),
      fillLine('Representante legal (si aplica)'),

      spacer(100),
      subheading('TRABAJADOR'),
      fillLine('Nombre completo'),
      fillLine('CURP'),
      fillLine('RFC'),
      fillLine('Domicilio'),
      fillLine('Fecha de nacimiento'),
      fillLine('Estado civil'),

      // ═══ SECTION: DECLARACIONES ═══
      heading('DECLARACIONES'),
      thinPinkLine(),

      bodyText('I. El Patrón declara ser una persona física / moral dedicada a ________________________________________ y requiere los servicios del Trabajador para el puesto descrito en este contrato.'),
      spacer(60),
      bodyText('II. El Trabajador declara tener la capacidad y conocimientos necesarios para desempeñar el puesto para el que es contratado.'),
      spacer(60),
      bodyText('III. Ambas partes acuerdan celebrar el presente contrato al tenor de las siguientes:'),

      // ═══ CLÁUSULAS ═══
      heading('CLÁUSULAS', TURQUESA_CARIBE),
      pinkLine(),

      // PRIMERA
      heading('PRIMERA — OBJETO DEL CONTRATO'),
      thinPinkLine(),
      bodyText('El Trabajador se obliga a prestar sus servicios personales subordinados al Patrón, desempeñando el puesto de:'),
      fillLine('Puesto'),
      spacer(60),
      bodyText('Las actividades principales consisten en:', { bold: true }),
      numberedItem(1, '________________________________________________________________________'),
      numberedItem(2, '________________________________________________________________________'),
      numberedItem(3, '________________________________________________________________________'),
      spacer(40),
      bodyText('El Trabajador podrá realizar actividades complementarias relacionadas con su puesto según las necesidades del negocio.', { italics: true, color: GRIS_MEDIO }),

      // SEGUNDA
      heading('SEGUNDA — PERIODO DE PRUEBA'),
      thinPinkLine(),
      bodyText('De conformidad con el Artículo 39-A de la Ley Federal del Trabajo, el presente contrato incluye un periodo de prueba de 30 (treinta) días naturales, contados a partir de la fecha de inicio de labores.'),
      spacer(60),
      bodyText('Durante este periodo se evaluará:', { bold: true }),
      bulletPoint('Cumplimiento de funciones asignadas'),
      bulletPoint('Puntualidad y asistencia', TURQUESA_CARIBE),
      bulletPoint('Actitud y disposición al trabajo', VERDE_SELVA),
      bulletPoint('Aptitudes y conocimientos para el puesto', NARANJA_CALIDO),
      spacer(60),
      bodyText('Si al término del periodo de prueba el Trabajador no acredita los requisitos y conocimientos necesarios, la relación de trabajo se dará por terminada sin responsabilidad para el Patrón, de conformidad con el Artículo 39-A de la Ley Federal del Trabajo.', { bold: true }),
      spacer(60),
      bodyText('En caso de que el Trabajador apruebe satisfactoriamente el periodo de prueba, la relación laboral continuará por tiempo indeterminado, computándose el periodo de prueba como parte de la antigüedad del Trabajador.'),

      // TERCERA
      heading('TERCERA — DURACIÓN'),
      thinPinkLine(),
      bodyText('La relación de trabajo es por tiempo indeterminado, sujeta al periodo de prueba establecido en la cláusula anterior.'),
      fillLine('Fecha de inicio de labores'),

      // CUARTA
      heading('CUARTA — LUGAR DE TRABAJO'),
      thinPinkLine(),
      fillLine('Dirección del centro de trabajo'),
      spacer(40),
      bodyText('El Patrón podrá requerir que el Trabajador se traslade temporalmente a otros puntos de venta, eventos o ubicaciones relacionadas con el giro del negocio, cubriendo los gastos de traslado correspondientes.', { italics: true, color: GRIS_MEDIO }),

      // QUINTA
      heading('QUINTA — JORNADA DE TRABAJO'),
      thinPinkLine(),
      bodyText('La jornada de trabajo será diurna conforme a lo siguiente:'),
      spacer(60),
      bulletPoint('Días laborales: Lunes a Sábado'),
      bulletPoint('Horario: De ________ hrs a ________ hrs', TURQUESA_CARIBE),
      bulletPoint('Hora de comida: De ________ hrs a ________ hrs (no computa como jornada)', VERDE_SELVA),
      bulletPoint('Horas semanales: 48 horas máximo (jornada diurna legal)', NARANJA_CALIDO),
      bulletPoint('Día de descanso semanal: Domingo (con goce de salario)', ROJO_MEXICANO),
      spacer(60),
      bodyText('Nota: Si por necesidades del negocio el Trabajador labora en su día de descanso, se le pagará un salario doble adicional al que le corresponde por el descanso (prima dominical del 25% si labora en domingo), conforme al Artículo 73 de la LFT.', { italics: true }),

      // SEXTA
      heading('SEXTA — SALARIO'),
      thinPinkLine(),
      spacer(60),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 20 },
        children: [
          new TextRun({ text: 'SALARIO NETO SEMANAL', bold: true, size: 24, color: ROSA_MEXICANO, font: 'Helvetica Neue' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: '$2,000.00 MXN', bold: true, size: 36, color: GRIS_OSCURO, font: 'Helvetica Neue' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 100 },
        children: [
          new TextRun({ text: '(Dos mil pesos 00/100 Moneda Nacional)', italics: true, size: 18, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
        ],
      }),
      bulletPoint('Forma de pago: Transferencia bancaria / Efectivo'),
      bulletPoint('Día de pago: Cada __________________', TURQUESA_CARIBE),
      spacer(40),
      bodyText('El Patrón se obliga a cubrir la diferencia entre el salario bruto y el neto, incluyendo las retenciones de ley que correspondan.', { italics: true, color: GRIS_MEDIO }),

      // SÉPTIMA
      heading('SÉPTIMA — PRESTACIONES DE LEY'),
      thinPinkLine(),
      bodyText('El Trabajador tendrá derecho a las siguientes prestaciones mínimas de ley:'),

      subheading('a) Aguinaldo'),
      bodyText('15 días de salario como mínimo, pagadero antes del 20 de diciembre de cada año. Si el Trabajador no cumple el año, se pagará proporcionalmente.'),

      subheading('b) Vacaciones (Reforma 1 de enero de 2023, Art. 76 LFT)'),
      spacer(40),
      vacationTable(),

      subheading('c) Prima Vacacional'),
      bodyText('25% sobre el monto del salario correspondiente a los días de vacaciones.'),

      subheading('d) Días de Descanso Obligatorio (Art. 74 LFT)'),
      bulletPoint('1 de enero'),
      bulletPoint('Primer lunes de febrero (Constitución)', TURQUESA_CARIBE),
      bulletPoint('Tercer lunes de marzo (Natalicio de Benito Juárez)', VERDE_SELVA),
      bulletPoint('1 de mayo (Día del Trabajo)', NARANJA_CALIDO),
      bulletPoint('16 de septiembre (Independencia)', ROJO_MEXICANO),
      bulletPoint('Primer lunes de octubre (Revolución)'),
      bulletPoint('25 de diciembre', TURQUESA_CARIBE),
      bulletPoint('Día de elección (conforme leyes electorales)', VERDE_SELVA),
      spacer(40),
      bodyText('Si el Trabajador labora en día de descanso obligatorio, se le pagará salario triple.', { bold: true }),

      subheading('e) Participación de Utilidades (PTU)'),
      bodyText('Conforme a lo que establezca la ley, cuando aplique.'),

      // OCTAVA
      heading('OCTAVA — SEGURIDAD SOCIAL'),
      thinPinkLine(),
      bodyText('El Patrón reconoce su obligación de inscribir al Trabajador ante el Instituto Mexicano del Seguro Social (IMSS) dentro de los primeros 5 días hábiles de inicio de labores, conforme a la Ley del Seguro Social.'),
      spacer(60),
      bodyText('En caso de no contar con registro patronal al momento de la firma, el Patrón asume la responsabilidad total por cualquier accidente de trabajo, enfermedad profesional o riesgo laboral que sufra el Trabajador durante o con motivo de sus funciones, incluyendo los gastos médicos, indemnizaciones y prestaciones que la ley establezca.', { italics: true }),

      // NOVENA
      heading('NOVENA — OBLIGACIONES DEL TRABAJADOR'),
      thinPinkLine(),
      bodyText('El Trabajador se compromete a:'),
      numberedItem(1, 'Desempeñar el trabajo con la intensidad, cuidado y esmero apropiados'),
      numberedItem(2, 'Cumplir con el horario establecido y avisar con anticipación cualquier falta'),
      numberedItem(3, 'Cuidar las herramientas, equipo y materiales que se le proporcionen'),
      numberedItem(4, 'No divulgar información confidencial del negocio (clientes, precios, proveedores, procesos)'),
      numberedItem(5, 'Mantener un trato respetuoso con compañeros, clientes y superiores'),
      numberedItem(6, 'Cumplir con las normas de seguridad e higiene del centro de trabajo'),
      numberedItem(7, 'Avisar inmediatamente de cualquier situación de riesgo o accidente'),

      // DÉCIMA
      heading('DÉCIMA — OBLIGACIONES DEL PATRÓN'),
      thinPinkLine(),
      bodyText('El Patrón se compromete a:'),
      numberedItem(1, 'Pagar el salario en los términos y plazos convenidos'),
      numberedItem(2, 'Proporcionar las herramientas y materiales necesarios para el trabajo'),
      numberedItem(3, 'Mantener condiciones seguras e higiénicas en el centro de trabajo'),
      numberedItem(4, 'Tratar al Trabajador con respeto y dignidad'),
      numberedItem(5, 'Otorgar las prestaciones de ley señaladas en este contrato'),
      numberedItem(6, 'Expedir constancia de trabajo cuando el Trabajador lo solicite'),

      // DÉCIMA PRIMERA
      heading('DÉCIMA PRIMERA — CAUSAS DE RESCISIÓN'),
      thinPinkLine(),
      bodyText('La relación de trabajo podrá rescindirse sin responsabilidad para el Patrón en los supuestos del Artículo 47 de la Ley Federal del Trabajo, incluyendo pero no limitándose a:'),
      bulletPoint('Faltas de honradez, actos de violencia o malos tratos'),
      bulletPoint('Faltas injustificadas (más de 3 en un periodo de 30 días)', ROJO_MEXICANO),
      bulletPoint('Dañar intencionalmente herramientas, equipo o materiales del Patrón', NARANJA_CALIDO),
      bulletPoint('Presentarse en estado de embriaguez o bajo el influjo de drogas', TURQUESA_CARIBE),
      bulletPoint('Desobediencia reiterada sin causa justificada', VERDE_SELVA),
      bulletPoint('Revelar secretos de fabricación o información confidencial'),
      spacer(60),
      bodyText('El Patrón deberá entregar al Trabajador aviso por escrito de la rescisión, indicando las conductas y las fechas en que se cometieron.', { bold: true }),

      // DÉCIMA SEGUNDA
      heading('DÉCIMA SEGUNDA — TERMINACIÓN Y FINIQUITO'),
      thinPinkLine(),

      subheading('A) Terminación durante el periodo de prueba (primeros 30 días)'),
      bodyText('Si el Trabajador no aprueba el periodo de prueba, el Patrón pagará únicamente el finiquito proporcional:'),
      bulletPoint('Salario devengado hasta la fecha de terminación'),
      bulletPoint('Aguinaldo proporcional (15 días ÷ 365 × días trabajados)', TURQUESA_CARIBE),
      bulletPoint('Vacaciones proporcionales (12 días ÷ 365 × días trabajados)', VERDE_SELVA),
      bulletPoint('Prima vacacional (25% sobre vacaciones proporcionales)', NARANJA_CALIDO),
      spacer(40),
      bodyText('No se generará indemnización constitucional ni prima de antigüedad.', { bold: true }),

      subheading('B) Terminación posterior al periodo de prueba'),
      bodyText('En caso de terminación sin causa justificada después del periodo de prueba, el Patrón liquidará al Trabajador conforme a la ley:'),
      bulletPoint('Salario devengado hasta la fecha de terminación'),
      bulletPoint('Aguinaldo proporcional', TURQUESA_CARIBE),
      bulletPoint('Vacaciones proporcionales y prima vacacional', VERDE_SELVA),
      bulletPoint('Prima de antigüedad (12 días por año, cuando aplique)', NARANJA_CALIDO),
      bulletPoint('Indemnización constitucional (3 meses de salario)', ROJO_MEXICANO),

      // DÉCIMA TERCERA
      heading('DÉCIMA TERCERA — JURISDICCIÓN'),
      thinPinkLine(),
      bodyText('Para todo lo no previsto en el presente contrato, ambas partes se someten a lo dispuesto por la Ley Federal del Trabajo y a la jurisdicción de los Tribunales Laborales competentes de __________________.'),

      // ═══ SIGNATURES ═══
      spacer(300),
      pinkLine(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 0 },
        children: [
          new TextRun({ text: 'FIRMAS', bold: true, size: 24, color: ROSA_MEXICANO, font: 'Helvetica Neue' }),
        ],
      }),
      spacer(40),
      bodyText('Leído que fue el presente contrato por ambas partes y enteradas de su contenido y alcance legal, lo firman por duplicado en la fecha señalada al inicio del mismo, quedando un ejemplar en poder de cada parte.', { alignment: AlignmentType.CENTER }),

      // Signature table - 2 columns using DXA widths
      new Table({
        width: { size: TABLE_WIDTH_TWIPS, type: WidthType.DXA },
        columnWidths: [HALF_WIDTH, HALF_WIDTH],
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: HALF_WIDTH, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                },
                children: [
                  spacer(400),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: 'EL PATRÓN', bold: true, size: 18, color: ROSA_MEXICANO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [new TextRun({ text: 'Nombre:', size: 16, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                ],
              }),
              new TableCell({
                width: { size: HALF_WIDTH, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                },
                children: [
                  spacer(400),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: 'EL TRABAJADOR', bold: true, size: 18, color: ROSA_MEXICANO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [new TextRun({ text: 'Nombre:', size: 16, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                width: { size: HALF_WIDTH, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                },
                children: [
                  spacer(400),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: 'TESTIGO 1', bold: true, size: 18, color: ROSA_MEXICANO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [new TextRun({ text: 'Nombre:', size: 16, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                ],
              }),
              new TableCell({
                width: { size: HALF_WIDTH, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
                  left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
                },
                children: [
                  spacer(400),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '________________________________', size: 20, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40 }, children: [new TextRun({ text: 'TESTIGO 2', bold: true, size: 18, color: ROSA_MEXICANO, font: 'Helvetica Neue' })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20 }, children: [new TextRun({ text: 'Nombre:', size: 16, color: GRIS_MEDIO, font: 'Helvetica Neue' })] }),
                ],
              }),
            ],
          }),
        ],
      }),

      spacer(200),
      pinkLine(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60 },
        children: [
          new TextRun({ text: 'Este contrato se elaboró en dos ejemplares de igual tenor y valor, uno para cada parte.', italics: true, size: 16, color: GRIS_MEDIO, font: 'Helvetica Neue' }),
        ],
      }),
    ],
  }],
});

// ─── Generate .docx ───
const outputPath = path.join(__dirname, 'AXKAN-Contrato-Trabajo.docx');
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`✅ Contract generated: ${outputPath}`);
console.log(`   File size: ${(buffer.length / 1024).toFixed(1)} KB`);
