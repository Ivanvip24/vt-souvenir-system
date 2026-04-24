import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'category',
  title: 'Categoría',
  type: 'document',
  icon: () => '📁',
  fields: [
    defineField({
      name: 'name',
      title: 'Nombre',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: {
        source: 'name',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Descripción',
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
      name: 'color',
      title: 'Color de acento',
      type: 'string',
      options: {
        list: [
          { title: 'Magenta', value: 'magenta' },
          { title: 'Verde', value: 'verde' },
          { title: 'Naranja', value: 'naranja' },
          { title: 'Turquesa', value: 'turquesa' },
          { title: 'Rojo', value: 'rojo' },
        ],
      },
    }),
    defineField({
      name: 'order',
      title: 'Orden',
      type: 'number',
      description: 'Orden de aparición en el menú',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      media: 'image',
    },
  },
})
