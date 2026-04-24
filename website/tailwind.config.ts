import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AXKAN Primary Brand Colors (from brand manual)
        axkan: {
          magenta: '#e72a88',
          verde: '#8ab73b',
          naranja: '#f39223',
          turquesa: '#09adc2',
          rojo: '#e52421',
        },
        // Secondary/Supporting Colors
        secondary: {
          'dark-red': '#a6191d',
          'dark-teal': '#106c7f',
          'gold': '#f4b266',
          'lime': '#b7c54c',
          'dark-magenta': '#aa1e6b',
        },
        // Neutral Colors (from brand guidelines)
        crema: '#FAF7F0',
        obsidiana: '#2C2C28',
        // Legacy colors (from brand doc)
        terracota: '#D97757',
        jade: '#4A7856',
        'oro-maya': '#D4A574',
        'azul-anil': '#4A6FA5',
      },
      fontFamily: {
        // Brand fonts
        display: ['var(--font-display)', 'Montserrat', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'sans-serif'],
        // Note: RL AQVA and Prenton RP Cond are custom fonts to be loaded
      },
      fontSize: {
        'display': ['4.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-sm': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
        'scale-in': 'scaleIn 0.5s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-axkan': 'linear-gradient(135deg, #e72a88 0%, #f39223 50%, #09adc2 100%)',
        'gradient-mexico': 'linear-gradient(135deg, #8ab73b 0%, #09adc2 50%, #e52421 100%)',
      },
    },
  },
  plugins: [],
}

export default config
