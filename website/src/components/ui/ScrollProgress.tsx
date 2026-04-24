'use client'

import { useState, useEffect } from 'react'
import { motion, useScroll, useSpring } from 'framer-motion'

const sections = [
  { id: 'hero', label: 'Inicio' },
  { id: 'productos', label: 'Productos' },
  { id: 'nosotros', label: 'Nosotros' },
  { id: 'contacto', label: 'Contacto' },
]

export default function ScrollProgress() {
  const [activeSection, setActiveSection] = useState('hero')
  const [isVisible, setIsVisible] = useState(false)
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 })

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      const windowHeight = window.innerHeight

      // Show progress bar after scrolling past hero
      setIsVisible(scrollY > windowHeight * 0.5)

      // Determine active section
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        const element = section.id === 'hero'
          ? document.querySelector('section')
          : document.getElementById(section.id)

        if (element) {
          const rect = element.getBoundingClientRect()
          if (rect.top <= windowHeight * 0.4) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    if (id === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      const element = document.getElementById(id)
      element?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      {/* Top Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-axkan-magenta/20 z-50 origin-left"
        initial={{ opacity: 0 }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="h-full bg-gradient-to-r from-axkan-magenta via-axkan-rojo to-axkan-naranja"
          style={{ scaleX, transformOrigin: '0%' }}
        />
      </motion.div>

      {/* Section Dots Navigation */}
      <motion.nav
        className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-3"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: isVisible ? 1 : 0, x: isVisible ? 0 : 20 }}
        transition={{ duration: 0.3 }}
        aria-label="Navegación por secciones"
      >
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollToSection(section.id)}
            className="group flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-axkan-turquesa focus:ring-offset-2 rounded-full"
            aria-label={`Ir a ${section.label}`}
            aria-current={activeSection === section.id ? 'true' : undefined}
          >
            {/* Label (appears on hover) */}
            <span className="opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all text-sm font-medium text-obsidiana/70 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
              {section.label}
            </span>

            {/* Dot */}
            <span
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                activeSection === section.id
                  ? 'bg-axkan-magenta scale-125'
                  : 'bg-obsidiana/20 group-hover:bg-axkan-turquesa group-hover:scale-110'
              }`}
            />
          </button>
        ))}
      </motion.nav>

      {/* Scroll to Top Button */}
      <motion.button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 w-12 h-12 bg-white shadow-lg rounded-full flex items-center justify-center text-obsidiana/60 hover:text-axkan-magenta hover:shadow-xl transition-all z-40"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: isVisible ? 1 : 0,
          scale: isVisible ? 1 : 0.8,
          y: isVisible ? 0 : 20
        }}
        transition={{ duration: 0.3 }}
        aria-label="Volver al inicio"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      </motion.button>
    </>
  )
}
