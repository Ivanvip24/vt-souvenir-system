import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'heroSection',
  title: 'Hero Section',
  type: 'document',
  icon: () => '🎯',
  fields: [
    defineField({
      name: 'badge',
      title: 'Badge (etiqueta superior)',
      type: 'string',
      initialValue: 'Detonadores de Orgullo Mexicano',
    }),
    defineField({
      name: 'headline',
      title: 'Título principal',
      type: 'string',
      validation: (Rule) => Rule.required(),
      initialValue: 'Recuerdos que sí importan',
    }),
    defineField({
      name: 'subheadline',
      title: 'Subtítulo',
      type: 'text',
      rows: 2,
      initialValue: 'Souvenirs premium que capturan la esencia de México.',
    }),
    defineField({
      name: 'ctaPrimary',
      title: 'Botón principal',
      type: 'object',
      fields: [
        { name: 'text', title: 'Texto', type: 'string' },
        { name: 'link', title: 'Enlace', type: 'string' },
      ],
    }),
    defineField({
      name: 'ctaSecondary',
      title: 'Botón secundario',
      type: 'object',
      fields: [
        { name: 'text', title: 'Texto', type: 'string' },
        { name: 'link', title: 'Enlace', type: 'string' },
      ],
    }),
    defineField({
      name: 'backgroundImage',
      title: 'Imagen de fondo',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'trustIndicators',
      title: 'Indicadores de confianza',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'emoji', title: 'Emoji', type: 'string' },
            { name: 'text', title: 'Texto', type: 'string' },
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'headline',
    },
    prepare({ title }) {
      return {
        title: 'Hero Section',
        subtitle: title,
      }
    },
  },
})
