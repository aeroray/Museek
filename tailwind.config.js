/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "Source Serif 4",
          "Noto Serif SC",
          "Songti SC",
          "SimSun",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
        serif: [
          "Source Serif 4",
          "Noto Serif SC",
          "Songti SC",
          "SimSun",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
      },
      colors: {
        sidebar: "hsl(var(--sidebar))",
        player: "hsl(var(--player))",

        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      transitionDuration: {
        320: "320ms",
        450: "450ms",
      },
      transitionTimingFunction: {
        "drawer-out": "cubic-bezier(0.32, 0.72, 0, 1)",
        "drawer-spring": "cubic-bezier(0.22, 1, 0.36, 1)",
        "drawer-nested": "cubic-bezier(0.45, 1.005, 0, 1.005)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
