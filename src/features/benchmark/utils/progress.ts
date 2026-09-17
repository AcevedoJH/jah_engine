/**
 * ============================================================
 * JAH ENGINE - calculateProgress
 * (src/features/benchmark/utils/progress.ts)
 * ============================================================
 * Funcion PURA que calcula el porcentaje de avance de una prueba
 * de carga, acotado a [0, 100].
 *
 * ¿Por que vive en `utils/` y no dentro del componente?
 * 1. REUTILIZACION: la misma formula la usan la vista de detalle
 *    (BenchmarkMetrics, barra ancha) y el gadget del Dashboard
 *    (BenchmarkWidget, barra miniatura). Unicos lugar centralizado.
 * 2. REGLA DE FAST REFRESH (oxlint: react/only-export-components):
 *    las funciones de calculo/transformacion se separan de los
 *    archivos de componentes para no romper el hot reload.
 * 3. TESTEABILIDAD: una funcion pura se prueba de forma aislada
 *    sin necesidad de montar un componente React.
 *
 * ¿Como se calcula? El progreso es la PARTE (peticiones respondidas)
 * sobre el TOTAL (peticiones solicitadas). Multiplicar por 100
 * convierte la fraccion en porcentaje; Math.round elimina decimales
 * "feos" (45.333...%) y el clamp con Math.min/Math.max protege la
 * barra: si el motor reportara mas completadas que el total (bug),
 * el ancho nunca se desbordaria de su pista.
 *
 * @param completedRequests - Peticiones que ya respondieron.
 * @param totalRequests     - Peticiones solicitadas en total.
 * @returns Porcentaje entero entre 0 y 100.
 */
export function calculateProgress(
  completedRequests: number,
  totalRequests: number,
): number {
  // Proteccion contra division por cero (total 0 devolveria NaN).
  if (totalRequests <= 0) return 0
  const raw = (completedRequests / totalRequests) * 100
  return Math.min(100, Math.max(0, Math.round(raw)))
}