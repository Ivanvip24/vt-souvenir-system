export const metadata = {
  title: 'AXKAN Studio',
  description: 'Content Management System for AXKAN website',
}

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
