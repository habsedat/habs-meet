/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        techBlue: '#0E3A8A',
        violetDeep: '#6C63FF',
        goldBright: '#FFD35C',
        midnight: '#0E0E10',
        cloud: '#F5F5F5',
      },
      fontFamily: {
        brand: ['Habs Futurist', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}





