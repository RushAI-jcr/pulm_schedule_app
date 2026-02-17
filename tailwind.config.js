/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Rush University Brand Colors
        rush: {
          'legacy-green': '#006332',
          'vitality-green': '#2DDA8E',
          'gold': '#FFC600',
          'dark-grey': '#333333',
          'light-sage': '#F2F6F3',
        },
        primary: {
          DEFAULT: '#006332', // Legacy Green
          hover: '#004d26',
          light: '#2DDA8E', // Vitality Green
        },
        secondary: '#333333', // Dark Grey
        warning: '#FFC600', // Rush Gold
        success: '#2DDA8E', // Vitality Green
        available: '#2DDA8E', // Green
        'prefer-not': '#FFC600', // Yellow
        unavailable: '#dc2626', // Red
      },
      fontFamily: {
        'heading': ['Calibre', 'system-ui', 'sans-serif'],
        'body': ['Georgia', 'serif'],
        'mono': ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        'section': '2rem',
      },
      borderRadius: {
        'container': '0.5rem',
      },
      backgroundColor: {
        'grid': '#F2F6F3', // Light Sage for 52-week grid
      },
    },
  },
  plugins: [],
}
