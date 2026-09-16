/**
 * ============================================================
 * JAH ENGINE - postcss.config.js
 * ============================================================
 * PostCSS es un procesador de CSS basado en plugins. Vite lo usa
 * de forma transparente al importar CSS desde los componentes.
 *
 * Aqui encadenamos dos plugins imprescindibles:
 *  1. tailwindcss   -> genera las directivas @tailwind utilities y
 *                      transforma las clases utilitarias en CSS real.
 *  2. autoprefixer  -> anade prefijos de navegador (-webkit-, -moz-)
 *                      automaticamente para asegurar compatibilidad.
 *
 * Orden importa: primero Tailwind expande sus directivas y luego
 * Autoprefixer normaliza el resultado final.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};