/**
 * ============================================================
 * JAH ENGINE - tailwind.config.js
 * ============================================================
 * Configuracion de Tailwind CSS v3 para el dashboard.
 *
 * ¿Que hace este archivo?
 * 1. `content`: le dice a Tailwind QUE archivos debe escanear para
 *    detectar las clases utilitarias usadas. Solo las clases que
 *    aparecen en estos archivos se incluyen en el CSS final (asi el
 *    CSS de produccion es minimo: "compilacion por arbol").
 * 2. `darkMode`: activa el modo oscuro basado en la clase `dark`
 *    del <html> (no en la preferencia del sistema), de modo que el
 *    usuario pueda alternar manualmente el tema en el dashboard.
 * 3. `theme.extend`: aqui se definen los design tokens (colores,
 *    radios, fuentes, animaciones) que comparten TODOS los
 *    componentes de Shadcn UI. Las variables CSS (--background,
 *    --primary...) se declaran en src/index.css y se referencian
 *    con `hsl(var(--...))` para poder cambiar el tema en caliente.
 */
module.exports = {
  // Rutas que escanea Tailwind para "purgear" el CSS final.
  content: ["src/**/*.{ts,tsx}"],

  // Variante `dark:` usando la clase `.dark` (alternable en runtime).
  darkMode: ["class"],

  theme: {
    extend: {
      // Paleta "semantica" de Shadcn. No definimos colores fijos,
      // sino variables CSS que el tema (light/dark) sobreescribe.
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
      },
      // Radios de borde consistentes con el sistema de diseno.
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  // Sin plugins adicionales por ahora. (tailwindcss-animate se
  // añadiria aqui si incorporamos las animaciones de Radix UI.)
  plugins: [],
};