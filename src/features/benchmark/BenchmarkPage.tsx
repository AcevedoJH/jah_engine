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
 *     2. El estado NO se pierde: desde el refactor del widget global,
 *        `useBenchmark` vive en <BenchmarkProvider> (raiz de la app) y
 *        aqui lo consume via useBenchmarkContext(). Por eso una prueba
 *        iniciada en esta pagina sigue viva si navegas al Dashboard:
 *        su gadget la muestra en tiempo real en el cuadro de mando.
 *
 * PALETA DE COLOR: como el resto del proyecto, esta pagina usa los
 * DESIGN TOKENS de Shadcn (bg-card, border, text-foreground,
 * text-muted-foreground, bg-muted...) en lugar de colores fijos.
 * Así la vista es coherente con la del network/dashboard en tema
 * claro y oscuro.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Gauge, History, PlayCircle, RefreshCw, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BackToDashboardButton } from '@/components/layout/BackToDashboardButton'
import { BenchmarkChart } from '@/features/benchmark/components/BenchmarkChart'
import { BenchmarkForm } from '@/features/benchmark/components/BenchmarkForm'
import { BenchmarkMetrics } from '@/features/benchmark/components/BenchmarkMetrics'
import { useBenchmarkContext } from '@/features/benchmark/context/BenchmarkContext'
import { getBenchmarkHistory } from '@/features/benchmark/services/benchmarkService'
import type { BenchmarkHistoryItem, BenchmarkRuntimeStatus } from '@/features/benchmark/types/benchmark'
import { formatClockTimeFromNow, formatLatency, formatNumber, formatPercent } from '@/utils/format'

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

/**
 * Una métrica del "titular" de la prueba (bloque de resumen agregado).
 * Componente puro de presentación: recibe etiqueta + valor ya formateado.
 */
function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-base font-semibold text-foreground">{value}</p>
    </div>
  )
}

/**
 * Formatea una fecha ISO del historial a "dd/mm, HH:MM" en locale español.
 * Es un helper local de presentación (puro), como los de utils/format.
 */
function formatHistoryDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Vista completa del motor de benchmarking (formulario + estado). */
export function BenchmarkPage() {
  // Consumimos el ESTADO GLOBAL del benchmark desde el Context (provisto
  // por <BenchmarkProvider> en la raiz). Sus estados y funciones se
  // cablean directamente a los props del formulario:
  //   - onSubmit -> startTest(config): el formulario entrega la config
  //     validada y el hook la delega al servicio de simulacion.
  //   - isRunning-> isRunning: el formulario deshabilita inputs y
  //     cambia el boton a "Detener" cuando la prueba corre.
  //   - onCancel -> stopTest(): el formulario detiene la prueba activa.
  // Tambien consumimos `result` para pintar el avance en tiempo real.
  // `resetTest` (del contexto global) es la accion "Limpiar Resultados":
  // cancela la simulacion si la hubiera y vuelve el estado a 'idle'.
  const { config, result, isRunning, error, startTest, stopTest, resetTest } = useBenchmarkContext()

  /**
   * Timestamp de `result` es un reloj HH:mm:ss sin fecha, asi que lo
   * volvemos legible con un helper propio de utils/format.
   * Devuelve la hora actual formateada (igual formato que el servicio).
   */
  const nowLabel = formatClockTimeFromNow()

  /* ============================================================
     HISTORIAL DE PRUEBAS (estado LOCAL de la página)
     ------------------------------------------------------------
     El historial es un recurso SOLO de esta vista (no alimenta al
     Dashboard), así que NO necesita subir al Context: se carga bajo
     demanda aquí, consumiendo la MISMA capa de servicio
     (getBenchmarkHistory). Esto demuestra el patrón de fetch on mount
     que también usa useTelemetry: estado de carga + error + reintentar.
     ============================================================ */

  /** Tests previos cargados desde la capa de servicio (null = sin datos). */
  const [history, setHistory] = useState<BenchmarkHistoryItem[] | null>(null)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  /** Contador para forzar la recarga del historial ("Reintentar").
   *  Al incrementarlo, el efecto se re-ejecuta (es su dependencia). */
  const [historyReloadKey, setHistoryReloadKey] = useState(0)

  /** Guardia anti-desmontaje para las actualizaciones async del historial. */
  const historyMountedRef = useRef(true)

  /**
   * Carga el historial desde la capa de servicio. Definida como función
   * async (patrón canónico de data fetching, como en useTelemetry) para
   * mantener el manejo err/loading fuera del JSX.
   */
  const loadHistory = useCallback(async () => {
    setIsHistoryLoading(true)
    setHistoryError(null)
    try {
      const items = await getBenchmarkHistory()
      // Solo actualizamos si la página sigue montada.
      if (historyMountedRef.current) {
        setHistory(items)
        setIsHistoryLoading(false)
      }
    } catch (err: unknown) {
      if (!historyMountedRef.current) return
      const message = err instanceof Error ? err.message : 'Error desconocido al cargar el historial.'
      setHistoryError(message)
      setIsHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    historyMountedRef.current = true

    // EXCEPCIÓN DOCUMENTADA (igual que en useTelemetry): es el patrón
    // canónico de "fetch on mount" en React. `loadHistory` va a pedir
    // datos y, al volver, actualizar estados; la regla
    // react/set-state-in-effect apunta a reacciones a props/estado,
    // no a peticiones de red. Por eso la desactivamos puntualmente.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadHistory()

    return () => {
      historyMountedRef.current = false
    }
  }, [loadHistory, historyReloadKey])

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
          ERROR DE EJECUCIÓN (si lo hubo)
         ============================================================
         El hook expone `error` solo ante fallos REALES del servicio
         (p. ej. el backend responde HTTP 500). Las cancelaciones
         voluntarias no se muestran aquí: son un estado normal de la
         prueba ('Detenido'), no un error. */}
      {error !== null && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Error al ejecutar el benchmark: {error}
        </div>
      )}

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
         Delegamos TODA la presentación de métricas al componente
         BenchmarkMetrics, que es "puro": recibe el resultado por
         props y no conoce el motor. Aquí solo mantenemos la tarjeta
         contenedora, la nota de la última actualización y la acción
         de "Limpiar Resultados". */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Resultado acumulado</CardTitle>

          {/* =================================================
              BOTÓN "LIMPIAR RESULTADOS" (reinicio del módulo)
              ---------------------------------------------
              Conectado a `resetTest()` del hook (vía contexto):
              cancela la simulación en curso y restaura el estado
              inicial 'idle'. Ese cambio de estado se PROPAGA por el
              contexto global: el miniwidget del Dashboard vuelve
              automáticamente a su pantalla de reposo.
              ¿Por qué estilizado con variant="outline" y no con el
              ejemplo fijo `border-slate-700`? El proyecto usa design
              tokens de Shadcn: `outline` se dibuja con border-border
              y hover:bg-muted, coherente con el tema claro/oscuro.
              ¿Por qué deshabilitado durante la ejecución? Para limpiar
              datos a mitad de un test no tiene sentido; la vía correcta
              es "Detener Prueba" y, ya detenido, limpiar. Así evitamos
              destruir telemetría en vivo por un clic accidental. */}
          <Button
            variant="outline"
            size="sm"
            onClick={resetTest}
            disabled={isRunning}
            title={isRunning ? 'Detén la prueba antes de limpiar los resultados' : 'Vuelve el módulo a su estado inicial'}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Limpiar Resultados
          </Button>
        </CardHeader>
        <CardContent>
          {/* El componente hijo recibe el resultado emitido por cada
              tick y el total solicitado (necesario para el % de
              progreso). Solo se re-renderiza cuando estos cambian. */}
          <BenchmarkMetrics result={result} totalRequests={config.totalRequests} />

          {/* Bloque de "titulares" (summary agregado): una mirada de un
              vistazo a la prueba. Solo se muestra cuando ya hay muestras.
              Viene poblado por el propio resultado del motor/API. */}
          {result.completedRequests > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-4">
              <SummaryMetric label="Latencia media" value={formatLatency(result.summary.avgLatencyMs)} />
              <SummaryMetric label="TTFB medio" value={formatLatency(result.summary.ttfbMs)} />
              <SummaryMetric label="RPS promedio" value={formatNumber(result.summary.requestsPerSecond)} />
              <SummaryMetric label="Tasa de éxito" value={formatPercent(result.summary.successRate)} />
            </div>
          )}

          {/* Pie informativo: config activa + ultimo tick recibido. */}
          <p className="mt-4 text-xs text-muted-foreground">
            Config activa: <span className="text-foreground">{config.method}</span> ·{' '}
            <span className="text-foreground">{config.targetUrl}</span> · Concurrencia{' '}
            <span className="text-foreground">{config.concurrency}</span> · Último tick{' '}
            <span className="text-foreground">{result.timeSeries.length > 0 ? result.timeSeries[result.timeSeries.length - 1].timestamp : nowLabel}</span>
          </p>
        </CardContent>
      </Card>

      {/* ============================================================
          GRAFICO DE LATENCIA EN TIEMPO REAL
         ============================================================
         Renderizado justo debajo de las tarjetas de resultado. Recibe
         el `timeSeries` acumulado por el motor y el flag isRunning.
         Cada tick nuevo del motor provoca un re-render con un punto
         más: Recharts redibuja la serie de forma continua (la flecha
         de datos llega por props, sin polling en este componente). */}
      <BenchmarkChart timeSeries={result.timeSeries} isRunning={isRunning} />

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

      {/* ============================================================
          HISTORIAL DE PRUEBAS PREVIAS
         ============================================================
         Cargado bajo demanda desde la capa de servicio. Muestra los
         "titulares" de cada prueba (summary) con su fecha. En modo mock
         proviene de mockBenchmarkHistory; en modo real, del backend. */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Historial de pruebas
          </CardTitle>
          {/* Carga inicial, error o botón de reintentar. */}
          {historyError !== null && (
            <Button variant="outline" size="sm" onClick={() => setHistoryReloadKey((key) => key + 1)}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Reintentar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {historyError !== null ? (
            <p className="text-sm text-destructive">No se pudo cargar el historial: {historyError}</p>
          ) : isHistoryLoading ? (
            <p className="text-sm text-muted-foreground">Cargando historial…</p>
          ) : history === null || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay pruebas registradas.</p>
          ) : (
            <ul className="divide-y">
              {history.map((item) => (
                <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-foreground">
                      {item.summary.method} {item.summary.targetUrl}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatHistoryDate(item.finishedAt)} · Concurrencia {item.summary.concurrency}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-4 text-xs text-muted-foreground">
                    <span>TTFB <span className="font-mono text-foreground">{formatLatency(item.summary.ttfbMs)}</span></span>
                    <span>Media <span className="font-mono text-foreground">{formatLatency(item.summary.avgLatencyMs)}</span></span>
                    <span>RPS <span className="font-mono text-foreground">{formatNumber(item.summary.requestsPerSecond)}</span></span>
                    <span className={item.summary.successRate >= 95 ? 'text-emerald-500' : 'text-rose-500'}>
                      {formatPercent(item.summary.successRate)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ============================================================
          VOLVER AL DASHBOARD (navegacion de retorno)
         ============================================================
         Componente COMPARTIDO del layout (BackToDashboardButton): ancho
         completo en movil para el pulgar y discreto (md:w-auto) en
         escritorio. ¿Por que hace falta si existe la sidebar?
           - MOVIL: la sidebar esta oculta (hidden en <md), asi que este
             control es el "boton de volver" nativo que espera el usuario.
           - ESCRITORIO: tras mucho scroll en <main>, el menu queda fuera
             de vista; el boton evita viajar hasta arriba. */}
      <BackToDashboardButton className="mt-2" />
    </section>
  )
}

export default BenchmarkPage