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

import { Gauge, PlayCircle, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BenchmarkChart } from '@/features/benchmark/components/BenchmarkChart'
import { BenchmarkForm } from '@/features/benchmark/components/BenchmarkForm'
import { BenchmarkMetrics } from '@/features/benchmark/components/BenchmarkMetrics'
import { useBenchmarkContext } from '@/features/benchmark/context/BenchmarkContext'
import { formatClockTimeFromNow } from '@/utils/format'
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
  const { config, result, isRunning, startTest, stopTest, resetTest } = useBenchmarkContext()

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
    </section>
  )
}

export default BenchmarkPage