'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Inicio', href: '/' },
  { name: 'Productos', href: '/#productos' },
  { name: 'Catálogo', href: '/catalogo' },
  { name: 'Nosotros', href: '/#nosotros' },
  { name: 'Contacto', href: '/#contacto' },
]

export default function Header() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)

      // Track active section for hash links
      if (pathname === '/') {
        const sections = ['contacto', 'nosotros', 'productos']
        for (const section of sections) {
          const element = document.getElementById(section)
          if (element) {
            const rect = element.getBoundingClientRect()
            if (rect.top <= 150 && rect.bottom >= 150) {
              setActiveSection(`/#${section}`)
              return
            }
          }
        }
        if (window.scrollY < 100) {
          setActiveSection('/')
        }
      }
    }
    window.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check
    return () => window.removeEventListener('scroll', handleScroll)
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' && activeSection === '/'
    if (href.startsWith('/#')) return activeSection === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-md shadow-lg'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            {/* Jaguar Icon Placeholder */}
            <div className="w-12 h-12 bg-gradient-to-br from-axkan-naranja to-axkan-magenta rounded-full flex items-center justify-center">
              <span className="text-white text-xl font-bold">A</span>
            </div>
            {/* AXKAN Colorful Text */}
            <span className="text-2xl font-bold tracking-tight font-display">
              <span className="text-axkan-magenta">A</span>
              <span className="text-axkan-verde">X</span>
              <span className="text-axkan-naranja">K</span>
              <span className="text-axkan-turquesa">A</span>
              <span className="text-axkan-rojo">N</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8" role="navigation" aria-label="Navegación principal">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`relative font-medium transition-colors ${
                  isActive(item.href)
                    ? 'text-axkan-magenta'
                    : 'text-obsidiana/80 hover:text-axkan-magenta'
                }`}
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                {item.name}
                {isActive(item.href) && (
                  <motion.span
                    layoutId="activeNav"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-axkan-magenta rounded-full"
                  />
                )}
              </Link>
            ))}
            <Link
              href="/pedido"
              className="px-6 py-2.5 bg-gradient-to-r from-axkan-magenta to-axkan-rojo text-white font-semibold rounded-full hover:shadow-lg hover:scale-105 transition-all"
              aria-label="Hacer pedido de productos AXKAN"
            >
              Hacer Pedido
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-6 h-5 flex flex-col justify-between">
              <span
                className={`w-full h-0.5 bg-obsidiana transition-all ${
                  isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''
                }`}
              />
              <span
                className={`w-full h-0.5 bg-obsidiana transition-all ${
                  isMobileMenuOpen ? 'opacity-0' : ''
                }`}
              />
              <span
                className={`w-full h-0.5 bg-obsidiana transition-all ${
                  isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
                }`}
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.nav
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t"
            role="navigation"
            aria-label="Navegación móvil"
          >
            <div className="px-4 py-6 space-y-4">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`block text-lg transition-colors ${
                    isActive(item.href)
                      ? 'text-axkan-magenta font-semibold'
                      : 'text-obsidiana/80 hover:text-axkan-magenta'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                >
                  {item.name}
                </Link>
              ))}
              <Link
                href="/pedido"
                className="block w-full text-center px-6 py-3 bg-gradient-to-r from-axkan-magenta to-axkan-rojo text-white font-semibold rounded-full"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Hacer pedido de productos AXKAN"
              >
                Hacer Pedido
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}
