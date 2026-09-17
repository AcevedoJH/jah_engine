/**
 * ============================================================
 * JAH ENGINE - Widget Benchmark & Profiling
 * (src/components/widgets/BenchmarkWidget.tsx)
 * ============================================================
 * Gadget del Dashboard para el Módulo 2. Es la pieza "presentacional":
 * NO consulta el motor ni el contexto directamente, sino que recibe
 * TODO su estado por PROPS y decide cómo pintarlo.
 *
 * ¿Por qué presentacional? Al separar "qué datos tengo" (el dueño) de
 * "cómo se ven" (el widget), el gadget es reutilizable y predecible:
 * mismo estado -> mismo JSX. Quien le inyecta los datos es la página
 * Dashboard, leyendo el ESTADO GLOBAL del benchmark (BenchmarkContext):
 * un estado elevado a la raíz para que la prueba lanzada en /benchmark
 * siga viva y visible aquí aunque hayamos navegado.
 *
 * RENDERIZADO CONDICIONAL (el corazón de este componente):
 * El widget conmuta entre DOS caras según el estado de la prueba:
 *
 *   ESTADO A - REPOSO: `result.status === 'idle'`
 *   (sin pruebas previas, ni en curso ni terminadas)
 *     -> Tarjeta informativa: descripción de la herramienta y botón
 *        "Ir a Benchmark" para lanzar una prueba.
 *
 *   ESTADO B - CUADRO DE MANDO: `result.status !== 'idle'`
 *   (una prueba está corriendo, terminó o fue detenida)
 *     -> Miniatura en vivo: badge de estado, barra de progreso
 *        animada, P50 con semáforo de color y contadores de
 *        éxitos/fallos. El flujo de datos entre ambos estados es:
 *        props -> renderizado condicional -> clases Tailwind.
 *
 * La transición visual la hace Tailwind por composición: en cada
 * render cambiamos las clases que se aplican (badge, relleno de la
 * barra, colores de cifras) y, cuando hay <transition-all>, el navegador
 * anima la diferencia. No hay librerías de animación: solo CSS.
 */

import type { ReactNode } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  Gauge,
  Timer,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/utils/cn'
import { formatNumber } from '@/utils/format'
import type { BenchmarkResult, BenchmarkRuntimeStatus } from '@/features/benchmark/types/benchmark'
import { calculateProgress } from '@/features/benchmark/utils/progress'
import { getLatencyColorClass } from '@/features/benchmark/utils/latency'

/* =====================================================================
   ======================== PROPS DEL COMPONENTE =======================
   ===================================================================== */

/**
 * Propiedades que acepta el gadget del Dashboard.
 *
 * @param isRunning           - true mientras el servicio simula. Define
 *                              el badge parpadeante "EN EJECUCIÓN".
 * @param result              - Progreso acumulado de la prueba (llega
 *                              desde el contexto global). Contiene
 *                              completedRequests, successfulRequests,
 *                              failedRequests, percentiles y status.
 * @param totalRequests       - Total de peticiones solicitadas. NO vive
 *                              dentro de `result` (aquel objeto guarda
 *                              lo emitido por el motor); se pasa aparte
 *                              desde la config activa para poder calcular
 *                              el porcentaje de progreso.
 * @param onNavigateToBenchmark - Callback opcional para llevar al usuario
 *                              a la vista completa `/benchmark`. En la
 *                              práctica el Dashboard lo cablea a
 *                              `navigate('/benchmark')` (React Router).
 */
export interface BenchmarkWidgetProps {
  isRunning: boolean
  result: BenchmarkResult
  totalRequests: number
  onNavigateToBenchmark?: () => void
}

/* =====================================================================
   ======================== DATOS DE PRESENTACIÓN ======================
   ===================================================================== */

/** Mapa estado -> etiqueta legible para el badge del cuadro de mando. */
const STATUS_LABELS: Record<BenchmarkRuntimeStatus, string> = {
  idle: 'Listo para lanzar',
  running: 'EN EJECUCIÓN',
  completed: 'TEST COMPLETADO',
  failed: 'TEST DETENIDO',
}

/* =====================================================================
   ================== COMPONENTE AUXILIAR: MiniKpi =====================
   ===================================================================== */

/**
 * Celda compacta del cuadro de mando (una métrica clave).
 * Componente puro interno: no se exporta, solo organiza el JSX.
 *
 * @param label      - Nombre de la métrica (ej. "P50").
 * @param value      - Valor formateado (ej. "128").
 * @param unit       - Unidad opcional mostrada tras el valor ("ms").
 * @param colorClass - Clase Tailwind del color de la cifra. Así el
 *                     color lo decide el padre (semáforo de latencia,
 *                     verde/rojo de contadores) y no esta celda.
 * @param icon       - Icono lucide (ReactNode) mostrado junto a la etiqueta.
 */
function MiniKpi({
  label,
  value,
  unit,
  colorClass,
  icon,
}: {
  label: string
  value: string
  unit?: string
  colorClass: string
  icon: ReactNode
}) {
  return (
    <div className="rounded-lg border bg-muted p-2.5">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn('mt-0.5 font-mono text-base font-semibold', colorClass)}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}

/* =====================================================================
   ==================== COMPONENTE PRINCIPAL ===========================
   ===================================================================== */

/**
 * Gadget interactivo de Benchmark & Profiling para el Dashboard.
 *
 * @param props - Ver BenchmarkWidgetProps.
 * @returns Tarjeta que alterna entre modo informativo y cuadro de mando.
 */
export function BenchmarkWidget({
  isRunning,
  result,
  totalRequests,
  onNavigateToBenchmark,
}: BenchmarkWidgetProps) {
  /* --------------------------------------------------------------
     ESTADO DERIVADO (decisiones de presentación)
     --------------------------------------------------------------
     `hasBenchmarkData` es la bisagra del renderizado condicional:
     el motor deja el status en 'idle' SOLO cuando no ha habido una
     prueba (o tras reiniciar). Cualquier otro status ('running',
     'completed' o 'failed') significa que hay datos que mostrar y
     merece la pena cambiar el gadget al cuadro de mando. */
  const hasBenchmarkData = result.status !== 'idle'

  // Porcentaje de avance, compartido por la barra (util centralizado).
  const progressPct = calculateProgress(result.completedRequests, totalRequests)

  // Semáforo del P50: la misma función de umbrales que usa la vista
  // detalle garantiza coherencia visual entre Dashboard y /benchmark.
  const p50 = result.percentiles.p50
  const p50ColorClass = getLatencyColorClass(p50)

  // El relleno de la barra es verde mientras hay vida ('running' o
  // terminó 'completed'); neutro si la prueba fue detenida o falló.
  const isProgressActive =
    result.status === 'running' || result.status === 'completed'

  /* --------------------------------------------------------------
     ESTILOS REACTIVOS DEL BADGE (Tailwind condicional)
     --------------------------------------------------------------
     La spec del widget pide dos señales visuales segun la fuente de
     verdad `isRunning`:
     - Mientras es true : badge esmeralda PARPADEANTE (animate-pulse)
                          con "EN EJECUCIÓN": hay actividad ahora mismo.
     - Cuando pasa a false y el motor informo 'completed': esmeralda
       fija con "TEST COMPLETADO" (termino con exito).
     - 'failed' : rosa (detenida/cancelada).
     - idle     : neutro (solo visible en el caso de que el badge se
                  pinte; en el modo reposo no se muestra). */
  const statusBadgeClass =
    isRunning
      ? 'bg-emerald-500/15 text-emerald-400 animate-pulse'
      : result.status === 'completed'
        ? 'bg-emerald-500/15 text-emerald-400'
        : result.status === 'failed'
          ? 'bg-rose-600/15 text-rose-400'
          : 'bg-muted text-muted-foreground'

  // Navegación delegada: este widget no sabe cómo navegar; solo pide
  // "llévame a la vista completa" y quien lo montó decide cómo.
  function handleNavigateToBenchmark() {
    onNavigateToBenchmark?.()
  }

  return (
    <Card>
      {/* Cabecera común a ambos estados: título + badge reactivo. */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Benchmark &amp; Profiling</CardTitle>
          </div>
          {/* El badge solo tiene sentido cuando hay datos que reportar;
              en reposo el hueco lo ocupa la descripción inferior. */}
          {hasBenchmarkData && (
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                statusBadgeClass,
              )}
            >
              {STATUS_LABELS[result.status]}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasBenchmarkData ? (
          /* ==========================================================
             ESTADO B: CUADRO DE MANDO EN MINIATURA
             ==========================================================
             Cuando hay actividad (isRunning true o prueba ya hecha),
             el gadget se "transforma" en panel compacto. Cada cifra se
             actualiza sola porque llegan nuevos `result` por props en
             cada tick del motor (500 ms) y React re-renderiza. */
          <>
            {/* --- BARRA DE PROGRESO (mini) ---
                Pista y relleno con los mismos tokens que la vista de
                detalle (bg-background + ring-border para la pista;
                relleno emerald). `width` en style se anima con
                transition-all. */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Progreso</span>
                <span className="font-mono text-foreground">{progressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-background ring-1 ring-border">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    isProgressActive ? 'bg-emerald-500' : 'bg-muted-foreground/30',
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* --- KPIs EN MINIATURA ---
                P50 coloreado por el semáforo de umbrales; éxitos en
                verde y fallos en rojo, coherente con BenchmarkMetrics. */}
            <div className="grid grid-cols-3 gap-2">
              <MiniKpi
                label="P50"
                value={formatNumber(p50)}
                unit="ms"
                colorClass={p50ColorClass}
                icon={<Timer className="h-3 w-3" />}
              />
              <MiniKpi
                label="Exitosas"
                value={formatNumber(result.successfulRequests)}
                colorClass="text-emerald-500"
                icon={<CheckCircle2 className="h-3 w-3" />}
              />
              <MiniKpi
                label="Fallidas"
                value={formatNumber(result.failedRequests)}
                colorClass="text-rose-500"
                icon={<XCircle className="h-3 w-3" />}
              />
            </div>

            {/* --- ENLACE RÁPIDO A LA VISTA COMPLETA --- */}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleNavigateToBenchmark}
            >
              Ver detalles completos
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          /* ==========================================================
             ESTADO A: REPOSO (modo informativo)
             ==========================================================
             Sin pruebas previas: el widget actúa como una tarjeta
             introductoria que explica el módulo y ofrece la acción
             para entrar en él y lanzar su primera prueba. */
          <>
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Timer className="h-3.5 w-3.5 shrink-0" />
              Lanza pruebas de estrés HTTP y mide percentiles p95/p99,
              throughput y uso de recursos.
            </CardDescription>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleNavigateToBenchmark}
            >
              Lanzar Prueba
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default BenchmarkWidget