import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral light — reemplaza el antiguo púrpura
        brand: {
          50:  '#FAFAF9',
          100: '#F5F5F3',
          200: '#EEEEED',
          300: '#E8E8E4',
          400: '#E8E8E4',
          500: '#E8E8E4',
          600: '#D0D0CC',
          700: '#A8A8A4',
          800: '#888780',
          900: '#444441',
        },
        surface: {
          0:   '#0D0D0C',
          50:  '#111110',
          100: '#111110',
          200: '#1C1C1A',
          300: '#2C2C2A',
          400: '#3C3C3A',
          500: '#444441',
        },
        border: {
          subtle:  '#2C2C2A',
          DEFAULT: '#3C3C3A',
          strong:  '#4C4C4A',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-brand':   'none',
        'gradient-surface': 'none',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.2s ease-in-out',
        'slide-up':   'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
