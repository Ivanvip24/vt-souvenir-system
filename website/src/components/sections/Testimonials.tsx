'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

type Testimonial = {
  _id: string
  name: string
  role: string
  quote: string
  rating: number
  avatar: { url: string } | null
}

type TestimonialsProps = {
  testimonials: Testimonial[]
}

// Fallback testimonials when Sanity is empty
const fallbackTestimonials: Testimonial[] = [
  {
    _id: '1',
    name: 'María González',
    role: 'Turista de España',
    quote: 'Compré imanes para toda mi familia y fueron el mejor recuerdo que me traje de México. La calidad es impresionante.',
    rating: 5,
    avatar: null,
  },
  {
    _id: '2',
    name: 'Carlos Mendoza',
    role: 'Dueño de tienda de souvenirs',
    quote: 'Como mayorista, la consistencia y calidad de AXKAN me ha ayudado a diferenciarnos de la competencia. Mis clientes vuelven por más.',
    rating: 5,
    avatar: null,
  },
  {
    _id: '3',
    name: 'Ana López',
    role: 'Organizadora de eventos',
    quote: 'Pedí souvenirs personalizados para una boda en Oaxaca y el resultado superó todas las expectativas. ¡Absolutamente recomendados!',
    rating: 5,
    avatar: null,
  },
]

export default function Testimonials({ testimonials }: TestimonialsProps) {
  const displayTestimonials = testimonials.length > 0 ? testimonials : fallbackTestimonials

  return (
    <section
      className="py-24 bg-gradient-to-b from-crema to-white relative overflow-hidden"
      aria-labelledby="testimonials-heading"
    >
      {/* Background Decorations */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-axkan-turquesa/10 rounded-full blur-3xl" aria-hidden="true" />
      <div className="absolute bottom-10 right-10 w-64 h-64 bg-axkan-magenta/10 rounded-full blur-3xl" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 bg-axkan-naranja/10 text-axkan-naranja rounded-full text-sm font-semibold mb-4"
          >
            Testimonios
          </motion.span>
          <motion.h2
            id="testimonials-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold font-display text-obsidiana mb-4"
          >
            Lo que dicen nuestros{' '}
            <span className="text-axkan-turquesa">clientes</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-obsidiana/60 max-w-2xl mx-auto"
          >
            Más de 5,000 clientes felices que llevan un pedacito de México consigo.
          </motion.p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {displayTestimonials.slice(0, 3).map((testimonial, index) => (
            <motion.article
              key={testimonial._id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-shadow duration-300"
            >
              {/* Rating Stars */}
              <div className="flex gap-1 mb-4" aria-label={`Calificación: ${testimonial.rating} de 5 estrellas`}>
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    className={`w-5 h-5 ${i < testimonial.rating ? 'text-axkan-naranja' : 'text-obsidiana/20'}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {/* Quote */}
              <blockquote className="mb-6">
                <p className="text-obsidiana/80 leading-relaxed italic">
                  "{testimonial.quote}"
                </p>
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-4">
                {testimonial.avatar?.url ? (
                  <Image
                    src={testimonial.avatar.url}
                    alt={`Foto de ${testimonial.name}`}
                    width={48}
                    height={48}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-axkan-magenta to-axkan-turquesa flex items-center justify-center text-white font-bold text-lg">
                    {testimonial.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-obsidiana">{testimonial.name}</p>
                  <p className="text-sm text-obsidiana/60">{testimonial.role}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>

        {/* Trust Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-16 flex flex-wrap justify-center gap-8 md:gap-16"
        >
          <div className="text-center">
            <p className="text-4xl font-bold text-axkan-magenta font-display">5K+</p>
            <p className="text-sm text-obsidiana/60 mt-1">Clientes felices</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-axkan-turquesa font-display">4.9★</p>
            <p className="text-sm text-obsidiana/60 mt-1">Calificación promedio</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-bold text-axkan-verde font-display">100%</p>
            <p className="text-sm text-obsidiana/60 mt-1">Satisfacción garantizada</p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
