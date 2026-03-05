/** @type {import('tailwindcss').Config} */
module.exports = {
  // Enable class-based dark mode so we can toggle it programmatically
  darkMode: 'class',

  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './public/index.html',
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Custom brand palette
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-light':
          'radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(59,130,246,0.10) 0%, transparent 60%)',
        'mesh-dark':
          'radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.20) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(59,130,246,0.15) 0%, transparent 60%)',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        'glass-dark': '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glow-blue': '0 0 40px rgba(99,102,241,0.25)',
        'glow-sm': '0 0 20px rgba(99,102,241,0.15)',
      },
      animation: {
        'bounce-dot': 'bounceDot 1.4s infinite ease-in-out',
        'gradient-x': 'gradientX 4s ease infinite',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.455,0.03,0.515,0.955) infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        bounceDot: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        gradientX: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },

  plugins: [],
};
