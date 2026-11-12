import type { Config } from "tailwindcss";

/**
 * Kibent – „cashmere brutalism”
 * Vastag tinta körvonalak, kemény (blur nélküli) offset árnyékok, kasmír pasztell
 * színblokkok és divatmagazinos Bodoni címek.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        ink: "#000000",
        cotton: "#FCFAFF",
        butter: { DEFAULT: "#FFE27A", deep: "#FFD23F" },
        bubblegum: "#FFB9DA",
        cornflower: "#A9C1FF",
        lilac: { DEFAULT: "#DCCBFF", soft: "#F1EAFF" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Didot", "Georgia", "serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      borderWidth: { 3: "3px" },
      boxShadow: {
        "brutal-xs": "2px 2px 0 0 #000",
        "brutal-sm": "3px 3px 0 0 #000",
        brutal: "5px 5px 0 0 #000",
        "brutal-lg": "8px 8px 0 0 #000",
        "brutal-xl": "12px 12px 0 0 #000",
      },
      keyframes: {
        "knit-in": {
          "0%": { opacity: "0", transform: "scale(0.6) rotate(-6deg)" },
          "70%": { opacity: "1", transform: "scale(1.06) rotate(1deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0)" },
        },
      },
      animation: { "knit-in": "knit-in 420ms cubic-bezier(.2,.9,.3,1.3) both" },
    },
  },
  plugins: [],
};

export default config;
