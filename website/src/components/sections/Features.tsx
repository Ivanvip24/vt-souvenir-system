'use client'

import { motion } from 'framer-motion'
import { useInView } from 'framer-motion'
import { useRef } from 'react'

const features = [
  {
    icon: '🎨',
    title: 'Diseños Auténticos',
    description: 'Más de 500 destinos mexicanos capturados con precisión láser y colores vibrantes que celebran nuestra cultura.',
    color: 'from-axkan-magenta to-axkan-rojo',
  },
  {
    icon: '⚡',
    title: 'Corte Láser Premium',
    description: 'Tecnología de precisión que garantiza bordes perfectos y detalles increíbles en cada pieza.',
    color: 'from-axkan-turquesa to-axkan-verde',
  },
  {
    icon: '🌟',
    title: 'Acabado Brillante',
    description: 'Recubrimiento UV de alta resistencia que protege y realza los colores por años.',
    color: 'from-axkan-naranja to-axkan-magenta',
  },
  {
    icon: '🎁',
    title: 'Personalización',
    description: 'Crea diseños únicos para tu negocio, evento o destino. Sin mínimos absurdos.',
    color: 'from-axkan-verde to-axkan-turquesa',
  },
]

export default function Features() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="py-24 bg-white relative overflow-hidden" aria-labelledby="features-heading">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e72a88' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.span
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-block px-4 py-1.5 bg-axkan-turquesa/10 text-axkan-turquesa rounded-full text-sm font-semibold mb-4"
          >
            ¿Por qué AXKAN?
          </motion.span>
          <motion.h2
            id="features-heading"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold font-display text-obsidiana mb-4"
          >
            Pensados hasta el{' '}
            <span className="text-gradient-axkan">último detalle</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-obsidiana/60 max-w-2xl mx-auto"
          >
            Cada producto AXKAN es el resultado de pasión por México y obsesión por la calidad.
          </motion.p>
        </div>

        {/* Features Grid */}
        <div ref={ref} className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.5 }}
              className="group relative bg-crema rounded-2xl p-8 hover:shadow-xl transition-all duration-300"
            >
              {/* Gradient Border on Hover */}
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-[2px]`}>
                <div className="w-full h-full bg-crema rounded-2xl" />
              </div>

              <div className="relative">
                {/* Icon */}
                <div className="text-5xl mb-6" aria-hidden="true">{feature.icon}</div>

                {/* Title */}
                <h3 className="text-xl font-bold text-obsidiana mb-3 font-display">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-obsidiana/60 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
