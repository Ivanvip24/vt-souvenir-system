import { Suspense } from 'react'
import { Metadata } from 'next'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import OrderForm from '@/components/order/OrderForm'
import { sanityFetch } from '@/sanity/client'
import { categoriesQuery } from '@/sanity/queries'

export const metadata: Metadata = {
  title: 'Hacer Pedido | AXKAN - Souvenirs Premium Mexicanos',
  description: 'Ordena tus souvenirs AXKAN. Envío a todo México. Diseños personalizados disponibles.',
  openGraph: {
    title: 'Hacer Pedido | AXKAN',
    description: 'Ordena souvenirs premium mexicanos.',
  },
}

type Category = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  color: string
}

function OrderFormLoading() {
  return (
    <div className="pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 animate-pulse">
          <div className="h-6 w-32 bg-obsidiana/10 rounded-full mx-auto mb-4" />
          <div className="h-10 w-80 bg-obsidiana/10 rounded-lg mx-auto mb-4" />
          <div className="h-6 w-64 bg-obsidiana/10 rounded-lg mx-auto" />
        </div>
        <div className="bg-white rounded-2xl p-8 animate-pulse">
          <div className="h-6 w-48 bg-obsidiana/10 rounded-lg mb-6" />
          <div className="space-y-4">
            <div className="h-12 bg-obsidiana/10 rounded-xl" />
            <div className="h-12 bg-obsidiana/10 rounded-xl" />
            <div className="h-12 bg-obsidiana/10 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function PedidoPage() {
  const categories = await sanityFetch<Category[]>({
    query: categoriesQuery,
    tags: ['categories'],
  })

  return (
    <main className="min-h-screen bg-crema">
      <Header />
      <Suspense fallback={<OrderFormLoading />}>
        <OrderForm categories={categories} />
      </Suspense>
      <Footer />
    </main>
  )
}
