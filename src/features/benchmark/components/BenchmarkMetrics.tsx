/**
 * ============================================================
 * JAH ENGINE - BenchmarkMetrics
 * (src/features/benchmark/components/BenchmarkMetrics.tsx)
 * ============================================================
 * Componente de PRESENTACIÓN de los resultados del Módulo Benchmark.
 * Renderiza, en tiempo real, el avance de la prueba y las métricas
 * clave: progreso (barra), contadores (éxitos/fallos) y percentiles
 * de latencia con semáforo de color.
 *
 * Es un componente "puro": recibe `result` y `totalRequests` por
 * props y NO tiene estado propio. Al ser puro, el mismo resultado
 * siempre pinta el mismo UI, lo que facilita mucho el testeo y
 * garantiza que la fuente de verdad (el hook `useBenchmark`) es la
 * única que decide qué se muestra.
 *
 * Nota pedagógica sobre el SEMÁFORO DE LATENCIA:
 * Un porcentaje (p50, p99...) es un número "frío". Para que el ojo
 * humano detecte anomalías sin leer el valor, asignamos un color por
 * umbrales inspirados en las buenas prácticas de observabilidad:
 *   - < 100 ms  -> verde  (rendimiento óptimo)
 *   - 100-400 ms-> ámbar  (aceptable, vigilar)
 *   - > 400 ms  -> rojo   (cuello de botella)
 * Estos umbrales son orientativos (dependen del tipo de servicio);
 * se centralizan como constantes para poder ajustarlos en un lugar.
 */

import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import type { LatencyPercentiles } from '../types/benchmark'
import { getLatencyColorClass } from '../utils/latency'
import { calculateProgress } from '../utils/progress'

/* =====================================================================
   ============================ PROPS ==================================
   ===================================================================== */

/** Props que recibe el componente de métricas. */
export interface BenchmarkMetricsProps {
  /**
   * Resultado acumulado de la prueba (lo emite cada tick el motor).
   * Aquí vive completedRequests, successfulRequests, failedRequests,
   * percentiles y la timeSeries/status necesarios para pintar.
   */
  result: {
    status: string
    completedRequests: number
    successfulRequests: number
    failedRequests: number
    percentiles: LatencyPercentiles
  }
  /** Total de peticiones solicitadas (necesario para el % de progreso). */
  totalRequests: number
}

/* =====================================================================
   ===================== COMPONENTE PRINCIPAL ==========================
   ===================================================================== */

/**
 * Muestra el progreso y las métricas del test en tiempo real.
 *
 * @param props - Ver BenchmarkMetricsProps.
 * @returns Tarjeta con barra de progreso, contadores y percentiles.
 */
export function BenchmarkMetrics({ result, totalRequests }: BenchmarkMetricsProps) {
  // --- Cálculo del progreso actual ---
  // Se recalcula en CADA render: como `result` cambia con cada tick
  // del motor (cada 500 ms), el porcentaje se actualiza solo.
  const progressPct = calculateProgress(result.completedRequests, totalRequests)

  // La prueba está "activa" mientras el motor está emitiendo ticks;
  // usamos ese dato para decidir el relleno de la barra (verde cuando
  // marcha o terminó, gris/neutro cuando está inactiva).
  const isProgressActive =
    result.status === 'running' || result.status === 'completed'

  // Los cuatro percentiles se declaran como un array de tuplas
  // [etiqueta, valor]. Iterarlo con .map() evita repetir 4 bloques
  // de JSX casi idénticos (DRY). El `as const` preserva los literales
  // de tipo de la etiqueta para el `key` de React.
  const percentileEntries: ReadonlyArray<readonly [string, number]> = [
    ['p50', result.percentiles.p50],
    ['p90', result.percentiles.p90],
    ['p95', result.percentiles.p95],
    ['p99', result.percentiles.p99],
  ]

  return (
    <div className="space-y-4">
      {/* ======================================================
          BARRA DE PROGRESO
         ======================================================
         Muestra de forma inmediata cuánto resta de la prueba.
         - El párrafo describe el progreso con números legibles.
         - La pista (el contenedor) usa el token `bg-background` del
           tema oscuro del proyecto (equivalente a un fondo oscuro)
           con borde definido, para destacar el relleno.
         - El relleno ancho se fija con style={{ width: `${pct}%` }}
           porque varía en runtime; `transition-all duration-300` hace
           que el cambio de ancho se ANIME suavemente en vez de saltar.
         El color del relleno es condicional (ver active/inactive):
           se elige una clase de color u otra según el estado. */}
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Progreso:{' '}
          <span className="font-semibold text-foreground">
            {formatNumber(result.completedRequests)} / {formatNumber(totalRequests)}
          </span>{' '}
          peticiones ({progressPct}%)
        </p>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-background ring-1 ring-border">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              isProgressActive ? 'bg-emerald-500' : 'bg-muted-foreground/30',
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ======================================================
          CONTADORES DE LA PRUEBA
         ======================================================
         Tres tarjetas pequeñas con los totales acumulados.
         Mantenemos el código de color existente: éxitos en verde
         (positivo) y fallos en rojo (negativo). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted p-3">
          <p className="text-xs text-muted-foreground">Completadas</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatNumber(result.completedRequests)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted p-3">
          <p className="text-xs text-muted-foreground">Exitosas (2xx/3xx)</p>
          <p className="mt-1 text-xl font-semibold text-emerald-500">
            {formatNumber(result.successfulRequests)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted p-3">
          <p className="text-xs text-muted-foreground">Fallidas (4xx/5xx/timeout)</p>
          <p className="mt-1 text-xl font-semibold text-rose-500">
            {formatNumber(result.failedRequests)}
          </p>
        </div>
      </div>

      {/* ======================================================
          PERCENTILES DE LATENCIA (con semáforo dinámico)
         ======================================================
         Cada tarjeta aplica getLatencyColorClass() a su valor:
         el color de la cifra cambia automáticamente según la
         latencia, reemplazando el color neutro anterior.
         La unidad "ms" se muestra SIEMPRE, clara y junto al valor. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {percentileEntries.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Percentil {label}</p>
            <p className={cn('mt-1 text-xl font-semibold', getLatencyColorClass(value))}>
              {formatNumber(value)}
              <span className="ml-1 text-xs text-muted-foreground">ms</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default BenchmarkMetrics