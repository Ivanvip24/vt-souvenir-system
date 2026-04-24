'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
}

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.15,
    },
  },
}

export default function Hero() {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20"
      aria-labelledby="hero-heading"
    >
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-crema via-white to-axkan-turquesa/10" />

      {/* Decorative Elements */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-axkan-magenta/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-axkan-turquesa/20 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-axkan-verde/10 rounded-full blur-3xl" />

      {/* Floating Decorative Shapes */}
      <motion.div
        animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-32 right-20 w-20 h-20 bg-axkan-naranja/30 rounded-2xl hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute bottom-40 left-20 w-16 h-16 bg-axkan-verde/30 rounded-full hidden lg:block"
      />
      <motion.div
        animate={{ y: [0, -15, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute top-1/3 left-32 w-12 h-12 bg-axkan-magenta/30 rounded-lg hidden lg:block"
      />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="space-y-8"
        >
          {/* Badge */}
          <motion.div variants={fadeInUp} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full text-sm font-medium text-obsidiana/80 shadow-sm border border-axkan-turquesa/20">
              <span className="w-2 h-2 bg-axkan-verde rounded-full animate-pulse" />
              Detonadores de Orgullo Mexicano
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            id="hero-heading"
            variants={fadeInUp}
            transition={{ duration: 0.6 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold font-display leading-tight"
          >
            <span className="block text-obsidiana">Recuerdos que</span>
            <span className="block">
              <span className="text-axkan-magenta">sí</span>{' '}
              <span className="text-gradient-axkan">importan</span>
            </span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            transition={{ duration: 0.6 }}
            className="max-w-2xl mx-auto text-xl sm:text-2xl text-obsidiana/70 leading-relaxed"
          >
            Souvenirs premium que capturan la esencia de México.
            <span className="block mt-2 font-medium text-obsidiana">
              Llévate el momento que te hizo sentir.
            </span>
          </motion.p>

          {/* Single Focused CTA */}
          <motion.div
            variants={fadeInUp}
            transition={{ duration: 0.6 }}
            className="pt-4"
          >
            <Link
              href="/catalogo"
              className="group relative inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-axkan-magenta via-axkan-rojo to-axkan-naranja text-white font-semibold text-lg rounded-full shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden"
              aria-label="Explorar catálogo de productos AXKAN"
            >
              <span className="relative z-10">Explorar Catálogo</span>
              <svg className="relative z-10 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-r from-axkan-naranja via-axkan-rojo to-axkan-magenta opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </Link>
            <p className="mt-4 text-sm text-obsidiana/50">
              Más de 500 diseños disponibles · Envío a todo México
            </p>
          </motion.div>

          {/* Trust Indicators */}
          <motion.ul
            variants={fadeInUp}
            transition={{ duration: 0.6 }}
            className="pt-12 flex flex-wrap items-center justify-center gap-8 text-obsidiana/60"
            aria-label="Beneficios de AXKAN"
          >
            <li className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🇲🇽</span>
              <span className="text-sm font-medium">Hecho en México</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">✨</span>
              <span className="text-sm font-medium">Calidad Premium</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">🚚</span>
              <span className="text-sm font-medium">Envío Nacional</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden="true">💎</span>
              <span className="text-sm font-medium">+500 Diseños</span>
            </li>
          </motion.ul>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-2 text-obsidiana/40"
        >
          <span className="text-xs uppercase tracking-widest">Descubre</span>
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  )
}
