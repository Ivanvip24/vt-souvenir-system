import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'testimonial',
  title: 'Testimonio',
  type: 'document',
  icon: () => '💬',
  fields: [
    defineField({
      name: 'name',
      title: 'Nombre',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Rol / Ubicación',
      type: 'string',
      description: 'Ej: Cliente de Cancún, Tienda en CDMX',
    }),
    defineField({
      name: 'quote',
      title: 'Testimonio',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'avatar',
      title: 'Foto',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'rating',
      title: 'Calificación',
      type: 'number',
      options: {
        list: [1, 2, 3, 4, 5],
      },
      initialValue: 5,
    }),
    defineField({
      name: 'featured',
      title: 'Destacado',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'quote',
      media: 'avatar',
    },
  },
})
