import {defineType, defineField, defineArrayMember} from 'sanity'

export const landingPage = defineType({
  name: 'landingPage',
  title: 'Landing Page',
  type: 'document',
  groups: [
    {name: 'hero', title: 'Hero'},
    {name: 'features', title: 'Features'},
    {name: 'products', title: 'Productos'},
    {name: 'quality', title: 'Calidad'},
    {name: 'philosophy', title: 'Filosofía'},
    {name: 'wholesale', title: 'Mayoreo'},
    {name: 'cta', title: 'CTA'},
    {name: 'global', title: 'Links Globales'},
    {name: 'seo', title: 'SEO'},
  ],
  fields: [
    // ═══ SEO ═══
    defineField({
      name: 'title',
      title: 'Título del Sitio',
      type: 'string',
      description: 'Título que aparece en la pestaña del navegador',
      validation: (rule) => rule.required(),
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Descripción',
      type: 'text',
      rows: 3,
      description: 'Descripción para SEO y redes sociales',
      group: 'seo',
    }),

    // ═══ HERO ═══
    defineField({
      name: 'heroTagline',
      title: 'Tagline',
      type: 'string',
      description: 'Texto superior del hero (ej: "Recuerdos Hechos Souvenir")',
      validation: (rule) => rule.required(),
      group: 'hero',
    }),
    defineField({
      name: 'heroTitleLine1',
      title: 'Título Línea 1',
      type: 'string',
      description: 'Primera parte del título (ej: "Llévate")',
      group: 'hero',
    }),
    defineField({
      name: 'heroHighlight',
      title: 'Palabra Resaltada',
      type: 'string',
      description: 'Palabra en Rosa Mexicano (ej: "México")',
      group: 'hero',
    }),
    defineField({
      name: 'heroTitleLine2',
      title: 'Título Línea 2',
      type: 'string',
      description: 'Segunda parte del título (ej: "Contigo")',
      group: 'hero',
    }),
    defineField({
      name: 'heroDescription',
      title: 'Descripción',
      type: 'text',
      rows: 3,
      description: 'Párrafo descriptivo debajo del título',
      group: 'hero',
    }),
    defineField({
      name: 'heroCtaPrimaryText',
      title: 'Botón Principal — Texto',
      type: 'string',
      group: 'hero',
    }),
    defineField({
      name: 'heroCtaPrimaryUrl',
      title: 'Botón Principal — URL',
      type: 'url',
      group: 'hero',
    }),
    defineField({
      name: 'heroCtaSecondaryText',
      title: 'Botón Secundario — Texto',
      type: 'string',
      group: 'hero',
    }),
    defineField({
      name: 'heroCtaSecondaryUrl',
      title: 'Botón Secundario — URL',
      type: 'url',
      group: 'hero',
    }),
    defineField({
      name: 'heroImage',
      title: 'Imagen Producto',
      type: 'image',
      options: {hotspot: true},
      group: 'hero',
    }),

    // ═══ FEATURES STRIP ═══
    defineField({
      name: 'features',
      title: 'Features Strip',
      type: 'array',
      group: 'features',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'featureItem',
          title: 'Feature',
          fields: [
            defineField({name: 'icon', title: 'Emoji / Icono', type: 'string'}),
            defineField({name: 'text', title: 'Texto Principal', type: 'string'}),
            defineField({name: 'subtext', title: 'Subtexto', type: 'string'}),
          ],
          preview: {
            select: {title: 'text', subtitle: 'subtext', media: 'icon'},
          },
        }),
      ],
      validation: (rule) => rule.max(4),
    }),

    // ═══ PRODUCTS ═══
    defineField({
      name: 'productsSectionLabel',
      title: 'Etiqueta de Sección',
      type: 'string',
      description: 'Texto pequeño arriba del título (ej: "Colección")',
      group: 'products',
    }),
    defineField({
      name: 'productsSectionTitle',
      title: 'Título de Sección',
      type: 'string',
      group: 'products',
    }),
    defineField({
      name: 'products',
      title: 'Productos',
      type: 'array',
      group: 'products',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'productCard',
          title: 'Producto',
          fields: [
            defineField({name: 'title', title: 'Nombre', type: 'string', validation: (rule) => rule.required()}),
            defineField({name: 'description', title: 'Descripción', type: 'text', rows: 2}),
            defineField({name: 'price', title: 'Precio (ej: "$8-$15")', type: 'string'}),
            defineField({name: 'priceLabel', title: 'Etiqueta Precio (ej: "/ pieza mayoreo")', type: 'string'}),
            defineField({name: 'badge', title: 'Badge (ej: "Más Vendido")', type: 'string', description: 'Dejar vacío si no aplica'}),
            defineField({name: 'image', title: 'Imagen', type: 'image', options: {hotspot: true}}),
            defineField({name: 'link', title: 'URL del producto', type: 'url'}),
          ],
          preview: {
            select: {title: 'title', subtitle: 'price', media: 'image'},
          },
        }),
      ],
    }),

    // ═══ QUALITY ═══
    defineField({
      name: 'qualityLabel',
      title: 'Etiqueta',
      type: 'string',
      group: 'quality',
    }),
    defineField({
      name: 'qualityTitle',
      title: 'Título',
      type: 'string',
      group: 'quality',
    }),
    defineField({
      name: 'qualityParagraph1',
      title: 'Párrafo 1',
      type: 'text',
      rows: 3,
      group: 'quality',
    }),
    defineField({
      name: 'qualityParagraph2',
      title: 'Párrafo 2',
      type: 'text',
      rows: 3,
      group: 'quality',
    }),
    defineField({
      name: 'qualityFeatures',
      title: 'Features de Calidad',
      type: 'array',
      group: 'quality',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'qualityFeature',
          title: 'Feature',
          fields: [
            defineField({name: 'icon', title: 'Emoji / Icono', type: 'string'}),
            defineField({name: 'text', title: 'Texto', type: 'string'}),
          ],
          preview: {
            select: {title: 'text', subtitle: 'icon'},
          },
        }),
      ],
    }),
    defineField({
      name: 'qualityImage',
      title: 'Imagen',
      type: 'image',
      options: {hotspot: true},
      group: 'quality',
    }),

    // ═══ PHILOSOPHY ═══
    defineField({
      name: 'philosophyQuote',
      title: 'Cita',
      type: 'text',
      rows: 4,
      description: 'Usa *asteriscos* para resaltar palabras en Rosa Mexicano',
      group: 'philosophy',
    }),
    defineField({
      name: 'philosophyAuthor',
      title: 'Autor',
      type: 'string',
      group: 'philosophy',
    }),

    // ═══ WHOLESALE ═══
    defineField({
      name: 'wholesaleLabel',
      title: 'Etiqueta',
      type: 'string',
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleTitle',
      title: 'Título',
      type: 'string',
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleDescription',
      title: 'Descripción',
      type: 'text',
      rows: 3,
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleHighlight',
      title: 'Texto Destacado',
      type: 'string',
      description: 'Texto dentro del recuadro destacado',
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleCtaText',
      title: 'Botón Texto',
      type: 'string',
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleCtaUrl',
      title: 'Botón URL',
      type: 'url',
      validation: (rule) => rule.uri({allowRelative: true, scheme: ['http', 'https']}),
      group: 'wholesale',
    }),
    defineField({
      name: 'wholesaleStats',
      title: 'Estadísticas',
      type: 'array',
      group: 'wholesale',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'statCard',
          title: 'Estadística',
          fields: [
            defineField({name: 'number', title: 'Número', type: 'string'}),
            defineField({name: 'label', title: 'Etiqueta', type: 'string'}),
          ],
          preview: {
            select: {title: 'number', subtitle: 'label'},
          },
        }),
      ],
      validation: (rule) => rule.max(4),
    }),

    // ═══ CTA ═══
    defineField({
      name: 'ctaTitle',
      title: 'Título',
      type: 'string',
      group: 'cta',
    }),
    defineField({
      name: 'ctaSubtitle',
      title: 'Subtítulo',
      type: 'string',
      group: 'cta',
    }),
    defineField({
      name: 'ctaButtonText',
      title: 'Botón Texto',
      type: 'string',
      group: 'cta',
    }),
    defineField({
      name: 'ctaWhatsappUrl',
      title: 'WhatsApp URL',
      type: 'url',
      validation: (rule) => rule.uri({allowRelative: true, scheme: ['http', 'https']}),
      group: 'cta',
    }),

    // ═══ GLOBAL LINKS ═══
    defineField({
      name: 'catalogUrl',
      title: 'URL — Catálogo',
      type: 'url',
      group: 'global',
    }),
    defineField({
      name: 'ordersUrl',
      title: 'URL — Pedidos',
      type: 'url',
      group: 'global',
    }),
    defineField({
      name: 'whatsappNumber',
      title: 'WhatsApp — Número completo',
      type: 'string',
      description: 'Ej: 5215538253251',
      group: 'global',
    }),
    defineField({
      name: 'instagramHandle',
      title: 'Instagram — Handle',
      type: 'string',
      description: 'Ej: axkan.mx',
      group: 'global',
    }),
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      group: 'global',
    }),
    defineField({
      name: 'footerDescription',
      title: 'Footer — Descripción',
      type: 'text',
      rows: 2,
      group: 'global',
    }),
  ],
  preview: {
    select: {title: 'title'},
  },
})
