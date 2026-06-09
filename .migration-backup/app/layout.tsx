import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Sinapsia - Mapas Conceituais',
  description:
    'Tela infinita para mapas mentais e conceituais, com desenho touch e compartilhamento por link.',
  openGraph: {
    title: 'Sinapsia - Mapas Conceituais',
    description:
      'Tela infinita para mapas mentais e conceituais, com desenho touch e compartilhamento por link.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={geist.className}>{children}</body>
    </html>
  )
}
