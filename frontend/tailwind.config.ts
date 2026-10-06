import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#142033',
        navy: '#173B57',
        brand: '#0D8B7D',
        mist: '#EAF4F7',
        canvas: '#F5F7F9',
        amberx: '#D99014',
        dangerx: '#C44747',
        successx: '#2F7D5A',
      },
      boxShadow: {
        soft: '0 14px 40px rgba(24, 48, 68, 0.08)',
        lift: '0 20px 55px rgba(24, 48, 68, 0.12)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
export default config
