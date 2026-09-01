/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        prexyon: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#38a9f7',
          500: '#0088ff',
          600: '#0066ff',
          700: '#0052cc',
          800: '#0040a3',
          900: '#0a2558',
          950: '#06132f',
        },
        navy: {
          800: '#0e1f3d',
          850: '#0a1931',
          900: '#071224',
          950: '#040b17',
        },
        orcagraf: {
          light: '#22c55e',
          DEFAULT: '#16a34a',
          dark: '#15803d',
          bg: '#f0fdf4',
          border: '#bbf7d0',
        },
        arteflow: {
          light: '#38bdf8',
          DEFAULT: '#0284c7',
          dark: '#0369a1',
          bg: '#f0f9ff',
          border: '#bae6fd',
        },
        artecheck: {
          light: '#a855f7',
          DEFAULT: '#7c3aed',
          dark: '#6d28d9',
          bg: '#faf5ff',
          border: '#e9d5ff',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          border: '#e2e8f0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
        'login': '0 20px 40px -15px rgba(0, 0, 0, 0.07), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        'dropdown': '0 10px 30px -5px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
