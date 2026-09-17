/**
 * ============================================================
 * JAH ENGINE - msToGradientOffset
 * (src/features/benchmark/utils/gradient.ts)
 * ============================================================
 * Función PURA que convierte un valor de latencia (ms) al offset
 * PERCENTUAL de una parada dentro de un gradiente SVG vertical,
 * medido desde la cima (0%).
 *
 * ¿Por qué está en `utils/` y no dentro de un componente?
 * Es la pieza compartida por DOS consumidores con la MISMA escala:
 *   - BenchmarkChart (vista completa /benchmark).
 *   - BenchmarkWidget (sparkline del Dashboard).
 * Si la fórmula viviera copiada en cada componente, un ajuste en la
 * posición de las zonas rojo/ámbar/verde habría que aplicarlo a mano
 * en dos sitios. Centralizarla garantiza que el degradado de la
 * miniatura y el del gráfico grande coincidan SIEMPRE.
 *
 * Fórmula: offset = (yMax - valor) / yMax * 100
 * Razonamiento:
 *   - El degradado va de 0% (arriba) a 100% (abajo).
 *   - En el eje Y, "arriba" es la latencia máxima (yMax) y "abajo" es 0.
 *   - Por regla de tres, un valor `v` vive a (v/yMax)% de alto medido
 *     desde abajo; su equivalente desde arriba es el complemento.
 *   - Clampamos a [0, 100] para que valores fuera del dominio (p. ej.
 *     600 ms cuando yMax = 150) queden pegados al borde correcto en
 *     lugar de romper la progresión del degradado (los stops SVG
 *     siempre deben estar ordenados y dentro del rango [0,100]).
 *
 * @param valorMs - Latencia del valor a representar.
 * @param yMax    - Techo del dominio del eje Y (en ms).
 * @returns Offset percentual [0-100] para el atributo offset del <stop>.
 */
export function msToGradientOffset(valorMs: number, yMax: number): number {
  const raw = ((yMax - valorMs) / yMax) * 100
  return Math.min(100, Math.max(0, raw))
}