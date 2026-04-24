'use client'

import { motion } from 'framer-motion'

const stats = [
  { value: '500+', label: 'Diseños únicos' },
  { value: '100+', label: 'Destinos de México' },
  { value: '5K+', label: 'Clientes felices' },
  { value: '5★', label: 'Calificación promedio' },
]

export default function About() {
  return (
    <section
      id="nosotros"
      className="py-24 bg-obsidiana text-white relative overflow-hidden"
      aria-labelledby="about-heading"
    >
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-axkan-magenta/10 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-axkan-turquesa/10 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-4 py-1.5 bg-axkan-magenta/20 text-axkan-magenta rounded-full text-sm font-semibold mb-6">
              Nuestra Historia
            </span>

            <h2 id="about-heading" className="text-4xl md:text-5xl font-bold font-display mb-6 leading-tight">
              El eterno{' '}
              <span className="text-axkan-turquesa">ahora</span>
              <br />de México
            </h2>

            <div className="space-y-4 text-white/70 text-lg leading-relaxed">
              <p>
                <strong className="text-white">AXKAN</strong> nace de una creencia simple:
                México merece souvenirs que estén a la altura de su grandeza cultural.
              </p>
              <p>
                El nombre viene del maya <em>"ahora"</em> — ese momento eterno donde
                el pasado se encuentra con el presente. Ese instante cuando escuchas
                mariachis y sientes algo profundo. Cuando ves una pirámide y te conectas
                con algo ancestral.
              </p>
              <p>
                Nuestros productos son <strong className="text-axkan-naranja">detonadores</strong>:
                objetos que te regresan a ese momento exacto cuando México te hizo sentir algo real.
              </p>
            </div>

            {/* Quote */}
            <blockquote className="mt-8 pl-6 border-l-4 border-axkan-magenta">
              <p className="text-xl italic text-white/90">
                "Cuando llevas un producto AXKAN, no llevas un souvenir — llevas un detonador de orgullo mexicano."
              </p>
            </blockquote>
          </motion.div>

          {/* Right: Stats + Image */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-8"
          >
            {/* Jaguar Visual Placeholder */}
            <figure className="relative h-64 bg-gradient-to-br from-axkan-naranja/20 to-axkan-magenta/20 rounded-2xl flex items-center justify-center overflow-hidden">
              <div className="text-9xl opacity-50" aria-hidden="true">🐆</div>
              <div className="absolute inset-0 bg-gradient-to-t from-obsidiana/50 to-transparent" aria-hidden="true" />
              <figcaption className="absolute bottom-4 left-4 right-4">
                <p className="text-sm text-white/60">El jaguar — símbolo de poder y transformación en la cultura mesoamericana</p>
              </figcaption>
            </figure>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-center"
                >
                  <div className="text-3xl md:text-4xl font-bold text-axkan-turquesa mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm text-white/60">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
