/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The rich deep blue from the logo background
        primary: {
          DEFAULT: '#0A192F', 
          light: '#172A46', // For hover states
        },
        // The metallic gold from the text and borders
        accent: {
          DEFAULT: '#D4AF37',
          hover: '#B3932B', // A slightly darker gold for hover
        },
        // A clean, professional white variant for backgrounds and text
        secondary: '#F8F9FA', 
        // A solid black/dark grey for standard text
        dark: '#1A1A1A',
      },
      fontFamily: {
        // A modern, clean sans-serif for body text
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        // A classic serif for headings, matching the logo's vibe
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      // Standard container padding
      container: {
        center: true,
        padding: '1.5rem',
      },
    },
  },
  plugins: [],
}