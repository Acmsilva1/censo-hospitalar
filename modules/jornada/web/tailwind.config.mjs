/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--app-bg)",
          surface: "var(--app-surface)",
          elevated: "var(--app-elevated)",
          border: "var(--app-border)",
          fg: "var(--app-fg)",
          muted: "var(--app-muted)",
        },
        dash: {
          panel: "var(--dash-panel)",
          live: "var(--dash-live)",
          critical: "var(--dash-critical)",
          urgent: "var(--dash-accent-urgent)",
        }
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
