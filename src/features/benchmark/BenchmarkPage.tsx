/**
 * ============================================================
 * JAH ENGINE - Pagina Benchmark & Profiling
 * (src/features/benchmark/BenchmarkPage.tsx)
 * ============================================================
 * Vista COMPLETA del Modulo 2: integra el formulario de configuracion
 * (BenchmarkForm) con el motor de simulacion (via el hook useBenchmark)
 * y muestra el estado del resultado para que el usuario vea el avance.
 *
 * ¿Como "conmuta" la vista de HomeLab a la vista de Benchmark?
 * La aplicacion usa React Router (URL como estado de navegacion), no
 * un `setActiveTab` manual:
 *   - La sidebar usa <NavLink to="/benchmark">.
 *   - El gadget del dashboard ejecuta navigate('/benchmark').
 * Ambas acciones cambian la URL a /benchmark, y React Router hace dos
 * cosas en cadena:
 *     1. Desmonta DashboardPage (la vista HomeLab) y monta BenchmarkPage.
 *     2. Como el modulo se desmonta/remonta, useBenchmark inicia su
 *        "limpieza" (cancelar simulacion) y su estado se reinicia.
 * De ahí que el hook viva DENTRO de esta pagina: encapsula el ciclo
 * de vida completo de la prueba junto al componente que la muestra.
 *
 * PALETA DE COLOR: como el resto del proyecto, esta pagina usa los
 * DESIGN TOKENS de Shadcn (bg-card, border, text-foreground,
 * text-muted-foreground, bg-muted...) en lugar de colores fijos.
 * Así la vista es coherente con la del network/dashboard en tema
 * claro y oscuro.
 */

import { Gauge, PlayCircle, Square } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BenchmarkForm } from '@/features/benchmark/components/BenchmarkForm'
import { useBenchmark } from '@/features/benchmark/hooks/useBenchmark'
import { formatClockTimeFromNow, formatNumber } from '@/utils/format'
import type { BenchmarkRuntimeStatus } from '@/features/benchmark/types/benchmark'

/** Mapa estado -> texto legible para la UI. */
const STATUS_LABELS: Record<BenchmarkRuntimeStatus, string> = {
  idle: 'Inactivo',
  running: 'En ejecución',
  completed: 'Completado',
  failed: 'Detenido',
}

/**
 * Estilos de fondo del badge de estado por each estado.
 * - running/completed -> emerald (acción positiva, igual que éxito).
 * - failed            -> rose (detenido/cancelado).
 * - idle              -> muted (neutro).
 */
const STATUS_STYLES: Record<BenchmarkRuntimeStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-emerald-500/15 text-emerald-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-rose-600/15 text-rose-400',
}

/** Vista completa del motor de benchmarking (formulario + estado). */
export function BenchmarkPage() {
  // Instanciamos el hook UNA vez por pagina. Sus estados y funciones
  // se cablean directamente a los props del formulario:
  //   - onSubmit -> startTest(config): el formulario entrega la config
  //     validada y el hook la delega al servicio de simulacion.
  //   - isRunning-> isRunning: el formulario deshabilita inputs y
  //     cambia el boton a "Detener" cuando la prueba corre.
  //   - onCancel -> stopTest(): el formulario detiene la prueba activa.
  // Tambien consumimos `result` para pintar el avance en tiempo real.
  const { config, result, isRunning, startTest, stopTest } = useBenchmark()

  /**
   * Timestamp de `result` es un reloj HH:mm:ss sin fecha, asi que lo
   * volvemos legible con un helper propio de utils/format.
   * Devuelve la hora actual formateada (igual formato que el servicio).
   */
  const nowLabel = formatClockTimeFromNow()

  return (
    <section className="space-y-6">
      {/* Cabecera: identifica la vista dentro de la navegacion. */}
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Gauge className="h-6 w-6 text-primary" /> Benchmark &amp; Profiling
        </h1>
        <p className="text-sm text-muted-foreground">
          Configura y lanza pruebas de estrés HTTP con métricas de latencia en tiempo real.
        </p>
      </header>

      {/* ============================================================
          FORMULARIO DE CONFIGURACION
         ============================================================
         El formulario es un componente "tonto": no sabe nada de la
         simulacion. Aqui le inyectamos las funciones del hook. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Configuración de la prueba</CardTitle>
          {/* Badge de estado: se actualiza por cada tick del motor.
              Usamos un <span> con los estilos de STATUS_STYLES en vez
              del componente <Badge> porque aquí queremos un badge
              plano sin borde (menos ruido visual en una tarjeta). */}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[result.status]}`}>
            {STATUS_LABELS[result.status]}
          </span>
        </CardHeader>
        <CardContent>
          <BenchmarkForm onSubmit={startTest} isRunning={isRunning} onCancel={stopTest} />
        </CardContent>
      </Card>

      {/* ============================================================
          RESUMEN DEL RESULTADO (tiempo real)
         ============================================================
         Mientras el motor emite progreso, aqui se refleja el estado
         acumulado: contadores y percentiles. Es la primera ventana de
         datos del modulo; en un paso posterior las graficas Recharts
         sustituiran/ampliaran esta tabla.
         Las celdillas usan tokens del tema (border, bg-muted) para
         que combinen con las tarjetas del resto del dashboard. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resultado acumulado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tres contadores principales de la prueba. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Completadas</p>
              <p className="mt-1 text-xl font-semibold text-foreground">
                {formatNumber(result.completedRequests)}
              </p>
            </div>
            <div className="rounded-md border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Exitosas (2xx/3xx)</p>
              <p className="mt-1 text-xl font-semibold text-emerald-500">
                {formatNumber(result.successfulRequests)}
              </p>
            </div>
            <div className="rounded-md border bg-muted p-3">
              <p className="text-xs text-muted-foreground">Fallidas (4xx/5xx/timeout)</p>
              <p className="mt-1 text-xl font-semibold text-rose-500">
                {formatNumber(result.failedRequests)}
              </p>
            </div>
          </div>

          {/* Percentiles de latencia: el corazon estadistico del modulo. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['p50', result.percentiles.p50],
                ['p90', result.percentiles.p90],
                ['p95', result.percentiles.p95],
                ['p99', result.percentiles.p99],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Percentil {label}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {formatNumber(value)} <span className="text-xs text-muted-foreground">ms</span>
                </p>
              </div>
            ))}
          </div>

          {/* Pie informativo: config activa + ultimo tick recibido. */}
          <p className="text-xs text-muted-foreground">
            Config activa: <span className="text-foreground">{config.method}</span> ·{' '}
            <span className="text-foreground">{config.targetUrl}</span> · Concurrencia{' '}
            <span className="text-foreground">{config.concurrency}</span> · Último tick{' '}
            <span className="text-foreground">{result.timeSeries.length > 0 ? result.timeSeries[result.timeSeries.length - 1].timestamp : nowLabel}</span>
          </p>
        </CardContent>
      </Card>

      {/* Accion de calidad de vida: boton ilustrativo del estado. */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isRunning ? (
          <Square className="h-3.5 w-3.5 text-rose-500" />
        ) : (
          <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
        )}
        {isRunning
          ? `Simulación en marcha contra ${config.targetUrl} (${config.concurrency} peticiones concurrentes).`
          : `La simulación está detenida. Configura los parámetros y pulsa "Iniciar Benchmark".`}
      </div>
    </section>
  )
}

export default BenchmarkPage