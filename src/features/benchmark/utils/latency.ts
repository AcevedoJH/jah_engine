/**
 * ============================================================
 * JAH ENGINE - Semáforo de latencia
 * (src/features/benchmark/utils/latency.ts)
 * ============================================================
 * Utilidad pura que traduce una latencia (ms) a un color de texto
 * de Tailwind, según umbrales de "semáforo".
 *
 * ¿Por qué vive en utils/ y no dentro del componente?
 * oxlint (regla `react/only-export-components`) exige que los
 * archivos de componentes exporten SOLO componentes, para que
 * React Fast Refresh funcione bien en desarrollo. Las funciones
 * puras como esta se extraen a su propio archivo de utilidades,
 * donde además pueden testearse de forma aislada y reutilizarse
 * en otros componentes (p. ej. futuras gráficas Recharts).
 */

/** Latencias por debajo de esto se consideran óptimas (verde). */
export const LATENCY_OPTIMAL_MAX_MS = 100
/** Latencias por debajo de esto se consideran aceptables (ámbar). */
export const LATENCY_CAUTION_MAX_MS = 400

/**
 * Devuelve la clase de COLOR de texto de Tailwind según la latencia.
 *
 * ¿Cómo funcionan los "umbrales dinámicos"?
 * La función compara el valor contra dos fronteras (100 ms y 400 ms)
 * y devuelve la clase que "pinta" el número de un color u otro. Es un
 * patrón muy usado en dashboards: el dato no solo se LEE, se VE.
 *
 * Las clases devueltas son clases de color de texto Tailwind. Tailwind
 * purga (elimina) las clases que no ve escritas en el código fuente:
 * como estos strings aparecen literalmente aquí, Tailwind las incluye
 * en el bundle (por eso NO se pueden construir dinámicamente).
 *
 * Resultado del cálculo:
 *   - < 100 ms           -> 'text-emerald-500' (rendimiento óptimo).
 *   - 100 <= x < 400 ms  -> 'text-amber-400'  (aceptable / precaución).
 *   - >= 400 ms          -> 'text-rose-500'   (cuello de botella).
 *
 * @param latencyMs - Latencia en milisegundos.
 * @returns Clase de color de texto, ej. 'text-emerald-500'.
 */
export function getLatencyColorClass(latencyMs: number): string {
  // Verde: rendimiento óptimo (la inmensa mayoría de respuestas).
  // Usamos text-emerald-500 para que coincida exactamente con el color
  // de la tarjeta "Exitosas (2xx/3xx)", logrando un semáforo coherente
  // en todo el componente de métricas.
  if (latencyMs < LATENCY_OPTIMAL_MAX_MS) {
    return 'text-emerald-500'
  }
  // Ámbar: rendimiento aceptable pero con margen de mejora (precaución).
  if (latencyMs < LATENCY_CAUTION_MAX_MS) {
    return 'text-amber-400'
  }
  // Rojo: alta latencia, posible cuello de botella.
  return 'text-rose-500'
}