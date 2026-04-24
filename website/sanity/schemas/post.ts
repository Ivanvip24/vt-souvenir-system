import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'post',
  title: 'Blog Post',
  type: 'document',
  icon: () => '📝',
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Extracto',
      type: 'text',
      rows: 3,
      description: 'Breve descripción para SEO y previews',
    }),
    defineField({
      name: 'coverImage',
      title: 'Imagen de portada',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'content',
      title: 'Contenido',
      type: 'array',
      of: [
        { type: 'block' },
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            {
              name: 'caption',
              title: 'Pie de imagen',
              type: 'string',
            },
            {
              name: 'alt',
              title: 'Texto alternativo',
              type: 'string',
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Fecha de publicación',
      type: 'datetime',
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
    defineField({
      name: 'featured',
      title: 'Destacado',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'coverImage',
      date: 'publishedAt',
    },
    prepare({ title, media, date }) {
      return {
        title,
        subtitle: date ? new Date(date).toLocaleDateString('es-MX') : 'Sin fecha',
        media,
      }
    },
  },
})
