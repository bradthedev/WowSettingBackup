/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/**/*.{js,jsx,ts,tsx}",
    "./src/renderer/index.html"
  ],
  theme: {
    extend: {
      colors: {
        'wow-blue': '#4fc3f7',
        'wow-blue-light': '#8bf6ff',
        'wow-blue-dark': '#0093c4',
        'wow-orange': '#ff6f61',
        'wow-orange-light': '#ffa08f',
        'wow-orange-dark': '#c63f36',
        'dark-bg': '#1e1e1e',
        'dark-surface': '#2a2a2a',
        'dark-border': '#3a3a3a',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'progress': 'progress 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        progress: {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}