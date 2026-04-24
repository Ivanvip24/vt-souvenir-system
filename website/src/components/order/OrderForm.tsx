'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type Category = {
  _id: string
  name: string
  slug: { current: string }
  description: string
  color: string
}

type OrderFormProps = {
  categories: Category[]
}

type OrderItem = {
  category: string
  quantity: number
  design: string
  notes: string
}

const colorMap: Record<string, string> = {
  magenta: 'bg-axkan-magenta',
  verde: 'bg-axkan-verde',
  naranja: 'bg-axkan-naranja',
  turquesa: 'bg-axkan-turquesa',
  rojo: 'bg-axkan-rojo',
}

// Fallback categories
const fallbackCategories: Category[] = [
  { _id: '1', name: 'Imanes de MDF', slug: { current: 'imanes' }, description: 'Imanes premium con corte láser', color: 'magenta' },
  { _id: '2', name: 'Llaveros', slug: { current: 'llaveros' }, description: 'Llaveros resistentes', color: 'turquesa' },
  { _id: '3', name: 'Destapadores', slug: { current: 'destapadores' }, description: 'Funcionales y decorativos', color: 'verde' },
  { _id: '4', name: 'Portallaves', slug: { current: 'portallaves' }, description: 'Arte para tu hogar', color: 'naranja' },
]

const priceGuide: Record<string, { unit: number; wholesale: number }> = {
  imanes: { unit: 45, wholesale: 35 },
  llaveros: { unit: 55, wholesale: 45 },
  destapadores: { unit: 65, wholesale: 50 },
  portallaves: { unit: 120, wholesale: 95 },
}

const steps = [
  { id: 1, name: 'Productos', icon: '🛍️' },
  { id: 2, name: 'Datos', icon: '📝' },
  { id: 3, name: 'Confirmar', icon: '✅' },
]

export default function OrderForm({ categories }: OrderFormProps) {
  const searchParams = useSearchParams()
  const preselectedProduct = searchParams.get('producto')

  const [currentStep, setCurrentStep] = useState(1)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([
    { category: '', quantity: 1, design: preselectedProduct || '', notes: '' },
  ])
  const [contactInfo, setContactInfo] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    notes: '',
  })
  const [orderType, setOrderType] = useState<'retail' | 'wholesale'>('retail')

  const displayCategories = categories.length > 0 ? categories : fallbackCategories

  const addItem = () => {
    setOrderItems([...orderItems, { category: '', quantity: 1, design: '', notes: '' }])
  }

  const removeItem = (index: number) => {
    if (orderItems.length > 1) {
      setOrderItems(orderItems.filter((_, i) => i !== index))
    }
  }

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const updated = [...orderItems]
    updated[index] = { ...updated[index], [field]: value }
    setOrderItems(updated)
  }

  const totalEstimate = useMemo(() => {
    return orderItems.reduce((total, item) => {
      const prices = priceGuide[item.category] || { unit: 50, wholesale: 40 }
      const price = orderType === 'wholesale' ? prices.wholesale : prices.unit
      return total + (price * item.quantity)
    }, 0)
  }, [orderItems, orderType])

  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0)

  const generateWhatsAppMessage = () => {
    let message = `¡Hola! Me interesa hacer un pedido AXKAN.\n\n`
    message += `*Tipo de pedido:* ${orderType === 'wholesale' ? 'Mayoreo' : 'Menudeo'}\n\n`
    message += `*Productos solicitados:*\n`

    orderItems.forEach((item, i) => {
      const catName = displayCategories.find(c => c.slug.current === item.category)?.name || item.category
      message += `${i + 1}. ${catName}\n`
      message += `   - Cantidad: ${item.quantity}\n`
      if (item.design) message += `   - Diseño/Destino: ${item.design}\n`
      if (item.notes) message += `   - Notas: ${item.notes}\n`
    })

    message += `\n*Estimado total:* $${totalEstimate.toLocaleString()} MXN\n\n`
    message += `*Datos de contacto:*\n`
    message += `- Nombre: ${contactInfo.name}\n`
    message += `- Teléfono: ${contactInfo.phone}\n`
    message += `- Email: ${contactInfo.email}\n`
    message += `- Ubicación: ${contactInfo.city}, ${contactInfo.state}\n`
    if (contactInfo.notes) message += `- Notas adicionales: ${contactInfo.notes}\n`

    return encodeURIComponent(message)
  }

  const canProceed = () => {
    if (currentStep === 1) {
      return orderItems.every(item => item.category && item.quantity > 0)
    }
    if (currentStep === 2) {
      return contactInfo.name && contactInfo.phone && contactInfo.city && contactInfo.state
    }
    return true
  }

  return (
    <div className="pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <span className="inline-block px-4 py-1.5 bg-axkan-magenta/10 text-axkan-magenta rounded-full text-sm font-semibold mb-4">
            Hacer Pedido
          </span>
          <h1 className="text-3xl md:text-4xl font-bold font-display text-obsidiana mb-4">
            Tu pedido de <span className="text-axkan-magenta">orgullo mexicano</span>
          </h1>
          <p className="text-lg text-obsidiana/60">
            Completa el formulario y te contactaremos para confirmar tu pedido.
          </p>
        </motion.div>

        {/* Progress Steps */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center justify-center gap-4">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => step.id < currentStep && setCurrentStep(step.id)}
                  disabled={step.id > currentStep}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                    currentStep === step.id
                      ? 'bg-axkan-magenta text-white'
                      : currentStep > step.id
                      ? 'bg-axkan-verde text-white cursor-pointer'
                      : 'bg-obsidiana/10 text-obsidiana/40'
                  }`}
                  aria-current={currentStep === step.id ? 'step' : undefined}
                >
                  <span>{step.icon}</span>
                  <span className="hidden sm:inline text-sm font-medium">{step.name}</span>
                </button>
                {index < steps.length - 1 && (
                  <div className={`w-8 h-0.5 mx-2 ${currentStep > step.id ? 'bg-axkan-verde' : 'bg-obsidiana/10'}`} />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Form Content */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-white rounded-2xl shadow-sm p-6 md:p-8"
        >
          {/* Step 1: Products */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-obsidiana mb-6 font-display">
                ¿Qué productos te interesan?
              </h2>

              {/* Order Type Toggle */}
              <div className="mb-6 p-4 bg-crema rounded-xl">
                <p className="text-sm text-obsidiana/70 mb-3">Tipo de pedido:</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOrderType('retail')}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                      orderType === 'retail'
                        ? 'bg-axkan-turquesa text-white'
                        : 'bg-white text-obsidiana/70 hover:bg-obsidiana/5'
                    }`}
                  >
                    🛍️ Menudeo
                    <span className="block text-xs mt-1 opacity-70">1-49 piezas</span>
                  </button>
                  <button
                    onClick={() => setOrderType('wholesale')}
                    className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                      orderType === 'wholesale'
                        ? 'bg-axkan-verde text-white'
                        : 'bg-white text-obsidiana/70 hover:bg-obsidiana/5'
                    }`}
                  >
                    📦 Mayoreo
                    <span className="block text-xs mt-1 opacity-70">50+ piezas (mejor precio)</span>
                  </button>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-4">
                {orderItems.map((item, index) => (
                  <div key={index} className="p-4 bg-crema/50 rounded-xl border border-obsidiana/5">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-obsidiana/60">Producto {index + 1}</span>
                      {orderItems.length > 1 && (
                        <button
                          onClick={() => removeItem(index)}
                          className="text-axkan-rojo text-sm hover:underline"
                          aria-label={`Eliminar producto ${index + 1}`}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor={`category-${index}`} className="block text-sm font-medium text-obsidiana mb-2">
                          Categoría *
                        </label>
                        <select
                          id={`category-${index}`}
                          value={item.category}
                          onChange={(e) => updateItem(index, 'category', e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                          required
                        >
                          <option value="">Selecciona categoría</option>
                          {displayCategories.map((cat) => (
                            <option key={cat._id} value={cat.slug.current}>
                              {cat.name} - ${orderType === 'wholesale' ? priceGuide[cat.slug.current]?.wholesale : priceGuide[cat.slug.current]?.unit} c/u
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label htmlFor={`quantity-${index}`} className="block text-sm font-medium text-obsidiana mb-2">
                          Cantidad *
                        </label>
                        <input
                          type="number"
                          id={`quantity-${index}`}
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor={`design-${index}`} className="block text-sm font-medium text-obsidiana mb-2">
                          Diseño / Destino deseado
                        </label>
                        <input
                          type="text"
                          id={`design-${index}`}
                          value={item.design}
                          onChange={(e) => updateItem(index, 'design', e.target.value)}
                          placeholder="Ej: Oaxaca, Cancún, Diseño personalizado..."
                          className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor={`notes-${index}`} className="block text-sm font-medium text-obsidiana mb-2">
                          Notas adicionales
                        </label>
                        <textarea
                          id={`notes-${index}`}
                          value={item.notes}
                          onChange={(e) => updateItem(index, 'notes', e.target.value)}
                          placeholder="Especificaciones, colores, etc..."
                          rows={2}
                          className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addItem}
                className="mt-4 w-full py-3 border-2 border-dashed border-obsidiana/20 rounded-xl text-obsidiana/60 hover:border-axkan-turquesa hover:text-axkan-turquesa transition-all"
              >
                + Agregar otro producto
              </button>
            </div>
          )}

          {/* Step 2: Contact Info */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-obsidiana mb-6 font-display">
                Datos de contacto
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="name" className="block text-sm font-medium text-obsidiana mb-2">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={contactInfo.name}
                    onChange={(e) => setContactInfo({ ...contactInfo, name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-obsidiana mb-2">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={contactInfo.phone}
                    onChange={(e) => setContactInfo({ ...contactInfo, phone: e.target.value })}
                    placeholder="55 1234 5678"
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-obsidiana mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={contactInfo.email}
                    onChange={(e) => setContactInfo({ ...contactInfo, email: e.target.value })}
                    placeholder="tu@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-obsidiana mb-2">
                    Ciudad *
                  </label>
                  <input
                    type="text"
                    id="city"
                    value={contactInfo.city}
                    onChange={(e) => setContactInfo({ ...contactInfo, city: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-obsidiana mb-2">
                    Estado *
                  </label>
                  <input
                    type="text"
                    id="state"
                    value={contactInfo.state}
                    onChange={(e) => setContactInfo({ ...contactInfo, state: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="generalNotes" className="block text-sm font-medium text-obsidiana mb-2">
                    Notas generales del pedido
                  </label>
                  <textarea
                    id="generalNotes"
                    value={contactInfo.notes}
                    onChange={(e) => setContactInfo({ ...contactInfo, notes: e.target.value })}
                    placeholder="¿Algo más que debamos saber?"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-obsidiana/10 focus:border-axkan-turquesa focus:ring-2 focus:ring-axkan-turquesa/20 outline-none resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-obsidiana mb-6 font-display">
                Confirma tu pedido
              </h2>

              {/* Order Summary */}
              <div className="mb-6 p-4 bg-crema rounded-xl">
                <h3 className="font-semibold text-obsidiana mb-3">Resumen del pedido</h3>
                <div className="space-y-2">
                  {orderItems.map((item, index) => {
                    const cat = displayCategories.find(c => c.slug.current === item.category)
                    const prices = priceGuide[item.category] || { unit: 50, wholesale: 40 }
                    const price = orderType === 'wholesale' ? prices.wholesale : prices.unit
                    return (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-obsidiana/70">
                          {cat?.name || item.category} x{item.quantity}
                          {item.design && <span className="text-xs text-obsidiana/50"> ({item.design})</span>}
                        </span>
                        <span className="font-medium text-obsidiana">${(price * item.quantity).toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-obsidiana/10 flex justify-between">
                  <span className="font-semibold text-obsidiana">Total estimado:</span>
                  <span className="text-xl font-bold text-axkan-turquesa">${totalEstimate.toLocaleString()} MXN</span>
                </div>
                <p className="text-xs text-obsidiana/50 mt-2">
                  * El precio final puede variar según diseño y disponibilidad
                </p>
              </div>

              {/* Contact Summary */}
              <div className="mb-6 p-4 bg-crema rounded-xl">
                <h3 className="font-semibold text-obsidiana mb-3">Datos de contacto</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-obsidiana/60">Nombre:</span>
                  <span className="text-obsidiana">{contactInfo.name}</span>
                  <span className="text-obsidiana/60">Teléfono:</span>
                  <span className="text-obsidiana">{contactInfo.phone}</span>
                  {contactInfo.email && (
                    <>
                      <span className="text-obsidiana/60">Email:</span>
                      <span className="text-obsidiana">{contactInfo.email}</span>
                    </>
                  )}
                  <span className="text-obsidiana/60">Ubicación:</span>
                  <span className="text-obsidiana">{contactInfo.city}, {contactInfo.state}</span>
                </div>
              </div>

              {/* WhatsApp CTA */}
              <Link
                href={`https://wa.me/5215538253251?text=${generateWhatsAppMessage()}`}
                target="_blank"
                className="flex items-center justify-center gap-3 w-full py-4 bg-[#25D366] text-white font-semibold text-lg rounded-xl hover:bg-[#20BD5A] hover:shadow-lg transition-all"
                aria-label="Enviar pedido por WhatsApp"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Enviar Pedido por WhatsApp
              </Link>

              <p className="text-center text-sm text-obsidiana/50 mt-4">
                Te responderemos en menos de 24 horas para confirmar disponibilidad y envío.
              </p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-obsidiana/10">
            {currentStep > 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="px-6 py-3 text-obsidiana/70 font-medium hover:text-obsidiana transition-colors"
              >
                ← Anterior
              </button>
            ) : (
              <Link
                href="/catalogo"
                className="px-6 py-3 text-obsidiana/70 font-medium hover:text-obsidiana transition-colors"
              >
                ← Ver Catálogo
              </Link>
            )}

            {currentStep < 3 && (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!canProceed()}
                className={`px-8 py-3 rounded-full font-semibold transition-all ${
                  canProceed()
                    ? 'bg-gradient-to-r from-axkan-magenta to-axkan-rojo text-white hover:shadow-lg hover:scale-105'
                    : 'bg-obsidiana/10 text-obsidiana/40 cursor-not-allowed'
                }`}
              >
                Siguiente →
              </button>
            )}
          </div>
        </motion.div>

        {/* Order Summary Sidebar (Desktop) */}
        {currentStep < 3 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 p-6 bg-white rounded-2xl shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-obsidiana/60">Tu pedido</p>
                <p className="text-lg font-bold text-obsidiana">{totalItems} {totalItems === 1 ? 'pieza' : 'piezas'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-obsidiana/60">Estimado</p>
                <p className="text-2xl font-bold text-axkan-turquesa">${totalEstimate.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
