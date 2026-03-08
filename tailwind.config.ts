import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
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
        headline: ['"Cormorant Garamond"', 'serif'],
        subheadline: ['"Crimson Pro"', 'serif'],
        body: ['Inter', 'sans-serif'],
        hint: ['Inter', 'sans-serif'],
      },
      colors: {
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
        gold: {
          DEFAULT: "hsl(var(--gold))",
          foreground: "hsl(var(--gold-foreground))",
        },
        taupe: {
          DEFAULT: "hsl(var(--taupe))",
          highlight: "hsl(var(--taupe-highlight))",
          rich: "hsl(var(--taupe-rich))",
          foreground: "hsl(var(--taupe-foreground))",
        },
        saffron: {
          DEFAULT: "hsl(var(--saffron))",
          foreground: "hsl(var(--saffron-foreground))",
        },
        kairos: {
          DEFAULT: "hsl(var(--kairos))",
          foreground: "hsl(var(--kairos-foreground))",
        },
        forest: {
          DEFAULT: "hsl(var(--forest))",
          light: "hsl(var(--forest-light))",
          foreground: "hsl(var(--forest-foreground))",
        },
        lavender: {
          DEFAULT: "hsl(var(--lavender))",
          foreground: "hsl(var(--lavender-foreground))",
        },
        rose: {
          DEFAULT: "hsl(var(--rose))",
          foreground: "hsl(var(--rose-foreground))",
        },
        emerald: {
          DEFAULT: "hsl(var(--emerald))",
          foreground: "hsl(var(--emerald-foreground))",
        },
        mintGreen: {
          DEFAULT: "hsl(var(--mint-green))",
          foreground: "hsl(var(--mint-green-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-out": {
          "0%": {
            opacity: "1",
            transform: "translateY(0)",
          },
          "100%": {
            opacity: "0",
            transform: "translateY(10px)",
          },
        },
        "scale-in": {
          "0%": {
            transform: "scale(0.95)",
            opacity: "0",
          },
          "100%": {
            transform: "scale(1)",
            opacity: "1",
          },
        },
        "scale-out": {
          from: { transform: "scale(1)", opacity: "1" },
          to: { transform: "scale(0.95)", opacity: "0" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "page-enter": {
          "0%": {
            opacity: "0",
            transform: "translateX(8px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "float-logo-1": {
          "0%, 100%": { transform: "translateY(0) rotate(-8deg)" },
          "50%": { transform: "translateY(-8px) rotate(4deg)" },
        },
        "float-logo-2": {
          "0%, 100%": { transform: "translateY(0) rotate(6deg)" },
          "50%": { transform: "translateY(-6px) rotate(-4deg)" },
        },
        "float-logo-3": {
          "0%, 100%": { transform: "translateY(0) rotate(10deg)" },
          "50%": { transform: "translateY(-10px) rotate(-6deg)" },
        },
        "float-logo-4": {
          "0%, 100%": { transform: "translateY(0) rotate(-5deg)" },
          "50%": { transform: "translateY(-7px) rotate(8deg)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-out": "fade-out 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "scale-out": "scale-out 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "slide-out-right": "slide-out-right 0.3s ease-out",
        "shimmer": "shimmer 2s ease-in-out infinite",
        "page-enter": "page-enter 0.4s ease-out",
        "float-logo-1": "float-logo-1 3s ease-in-out infinite",
        "float-logo-2": "float-logo-2 3.5s ease-in-out infinite 0.3s",
        "float-logo-3": "float-logo-3 4s ease-in-out infinite 0.6s",
        "float-logo-4": "float-logo-4 3.2s ease-in-out infinite 0.9s",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
