/**
 * ============================================================
 * JAH ENGINE - BenchmarkChart
 * (src/features/benchmark/components/BenchmarkChart.tsx)
 * ============================================================
 * Gráfico en TIEMPO REAL de latencia del Módulo Benchmark,
 * construido con Recharts. Muestra el `timeSeries` (uno por ráfaga
 * de 500 ms) como un área con DEGRADADO CROMÁTICO DINÁMICO.
 *
 * EL GRADIENTE POR UMBRALES (el corazón de este refactor):
 * En lugar de un solo color de relleno, el área usa un gradiente
 * vertical con ESTADO ZONIFICADO:
 *   - Superior (rojo #f43f5e): latencias altas (> 400 ms) = picos.
 *   - Central  (ámbar #fbbf24): latencias medias (100-400 ms).
 *   - Inferior (verde #10b981): latencias bajas (< 100 ms), con
 *     opacidad suavizada hacia la base.
 *
 * ¿CÓMO se mapean los valores del eje Y a las paradas del degradado?
 * Un <linearGradient> vertical (x1=0,y1=0 → x2=0,y2=1) colorea de
 * arriba (0%) a abajo (100%) del objeto al que se aplica. El eje Y
 * también va de arriba = latencia máxima a abajo = latencia mínima.
 * Por tanto, cada valor de latencia `v` se corresponde con un
 * "offset" porcentual medido desde la cima:
 *
 *        offset(v) = (yMax - v) / yMax * 100
 *
 * donde `yMax` es el techo del dominio del eje Y (ver abajo). Así,
 * al fijar el dominio del eje Y en [0, yMax], los stops del gradiente
 * dibujados sobre el ÁREA coinciden espacialmente con los umbrales:
 * un pico a 600 ms queda cerca del rojo superior, un valle a 60 ms
 * se pinta esmeralda. La correspondencia es DINÁMICA: si el pico
 * real crece, yMax crece y el gradiente "se reescala" él solo.
 *
 * EL REFRESCO DINÁMICO: no hay polling. `timeSeries` llega por
 * props y cada tick del motor (500 ms) crea una referencia nueva:
 * React re-renderiza y Recharts redibuja la serie.
 *
 * PALETA: contenedor con design tokens del proyecto (bg-card,
 * border, text-muted-foreground) en lugar de bg-slate-900 fijo.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BenchmarkDataPoint } from '../types/benchmark'
import { LATENCY_CAUTION_MAX_MS, LATENCY_OPTIMAL_MAX_MS } from '../utils/latency'

/* =====================================================================
   ============================ PROPS ==================================
   ===================================================================== */

/**
 * Props que recibe el gráfico.
 *
 * @param timeSeries - Historial de puntos (timestamp, currentRps,
 *                     averageLatency, activeErrors). Cada nuevo tick
 *                     del motor añade un punto a este array.
 * @param isRunning  - Indica si el test está activo. Se usa para el
 *                     indicador "EN VIVO" y el estado vacío.
 */
export interface BenchmarkChartProps {
  timeSeries: BenchmarkDataPoint[]
  isRunning: boolean
}

/* =====================================================================
   =========== APLICADOR DE OFFSETS (ms -> % del gradiente) ============
   ===================================================================== */

/**
 * Convierte un valor de latencia (ms) al offset PERCENTUAL de una
 * parada dentro del gradiente vertical, medido desde la cima (0%).
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
function msToGradientOffset(valorMs: number, yMax: number): number {
  const raw = ((yMax - valorMs) / yMax) * 100
  return Math.min(100, Math.max(0, raw))
}

/* =====================================================================
   ================== TOOLTIP PERSONALIZADO ============================
   ===================================================================== */

/**
 * Props que Recharts inyecta a un Tooltip personalizado.
 * Cada entrada de `payload` representa una SERIE dibujada en el punto
 * señalado (aquí solo hay una: averageLatency). Recharts adjunta el
 * dato ORIGINAL completo (`payload`), de donde extraemos currentRps.
 */
interface ChartTooltipProps {
  /** true cuando el cursor está sobre el gráfico. */
  active?: boolean
  /** Etiqueta del eje X en el punto señalado (el timestamp). */
  label?: string
  payload?: ReadonlyArray<{
    name: string
    value: number
    color: string
    /** El BenchmarkDataPoint original del que salió esta serie. */
    payload?: {
      timestamp: string
      currentRps: number
      averageLatency: number
      activeErrors: number
    }
  }>
}

/**
 * Tooltip de carta blanca: en vez del recuadro gris por defecto,
 * mostramos un panel con timestamp, latencia media exacta y RPS.
 * Recharts renderiza este componente con `active`, `label` y
 * `payload`; cuando el cursor NO está sobre el gráfico devolvemos
 * null y el tooltip no se dibuja.
 */
function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const serie = payload[0]
  const dato = serie?.payload
  const latenciaMs = serie?.value ?? 0
  const rps = dato?.currentRps ?? 0

  return (
    <div className="rounded-md border border-border bg-background/95 px-3 py-2 text-xs shadow-md">
      <p className="font-mono text-foreground">{label}</p>
      <p className="mt-1 text-foreground">
        Latencia media:{' '}
        <span className="font-semibold" style={{ color: serie?.color }}>
          {latenciaMs} ms
        </span>
      </p>
      <p className="mt-0.5 text-muted-foreground">
        RPS: <span className="font-semibold text-foreground">{rps}</span>
      </p>
    </div>
  )
}

/* =====================================================================
   ============ LEYENDA DE UMBRALES (mini semáforo) ====================
   ===================================================================== */

/** Muestra la escala cromática inferior: qué color = qué rango de ms. */
function ThresholdLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-rose-500" /> &gt; {LATENCY_CAUTION_MAX_MS} ms
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        {LATENCY_OPTIMAL_MAX_MS}-{LATENCY_CAUTION_MAX_MS} ms
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-500" /> &lt; {LATENCY_OPTIMAL_MAX_MS} ms
      </span>
    </div>
  )
}

/* =====================================================================
   ===================== COMPONENTE PRINCIPAL ==========================
   ===================================================================== */

/**
 * Gráfico de área con degradado cromático dinámico.
 *
 * @param props - Ver BenchmarkChartProps.
 * @returns Tarjeta con el AreaChart, su leyenda y scroll horizontal.
 */
export function BenchmarkChart({ timeSeries, isRunning }: BenchmarkChartProps) {
  // El id del gradiente debe ser UNICO en la página (bug clásico de SVG).
  const GRADIENT_ID = 'benchmark-latency-gradient'

  /* ------------------------------------------------------------------
     DOMINIO DEL EJE Y (yMax)
     -------------------------------------------------------------
     Fijamos el techo del eje Y al máximo del historial + margen del
     15%. ¿Por qué?
       1. El gradiente mapea los umbrales EN FUNCIÓN de yMax: ambos
          comparten el mismo espacio (ver msToGradientOffset).
       2. Con un pequeño "headroom" los picos no se recortan en el
          borde superior (mal aspecto visual).
     Se recalcula en cada render, así que es dinámico: sube cuando hay
     un pico y baja si el historial solo tiene latencias bajas. */
  const rawMax = timeSeries.reduce((max, p) => Math.max(max, p.averageLatency), 0)
  const yMax = Math.max(1, rawMax + rawMax * 0.15)

  // --- Posición de las paradas del degradado (0% = cima) ---
  // La latencia "mala" (>= 400 ms) vive arriba: offsetCautela es el
  // borde entre la zona roja y la zona ámbar.
  const offsetCautela = msToGradientOffset(LATENCY_CAUTION_MAX_MS, yMax)
  // La latencia "óptima" (<= 100 ms) vive abajo: offsetOptimo es el
  // borde entre la zona ámbar y la zona verde.
  const offsetOptimo = msToGradientOffset(LATENCY_OPTIMAL_MAX_MS, yMax)

  /* ------------------------------------------------------------------
     SCROLL HORIZONTAL DEL HISTÓRICO
     -------------------------------------------------------------
     La leyenda de la misión exige explorar TODO el historial. Si hay
     pocos puntos (prueba corta), el gráfico ocupa el 100% del ancho.
     Si son muchos, el gráfico necesita más ancho del visible: le damos
     un `minWidth` en px (≈ 24 px por punto) y envolvemos el gráfico en
     un contenedor `overflow-x-auto`. El usuario puede así hacer scroll
     horizontal para releer los picos iniciales que ya no caben. */
  const chartMinWidth = Math.max(320, timeSeries.length * 24)

  return (
    // Contenedor con tokens del tema (bg-card/border) y esquinas suaves.
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {/* Cabecera con indicador de estado en vivo. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Evolución de Latencia y Rendimiento en Tiempo Real
        </h2>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            EN VIVO
          </span>
        )}
      </div>

      {/* Leyenda de la escala cromática (rojo/ámbar/verde). */}
      <ThresholdLegend />

      {/* ------------------- ESTADO VACÍO ------------------- */}
      {timeSeries.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
          {isRunning
            ? 'Esperando el primer tick del motor...'
            : 'Lanza una prueba para ver la evolución de la latencia.'}
        </div>
      ) : (
        /* ------------------- SCROLL HORIZONTAL -------------------
           Contenedor que desborda horizontalmente al gráfico cuando
           hay más puntos de los que caben en el ancho visible. */
        <div className="overflow-x-auto pb-1">
          {/* El inner div define el ANCHO real del gráfico: el máximo
              entre el ancho visible y el ancho mínimo por puntos. */}
          <div style={{ minWidth: `${chartMinWidth}px` }}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart
                data={timeSeries}
                margin={{ top: 8, right: 8, bottom: 0, left: -14 }}
              >
                {/* =================================================
                    GRADIENTE DINÁMICO POR UMBRALES
                    ---------------------------------------------
                    Stop 1 (0%): rojo #f43f5e (latencias > 400 ms),
                      la "zona mala", arriba del gráfico.
                    Stop 2 (offsetCautela): ámbar #fbbf24, frontera
                      entre rojo y ámbar en el punto exacto donde el
                      eje Y marca 400 ms.
                    Stop 3 (offsetOptimo): esmeralda #10b981, frontera
                      entre ámbar y verde donde el eje Y marca 100 ms.
                    Stop 4 (100%): esmeralda casi transparente, para
                      suavizar la base (opacidad 0.02).
                    Los offsets se calculan dinámicamente con
                    msToGradientOffset, así el degradado se re-posiciona
                    solo según el dominio del eje Y actual. */}
                <defs>
                  <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset={`${offsetCautela}%`} stopColor="#fbbf24" stopOpacity={0.4} />
                    <stop offset={`${offsetOptimo}%`} stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                {/* Rejilla sutil de fondo para leer mejor los valores. */}
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />

                {/* Eje X: timestamps HH:mm:ss (uno por ráfaga). */}
                <XAxis
                  dataKey="timestamp"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  stroke="var(--border)"
                  minTickGap={40}
                />

                {/* Eje Y: dominio FIJO [0, yMax] para que la escala
                    coincida exactamente con el mapeo del gradiente
                    (mismo yMax usado en msToGradientOffset). */}
                <YAxis
                  domain={[0, yMax]}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  stroke="var(--border)"
                />

                <Tooltip content={<ChartTooltip />} />

                {/* El ÁREA: `fill` apunta al gradiente por umbrales y
                    `stroke` se mantiene esmeralda para conservar la
                    línea de tendencia coherente con la zona óptima.
                    isAnimationActive=false: los ticks llegan cada
                    500 ms y no queremos animaciones que compitan. */}
                <Area
                  type="monotone"
                  dataKey="averageLatency"
                  name="latencia"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill={`url(#${GRADIENT_ID})`}
                  isAnimationActive={false}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

export default BenchmarkChart