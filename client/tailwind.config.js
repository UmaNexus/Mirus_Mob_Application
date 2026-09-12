/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Orange + Grey from the Mirus logo (#E89000 / #707070).
        primary: {
          50: '#FFF8EB',
          100: '#FFEFCC',
          200: '#FFDB99',
          300: '#FFC266',
          400: '#F5A830',
          500: '#F09818',
          600: '#E89000', // brand orange from logo
          700: '#C27800',
          800: '#9A5F00',
          900: '#7A4B00',
          950: '#4A2E00'
        },
        // Sidebar / deep surfaces (charcoal grey from logo ribbons).
        sidebar: {
          DEFAULT: '#3F3F3F',
          hover: '#525252',
          active: '#E89000'
        },
        ink: '#2D2D2D', // primary text (dark grey)
        muted: '#707070', // secondary text (logo grey)
        surface: '#F5F5F5', // app background (light grey)
        card: '#FFFFFF',
        line: '#E0E0E0', // borders (grey)
        success: { DEFAULT: '#16A34A', soft: '#DCFCE7' },
        warning: { DEFAULT: '#D97706', soft: '#FEF3C7' },
        danger: { DEFAULT: '#DC2626', soft: '#FEE2E2' },
        info: { DEFAULT: '#0EA5E9', soft: '#E0F2FE' }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(45, 45, 45, 0.04), 0 1px 3px 0 rgba(45, 45, 45, 0.08)',
        elevated: '0 10px 30px -10px rgba(45, 45, 45, 0.18)'
      },
      borderRadius: {
        xl: '0.875rem'
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(4px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        'slide-in': { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(0)' } }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s ease-out'
      }
    }
  },
  plugins: []
};
