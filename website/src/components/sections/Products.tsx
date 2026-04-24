'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'

type Category = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  color: string
  image: { url: string } | null
}

type ProductsProps = {
  categories: Category[]
}

const colorMap: Record<string, string> = {
  magenta: 'bg-axkan-magenta',
  verde: 'bg-axkan-verde',
  naranja: 'bg-axkan-naranja',
  turquesa: 'bg-axkan-turquesa',
  rojo: 'bg-axkan-rojo',
}

// Fallback data when Sanity has no categories yet
const fallbackCategories: Category[] = [
  {
    _id: '1',
    name: 'Imanes de MDF',
    slug: { current: 'imanes' },
    description: 'Captura tus destinos favoritos con nuestros imanes premium de MDF con acabado brillante.',
    color: 'magenta',
    image: null,
  },
  {
    _id: '2',
    name: 'Llaveros',
    slug: { current: 'llaveros' },
    description: 'Lleva México contigo a todos lados con nuestros llaveros de alta resistencia.',
    color: 'turquesa',
    image: null,
  },
  {
    _id: '3',
    name: 'Destapadores',
    slug: { current: 'destapadores' },
    description: 'Funcionales y decorativos, perfectos para cualquier ocasión mexicana.',
    color: 'verde',
    image: null,
  },
  {
    _id: '4',
    name: 'Portallaves',
    slug: { current: 'portallaves' },
    description: 'Decora tu hogar con arte mexicano funcional que cuenta historias.',
    color: 'naranja',
    image: null,
  },
]

const destinations = [
  'Huasteca Potosina', 'Oaxaca', 'Cancún', 'CDMX', 'Guanajuato',
  'San Miguel', 'Puerto Vallarta', 'Chiapas', 'Yucatán', 'Acapulco',
]

export default function Products({ categories }: ProductsProps) {
  // Use Sanity categories or fallback to default
  const displayCategories = categories.length > 0 ? categories : fallbackCategories

  return (
    <section id="productos" className="py-24 bg-gradient-to-b from-white to-crema relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 bg-axkan-verde/10 text-axkan-verde rounded-full text-sm font-semibold mb-4"
          >
            Nuestros Productos
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold font-display text-obsidiana mb-4"
          >
            Souvenirs que{' '}
            <span className="text-axkan-magenta">sí</span> importan
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-obsidiana/60 max-w-2xl mx-auto"
          >
            Cada pieza cuenta una historia de mil años de tradición mexicana.
          </motion.p>
        </div>

        {/* Products Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {displayCategories.map((category, index) => (
            <motion.div
              key={category._id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Link
                href={`/catalogo?category=${category.slug.current}`}
                className="group block relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
                aria-label={`Ver productos de ${category.name}`}
              >
                {/* First category gets Popular badge */}
                {index === 0 && (
                  <div className="absolute top-4 right-4 z-10 px-3 py-1 bg-axkan-rojo text-white text-xs font-bold rounded-full">
                    Más Popular
                  </div>
                )}

                {/* Category Image */}
                <div className={`h-48 ${colorMap[category.color] || 'bg-axkan-magenta'} flex items-center justify-center relative overflow-hidden`}>
                  {category.image?.url ? (
                    <Image
                      src={category.image.url}
                      alt={category.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="text-6xl opacity-30 group-hover:scale-110 transition-transform">🎨</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>

                {/* Category Info */}
                <div className="p-6">
                  <h3 className="text-xl font-bold text-obsidiana mb-2 font-display group-hover:text-axkan-magenta transition-colors">
                    {category.name}
                  </h3>
                  <p className="text-obsidiana/60 text-sm mb-4 leading-relaxed">
                    {category.description || 'Descubre nuestra colección de productos mexicanos.'}
                  </p>
                  <div className="flex items-center">
                    <span className="text-sm text-obsidiana/40 group-hover:text-axkan-turquesa transition-colors">
                      Ver productos →
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Destinations Marquee */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative overflow-hidden py-8 bg-obsidiana rounded-2xl"
        >
          <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-obsidiana to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-obsidiana to-transparent z-10" />

          <div className="flex animate-marquee whitespace-nowrap">
            {[...destinations, ...destinations].map((dest, i) => (
              <span
                key={i}
                className="mx-8 text-2xl font-bold text-white/20 hover:text-white/60 transition-colors cursor-default"
              >
                {dest}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Single Focused CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center mt-12"
        >
          <Link
            href="/catalogo"
            className="group inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-axkan-magenta to-axkan-rojo text-white font-semibold text-lg rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300"
            aria-label="Ver catálogo completo de productos"
          >
            <span>Ver Catálogo Completo</span>
            <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </motion.div>
      </div>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
      `}</style>
    </section>
  )
}
