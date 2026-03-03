/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        wow: {
          blue: '#1a4b8c',
          'blue-light': '#2d6fd6',
          gold: '#f0a030',
          'gold-light': '#ffd100',
          dark: '#0a0e14',
          'dark-light': '#141b26',
          'dark-lighter': '#1e2738',
          border: '#2a3548',
          text: '#c8d6e5',
          'text-muted': '#6b7d95',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
