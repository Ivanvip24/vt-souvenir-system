import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'aboutSection',
  title: 'Sección Nosotros',
  type: 'document',
  icon: () => '📖',
  fields: [
    defineField({
      name: 'badge',
      title: 'Badge',
      type: 'string',
      initialValue: 'Nuestra Historia',
    }),
    defineField({
      name: 'headline',
      title: 'Título',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'content',
      title: 'Contenido',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'quote',
      title: 'Cita destacada',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'image',
      title: 'Imagen',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'stats',
      title: 'Estadísticas',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            { name: 'value', title: 'Valor', type: 'string' },
            { name: 'label', title: 'Etiqueta', type: 'string' },
          ],
        },
      ],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Sección Nosotros',
      }
    },
  },
})
