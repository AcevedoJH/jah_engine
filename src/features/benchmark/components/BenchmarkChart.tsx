/**
 * ============================================================
 * JAH ENGINE - BenchmarkChart
 * (src/features/benchmark/components/BenchmarkChart.tsx)
 * ============================================================
 * Gráfico en TIEMPO REAL de latencia y rendimiento del Módulo
 * Benchmark, construido con la librería Recharts.
 *
 * ¿Qué muestra?
 * El `timeSeries` acumulado por el motor: cada 500 ms llega un nuevo
 * BenchmarkDataPoint (timestamp, currentRps, averageLatency,
 * activeErrors). Este componente lo pinta como un área con degradado
 * tipo Grafana: la línea es la latencia media de cada ráfaga y el
 * área bajo ella se rellena con un gradiente esmeralda.
 *
 * EL REFRESCO DINÁMICO (clave para entender este componente):
 * React re-renderiza este componente cada vez que cambian sus props.
 * Como `timeSeries` es la MISMA referencia hasta que el motor emite
 * un tick nuevo, Recharts redibuja automáticamente al recibir cada
 * punto nuevo: NO hay polling ni setInterval aquí, la flecha de datos
 * es estrictamente unidireccional (motor -> hook -> props -> gráfico).
 *
 * PALETA: el contenedor usa los design tokens del proyecto (bg-card,
 * border, text-muted-foreground) en lugar de colores fijos como
 * bg-slate-900, para que el módulo sea coherente con el resto del
 * dashboard en ambos temas.
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

/* =====================================================================
   ============================ PROPS ==================================
   ===================================================================== */

/**
 * Props que recibe el gráfico.
 *
 * @param timeSeries - Historial de puntos (timestamp, currentRps,
 *                     averageLatency, activeErrors). Vacío mientras
 *                     no se haya lanzado ninguna prueba.
 * @param isRunning  - Indica si el test está activo. Se usa para
 *                     mostrar un indicador "EN VIVO" y diferenciar
 *                     el estado vacío del estado con datos.
 */
export interface BenchmarkChartProps {
  timeSeries: BenchmarkDataPoint[]
  isRunning: boolean
}

/* =====================================================================
   ================== TOOLTIP PERSONALIZADO ============================
   ===================================================================== */

/**
 * Props que Recharts inyecta a un Tooltip personalizado.
 * (Recharts pasa el contenido del tooltip como una función de
 * render; nosotros definimos las props que realmente necesitamos.)
 *
 * Cada entrada de `payload` representa una SERIE dibujada en el punto
 * señalado (aquí solo hay una: averageLatency). Recharts adjunta a
 * cada entrada el dato ORIGINAL completo (`payload`), de donde
 * extraemos el resto de campos del punto (currentRps, activeErrors).
 */
interface ChartTooltipProps {
  /** true cuando el cursor está sobre el gráfico. */
  active?: boolean
  /** Etiqueta del eje X en el punto señalado (el timestamp). */
  label?: string
  /** Series dibujadas en el punto señalado. */
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
 * mostramos un panel con el timestamp, la latencia media exacta y
 * los RPS de ese instante.
 *
 * ¿Por qué personalizarlo?
 * El tooltip nativo muestra los datos "crudos"; el nuestro los
 * formatea con unidades (ms, rps) y colores coherentes con la UI.
 *
 * Recharts llama a este componente renderizándolo con `active`,
 * `label`, `payload` — nosotros solo lo desestructuramos cuando
 * `active === true` (el resto del tiempo devolvemos null y el
 * tooltip no se dibuja).
 */
function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const serie = payload[0]
  // El punto ORIGINAL tiene todo el BenchmarkDataPoint; de ahí sale
  // el currentRps (que NO es una serie dibujada, solo se muestra aquí).
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
   ===================== COMPONENTE PRINCIPAL ==========================
   ===================================================================== */

/**
 * Gráfico de área con la evolución de la latencia en tiempo real.
 *
 * @param props - Ver BenchmarkChartProps.
 * @returns Tarjeta con el AreaChart y su leyenda de estado.
 */
export function BenchmarkChart({ timeSeries, isRunning }: BenchmarkChartProps) {
  // El identificador del degradado (SVG gradient id) debe ser UNICO en
  // la página; por eso lo prefijamos. Si hubiera dos gráficos con el
  // mismo id, el navegador usaría el primero (bug clásico de SVG).
  const GRADIENT_ID = 'benchmark-latency-gradient'

  return (
    // Contenedor: tokens del tema (bg-card/border) y esquinas suaves,
    // igual que el resto de tarjetas del módulo.
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      {/* Cabecera del gráfico con indicador de estado en vivo. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Evolución de Latencia y Rendimiento en Tiempo Real
        </h2>
        {/* Punto pulsante cuando la prueba corre: `animate-pulse` hace
            que la opacidad oscile, señal visual de actividad. */}
        {isRunning && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            EN VIVO
          </span>
        )}
      </div>

      {/* ------------------- ESTADO VACÍO -------------------
          Si aún no hay datos, mostramos un aviso en vez de un gráfico
          plano. `min-h` reserva el mismo espacio que cuando hay datos
          para evitar saltos de layout al lanzar la prueba. */}
      {timeSeries.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
          {isRunning
            ? 'Esperando el primer tick del motor...'
            : 'Lanza una prueba para ver la evolución de la latencia.'}
        </div>
      ) : (
        /* ------------------- GRÁFICO REACTIVO -------------------
           ResponsiveContainer: el ancho del gráfico se adapta al 100%
           del padre (no lo fijamos en px). `height` hay que dársela
           siempre a mano porque Recharts no puede medir alto dinámico. */
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timeSeries} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
            {/* Definiciones de SVG del gráfico: aquí va el degradado
                esmeralda. stopOpacity 1 -> 0 hace que el área "se
                desvanezca" hacia abajo, acabado tipo Grafana. */}
            <defs>
              <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                {/* #10b981 es el emerald-500 estándar de Tailwind. */}
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            {/* Rejilla sutil de fondo para leer mejor los valores. */}
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />

            {/* Eje X: timestamps HH:mm:ss (uno cada 500 ms). */}
            <XAxis
              dataKey="timestamp"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              stroke="var(--border)"
              minTickGap={40}
            />

            {/* Eje Y: latencia media en ms. La unidad se aclara en el
                título/tooltip, así el eje queda limpio de saltos. */}
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              stroke="var(--border)"
            />

            {/* Tooltip personalizado (ver ChartTooltip). */}
            <Tooltip content={<ChartTooltip />} />

            {/* El ÁREA: dibuja la línea (stroke) y el relleno (fill)
                con el gradiente. `averageLatency` es la clave de datos
                del punto (dataKey). `isAnimationActive` false: al
                llegar datos cada 500 ms no queremos animaciones que
                compitan/parpadeen, solo actualizaciones limpias. */}
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
      )}
    </div>
  )
}

export default BenchmarkChart