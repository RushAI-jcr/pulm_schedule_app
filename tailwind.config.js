/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
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
      colors: {
        // Rush University Brand Colors (historical reference)
        rush: {
          'legacy-green': '#006332',
          'vitality-green': '#2DDA8E',
          'gold': '#FFC600',
          'dark-grey': '#333333',
          'indigo': '#6366F1',             // NEW - primary theme color
          'light-sage': '#F2F6F3',
          'digital-sage': '#DFF9EB',
          'digital-ivory': '#FFFBEC',
          'digital-rose': '#FDE0DF',
          'cerulean-blue': '#54ADD3',
          'deep-blue': '#00668E',
        },
        // shadcn/ui semantic color tokens (CSS variable based)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: '#004d26',
          light: '#2DDA8E',
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
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        // Scheduling-specific semantic colors
        warning: '#F59E0B',         // Amber
        success: '#10B981',         // Emerald
        available: '#10B981',       // Emerald (matches success)
        'prefer-not': '#F59E0B',    // Amber (matches warning)
        unavailable: '#EF4444',     // Red
      },
      fontFamily: {
        'heading': ['Calibre', 'system-ui', 'sans-serif'],
        'body': ['Calibre', 'Avenir Next', 'Segoe UI', 'sans-serif'],
        'mono': ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        'section': '2rem',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'container': '0.5rem',
      },
      backgroundColor: {
        'grid': '#F2F6F3',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)',
        'card-hover': '0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)',
        'elevated': '0 10px 20px rgba(0,0,0,0.1), 0 3px 6px rgba(0,0,0,0.05)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
