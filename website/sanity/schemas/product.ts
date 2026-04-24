import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'product',
  title: 'Producto',
  type: 'document',
  icon: () => '🛍️',
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
      name: 'category',
      title: 'Categoría',
      type: 'reference',
      to: [{ type: 'category' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Descripción',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'price',
      title: 'Precio (MXN)',
      type: 'number',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'wholesalePrice',
      title: 'Precio Mayoreo (MXN)',
      type: 'number',
      validation: (Rule) => Rule.positive(),
    }),
    defineField({
      name: 'images',
      title: 'Imágenes',
      type: 'array',
      of: [
        {
          type: 'image',
          options: {
            hotspot: true,
          },
          fields: [
            {
              name: 'alt',
              title: 'Texto alternativo',
              type: 'string',
            },
          ],
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'destination',
      title: 'Destino',
      type: 'string',
      description: 'Ej: Huasteca Potosina, Oaxaca, Cancún',
    }),
    defineField({
      name: 'featured',
      title: 'Destacado',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'inStock',
      title: 'En inventario',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'tags',
      title: 'Etiquetas',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        layout: 'tags',
      },
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'destination',
      media: 'images.0',
    },
  },
})
