/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'safety-orange': '#FF6700',
        'dark-steel': '#1E1E1E',
      }
    },
  },
  plugins: [],
}
