import { Suspense } from 'react'
import { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import CatalogClient from '@/components/catalog/CatalogClient'
import { sanityFetch } from '@/sanity/client'
import { categoriesQuery, productsQuery } from '@/sanity/queries'

export const metadata: Metadata = {
  title: 'Catálogo | AXKAN - Souvenirs Premium Mexicanos',
  description: 'Explora nuestra colección de souvenirs premium mexicanos. Imanes, llaveros, destapadores y portallaves con diseños auténticos de México.',
  openGraph: {
    title: 'Catálogo | AXKAN',
    description: 'Souvenirs premium que despiertan orgullo mexicano.',
  },
}

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

function CatalogLoading() {
  return (
    <div className="pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 animate-pulse">
          <div className="h-6 w-32 bg-obsidiana/10 rounded-full mx-auto mb-4" />
          <div className="h-12 w-96 bg-obsidiana/10 rounded-lg mx-auto mb-4" />
          <div className="h-6 w-80 bg-obsidiana/10 rounded-lg mx-auto" />
        </div>
        <div className="bg-white rounded-2xl p-6 mb-8 animate-pulse">
          <div className="flex gap-4">
            <div className="h-12 w-80 bg-obsidiana/10 rounded-full" />
            <div className="h-12 w-40 bg-obsidiana/10 rounded-full ml-auto" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
              <div className="h-48 bg-obsidiana/10" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-20 bg-obsidiana/10 rounded" />
                <div className="h-6 w-32 bg-obsidiana/10 rounded" />
                <div className="h-4 w-full bg-obsidiana/10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function CatalogoPage() {
  const [categories, products] = await Promise.all([
    sanityFetch<Category[]>({ query: categoriesQuery, tags: ['categories'] }),
    sanityFetch<Product[]>({ query: productsQuery, tags: ['products'] }),
  ])

  return (
    <main className="min-h-screen bg-crema">
      <Header />
      <Suspense fallback={<CatalogLoading />}>
        <CatalogClient categories={categories} products={products} />
      </Suspense>
      <Footer />
    </main>
  )
}
