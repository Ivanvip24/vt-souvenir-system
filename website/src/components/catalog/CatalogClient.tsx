'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Category = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  color: string
  image: { url: string } | null
}

type Product = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  price: number
  destination: string
  featured: boolean
  category: { name: string; slug: { current: string }; color: string } | null
  images: { asset: { url: string }; alt: string }[] | null
}

type CatalogClientProps = {
  categories: Category[]
  products: Product[]
}

const colorMap: Record<string, string> = {
  magenta: 'bg-axkan-magenta',
  verde: 'bg-axkan-verde',
  naranja: 'bg-axkan-naranja',
  turquesa: 'bg-axkan-turquesa',
  rojo: 'bg-axkan-rojo',
}

const colorBorderMap: Record<string, string> = {
  magenta: 'border-axkan-magenta',
  verde: 'border-axkan-verde',
  naranja: 'border-axkan-naranja',
  turquesa: 'border-axkan-turquesa',
  rojo: 'border-axkan-rojo',
}

// Fallback products when Sanity is empty
const fallbackProducts: Product[] = [
  {
    _id: 'p1',
    name: 'Imán Oaxaca',
    slug: { current: 'iman-oaxaca' },
    description: 'Imán decorativo con diseño exclusivo de Oaxaca, corte láser premium.',
    price: 45,
    destination: 'Oaxaca',
    featured: true,
    category: { name: 'Imanes de MDF', slug: { current: 'imanes' }, color: 'magenta' },
    images: null,
  },
  {
    _id: 'p2',
    name: 'Imán Cancún',
    slug: { current: 'iman-cancun' },
    description: 'Imán con el paraíso caribeño de Cancún, acabado brillante UV.',
    price: 45,
    destination: 'Cancún',
    featured: true,
    category: { name: 'Imanes de MDF', slug: { current: 'imanes' }, color: 'magenta' },
    images: null,
  },
  {
    _id: 'p3',
    name: 'Llavero CDMX',
    slug: { current: 'llavero-cdmx' },
    description: 'Llavero con iconos de la Ciudad de México, resistente y duradero.',
    price: 55,
    destination: 'CDMX',
    featured: true,
    category: { name: 'Llaveros', slug: { current: 'llaveros' }, color: 'turquesa' },
    images: null,
  },
  {
    _id: 'p4',
    name: 'Llavero Guanajuato',
    slug: { current: 'llavero-guanajuato' },
    description: 'Llavero con las coloridas casas de Guanajuato.',
    price: 55,
    destination: 'Guanajuato',
    featured: false,
    category: { name: 'Llaveros', slug: { current: 'llaveros' }, color: 'turquesa' },
    images: null,
  },
  {
    _id: 'p5',
    name: 'Destapador Tequila',
    slug: { current: 'destapador-tequila' },
    description: 'Destapador con diseño de agave, funcional y decorativo.',
    price: 65,
    destination: 'Tequila',
    featured: true,
    category: { name: 'Destapadores', slug: { current: 'destapadores' }, color: 'verde' },
    images: null,
  },
  {
    _id: 'p6',
    name: 'Portallaves México',
    slug: { current: 'portallaves-mexico' },
    description: 'Portallaves con diseño azteca, perfecto para decorar tu hogar.',
    price: 120,
    destination: 'México',
    featured: false,
    category: { name: 'Portallaves', slug: { current: 'portallaves' }, color: 'naranja' },
    images: null,
  },
  {
    _id: 'p7',
    name: 'Imán Huasteca Potosina',
    slug: { current: 'iman-huasteca' },
    description: 'Imán con las cascadas de la Huasteca Potosina.',
    price: 45,
    destination: 'Huasteca Potosina',
    featured: true,
    category: { name: 'Imanes de MDF', slug: { current: 'imanes' }, color: 'magenta' },
    images: null,
  },
  {
    _id: 'p8',
    name: 'Llavero San Miguel de Allende',
    slug: { current: 'llavero-san-miguel' },
    description: 'Llavero con la icónica parroquia de San Miguel.',
    price: 55,
    destination: 'San Miguel de Allende',
    featured: false,
    category: { name: 'Llaveros', slug: { current: 'llaveros' }, color: 'turquesa' },
    images: null,
  },
]

// Fallback categories
const fallbackCategories: Category[] = [
  { _id: '1', name: 'Imanes de MDF', slug: { current: 'imanes' }, description: 'Imanes premium con corte láser', color: 'magenta', image: null },
  { _id: '2', name: 'Llaveros', slug: { current: 'llaveros' }, description: 'Llaveros resistentes', color: 'turquesa', image: null },
  { _id: '3', name: 'Destapadores', slug: { current: 'destapadores' }, description: 'Funcionales y decorativos', color: 'verde', image: null },
  { _id: '4', name: 'Portallaves', slug: { current: 'portallaves' }, description: 'Arte para tu hogar', color: 'naranja', image: null },
]

export default function CatalogClient({ categories, products }: CatalogClientProps) {
  const searchParams = useSearchParams()
  const initialCategory = searchParams.get('category') || 'all'

  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured')

  // Use fallback data if Sanity returns empty
  const displayCategories = categories.length > 0 ? categories : fallbackCategories
  const displayProducts = products.length > 0 ? products : fallbackProducts

  const filteredProducts = useMemo(() => {
    let filtered = displayProducts

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category?.slug.current === selectedCategory)
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.destination?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query)
      )
    }

    // Sort
    switch (sortBy) {
      case 'price-asc':
        filtered = [...filtered].sort((a, b) => a.price - b.price)
        break
      case 'price-desc':
        filtered = [...filtered].sort((a, b) => b.price - a.price)
        break
      case 'name':
        filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'featured':
      default:
        filtered = [...filtered].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0))
    }

    return filtered
  }, [displayProducts, selectedCategory, searchQuery, sortBy])

  return (
    <div className="pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-1.5 bg-axkan-turquesa/10 text-axkan-turquesa rounded-full text-sm font-semibold mb-4">
            Catálogo Completo
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-display text-obsidiana mb-4">
            Encuentra tu <span className="text-axkan-magenta">recuerdo</span> perfecto
          </h1>
          <p className="text-xl text-obsidiana/60 max-w-2xl mx-auto">
            Explora más de 500 diseños de los destinos más hermosos de México.
          </p>
        </motion.div>

        {/* Filters Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm p-4 md:p-6 mb-8"
        >
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Buscar por destino o producto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-full border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none transition-all"
                aria-label="Buscar productos"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-obsidiana/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <label htmlFor="sort-select" className="text-sm text-obsidiana/60">Ordenar:</label>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-4 py-2 rounded-full border border-obsidiana/10 focus:border-axkan-turquesa outline-none text-sm"
              >
                <option value="featured">Destacados</option>
                <option value="price-asc">Precio: Menor a Mayor</option>
                <option value="price-desc">Precio: Mayor a Menor</option>
                <option value="name">Nombre A-Z</option>
              </select>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-4 pt-4 border-t border-obsidiana/10">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Categorías de productos">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-obsidiana text-white'
                    : 'bg-obsidiana/5 text-obsidiana/70 hover:bg-obsidiana/10'
                }`}
                role="tab"
                aria-selected={selectedCategory === 'all'}
              >
                Todos
              </button>
              {displayCategories.map((cat) => (
                <button
                  key={cat._id}
                  onClick={() => setSelectedCategory(cat.slug.current)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    selectedCategory === cat.slug.current
                      ? `${colorMap[cat.color] || 'bg-axkan-magenta'} text-white`
                      : `bg-obsidiana/5 text-obsidiana/70 hover:bg-obsidiana/10`
                  }`}
                  role="tab"
                  aria-selected={selectedCategory === cat.slug.current}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Results Count */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-sm text-obsidiana/60 mb-6"
        >
          {filteredProducts.length} {filteredProducts.length === 1 ? 'producto encontrado' : 'productos encontrados'}
        </motion.p>

        {/* Products Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product, index) => (
              <motion.article
                key={product._id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300"
              >
                {/* Product Image */}
                <div className={`relative h-48 ${colorMap[product.category?.color || 'magenta']} flex items-center justify-center overflow-hidden`}>
                  {product.featured && (
                    <span className="absolute top-3 left-3 z-10 px-2 py-1 bg-axkan-rojo text-white text-xs font-bold rounded-full">
                      Destacado
                    </span>
                  )}
                  {product.images?.[0]?.asset?.url ? (
                    <Image
                      src={product.images[0].asset.url}
                      alt={product.images[0].alt || product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-white/50">
                      <span className="text-5xl">🎨</span>
                      <span className="text-xs">{product.destination}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Product Info */}
                <div className="p-5">
                  {product.category && (
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mb-2 ${colorMap[product.category.color]} text-white`}>
                      {product.category.name}
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-obsidiana font-display mb-1 group-hover:text-axkan-magenta transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-sm text-obsidiana/60 mb-3 line-clamp-2">
                    {product.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-bold text-axkan-turquesa">
                      ${product.price} <span className="text-sm font-normal text-obsidiana/40">MXN</span>
                    </span>
                    <Link
                      href={`/pedido?producto=${product.slug.current}`}
                      className="px-4 py-2 bg-gradient-to-r from-axkan-magenta to-axkan-rojo text-white text-sm font-semibold rounded-full hover:shadow-lg hover:scale-105 transition-all"
                      aria-label={`Ordenar ${product.name}`}
                    >
                      Ordenar
                    </Link>
                  </div>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-2xl font-bold text-obsidiana mb-2">No encontramos productos</h3>
            <p className="text-obsidiana/60 mb-6">
              Intenta con otra búsqueda o categoría.
            </p>
            <button
              onClick={() => {
                setSelectedCategory('all')
                setSearchQuery('')
              }}
              className="px-6 py-3 bg-axkan-turquesa text-white font-semibold rounded-full hover:shadow-lg transition-all"
            >
              Ver todos los productos
            </button>
          </motion.div>
        )}

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 bg-gradient-to-r from-axkan-magenta to-axkan-rojo rounded-2xl p-8 md:p-12 text-center text-white"
        >
          <h2 className="text-2xl md:text-3xl font-bold font-display mb-4">
            ¿No encuentras lo que buscas?
          </h2>
          <p className="text-white/80 mb-6 max-w-xl mx-auto">
            Creamos diseños personalizados para tu negocio, evento o destino favorito.
            Contáctanos y hagamos realidad tu idea.
          </p>
          <Link
            href="https://wa.me/5215538253251?text=Hola!%20Me%20interesa%20un%20diseño%20personalizado"
            target="_blank"
            className="inline-flex items-center gap-2 px-8 py-4 bg-white text-axkan-magenta font-semibold rounded-full hover:shadow-lg hover:scale-105 transition-all"
            aria-label="Contactar por WhatsApp para diseño personalizado"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Solicitar Diseño Personalizado
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
