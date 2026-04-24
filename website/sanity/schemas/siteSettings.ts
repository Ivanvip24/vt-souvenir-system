import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'siteSettings',
  title: 'Configuración del Sitio',
  type: 'document',
  icon: () => '⚙️',
  fields: [
    defineField({
      name: 'siteName',
      title: 'Nombre del sitio',
      type: 'string',
      initialValue: 'AXKAN',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline',
      type: 'string',
      initialValue: 'Recuerdos Hechos Souvenir',
    }),
    defineField({
      name: 'description',
      title: 'Descripción SEO',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
    }),
    defineField({
      name: 'favicon',
      title: 'Favicon',
      type: 'image',
    }),
    defineField({
      name: 'contact',
      title: 'Información de contacto',
      type: 'object',
      fields: [
        { name: 'email', title: 'Email', type: 'string' },
        { name: 'phone', title: 'Teléfono', type: 'string' },
        { name: 'whatsapp', title: 'WhatsApp', type: 'string' },
        { name: 'address', title: 'Dirección', type: 'text' },
      ],
    }),
    defineField({
      name: 'social',
      title: 'Redes sociales',
      type: 'object',
      fields: [
        { name: 'instagram', title: 'Instagram', type: 'url' },
        { name: 'facebook', title: 'Facebook', type: 'url' },
        { name: 'tiktok', title: 'TikTok', type: 'url' },
        { name: 'twitter', title: 'Twitter/X', type: 'url' },
      ],
    }),
    defineField({
      name: 'announcement',
      title: 'Barra de anuncios',
      type: 'object',
      fields: [
        { name: 'enabled', title: 'Mostrar', type: 'boolean' },
        { name: 'text', title: 'Texto', type: 'string' },
        { name: 'link', title: 'Enlace', type: 'string' },
      ],
    }),
  ],
  preview: {
    prepare() {
      return {
        title: 'Configuración del Sitio',
      }
    },
  },
})
