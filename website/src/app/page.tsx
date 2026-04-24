import Header from '@/components/layout/Header'
import Hero from '@/components/sections/Hero'
import Features from '@/components/sections/Features'
import Products from '@/components/sections/Products'
import Testimonials from '@/components/sections/Testimonials'
import About from '@/components/sections/About'
import Footer from '@/components/layout/Footer'
import ScrollProgress from '@/components/ui/ScrollProgress'
import { sanityFetch } from '@/sanity/client'
import { categoriesQuery, testimonialsQuery } from '@/sanity/queries'

type Category = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  color: string
  image: { url: string } | null
}

type Testimonial = {
  _id: string
  name: string
  role: string
  quote: string
  rating: number
  avatar: { url: string } | null
}

export default async function Home() {
  const [categories, testimonials] = await Promise.all([
    sanityFetch<Category[]>({ query: categoriesQuery, tags: ['categories'] }),
    sanityFetch<Testimonial[]>({ query: testimonialsQuery, tags: ['testimonials'] }),
  ])

  return (
    <main className="relative overflow-hidden">
      <ScrollProgress />
      <Header />
      <Hero />
      <Features />
      <Products categories={categories} />
      <Testimonials testimonials={testimonials} />
      <About />
      <Footer />
    </main>
  )
}
