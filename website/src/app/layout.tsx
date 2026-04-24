import type { Metadata } from 'next'
import { Inter, Montserrat } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'AXKAN | Recuerdos Hechos Souvenir',
  description: 'Souvenirs premium mexicanos que despiertan orgullo. Imanes, llaveros y más con diseños auténticos de los destinos más hermosos de México.',
  keywords: ['souvenirs méxico', 'imanes turísticos', 'recuerdos mexicanos', 'axkan', 'llaveros personalizados'],
  authors: [{ name: 'AXKAN by VT Anunciando' }],
  openGraph: {
    title: 'AXKAN | Recuerdos Hechos Souvenir',
    description: 'Souvenirs premium mexicanos que despiertan orgullo.',
    url: 'https://axkan.art',
    siteName: 'AXKAN',
    locale: 'es_MX',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AXKAN | Recuerdos Hechos Souvenir',
    description: 'Souvenirs premium mexicanos que despiertan orgullo.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${inter.variable} ${montserrat.variable}`}>
      <body className="min-h-screen bg-crema text-obsidiana antialiased">
        <a href="#main-content" className="skip-link">
          Saltar al contenido principal
        </a>
        <div id="main-content">
          {children}
        </div>
      </body>
    </html>
  )
}
