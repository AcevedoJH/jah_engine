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
 *        animada, P95 con semáforo de color, contadores de
 *        éxitos/fallos y una SPARKLINE (minigráfica) de tendencia
 *        de latencia. El flujo de datos entre ambos estados es:
 *        props -> renderizado condicional -> clases Tailwind.
 *
 * La transición visual la hace Tailwind por composición: en cada
 * render cambiamos las clases que se aplican (badge, relleno de la
 * barra, colores de cifras) y, cuando hay <transition-all>, el navegador
 * anima la diferencia. No hay librerías de animación: solo CSS.
 *
 * ¿POR QUÉ P95 Y NO P50 EN EL KPIs? La mediana (P50) describe al
 * usuario "promedio", pero un 50% padece latencias PEORES que esa
 * cifra. P95 es el estándar de la industria (SLO) para el caso
 * normal-malo: el 95% de las peticiones responden en <= P95, así que
 * representa la experiencia real de casi todos sin dejarse engañar
 * por un puñado de outliers (para eso está P99 en la vista completa).
 * Ver también el bloque de comentarios junto a la variable `p95`.
 *
 * ¿QUÉ ES UNA SPARKLINE? Una minigráfica sin ejes, cuadrícula ni
 * etiquetas: solo la forma de la serie. Su único trabajo es transmitir
 * de un vistazo la TENDENCIA (¿la latencia sube, baja o se mantiene?).
 * Se monta con los MISMOS bloques de Recharts que el gráfico grande,
 * pero silenciados (XAxis/YAxis con hide, sin Tooltip ni grid) y reusa
 * el MISMO degradado por umbrales: así la zona roja del degradado
 * coincide con los picos de la miniatura, como en la vista completa.
 */

import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
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
import { getLatencyColorClass, LATENCY_CAUTION_MAX_MS, LATENCY_OPTIMAL_MAX_MS } from '@/features/benchmark/utils/latency'
import { msToGradientOffset } from '@/features/benchmark/utils/gradient'

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
 * @param label      - Nombre de la métrica (ej. "P95").
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

  /* --------------------------------------------------------------
     SEMÁFORO DEL P95 (percentil de "cola" ligera)
     --------------------------------------------------------------
     Elegimos P95 como KPI del gadget por dos razones:
       1. La MEDIANA (P50) esconde los casos malos: el 50% peor de las
          peticiones queda por ENCIMA de lo que mostraríamos.
       2. P95 resume la "cola ligera": solo el 5% de las peticiones son
          más lentas que esto. Es el estándar de SLOs y resume bien, en
          UNA cifra, si la experiencia empeora o mejora.
     `getLatencyColorClass` es la misma función de umbrales de la vista
     detalle: verde < 100 ms, ámbar 100-400 ms, rojo > 400 ms. Compartir
     la función garantiza que semáforo y gráfico siempre coincidan. */
  const p95 = result.percentiles.p95
  const p95ColorClass = getLatencyColorClass(p95)

  /* --------------------------------------------------------------
     ESCALA DE LA SPARKLINE (mismo "lenguaje" que el gráfico grande)
     --------------------------------------------------------------
     La minigráfica no tiene ejes visibles, pero para que su degradado
     "signifique" lo mismo que el del gráfico completo necesita el MISMO
     dominio Y: techo = máximo del historial + 15% de margen. Con ese
     yMax calculamos los offset (%) de las paradas rojo/ámbar/verde
     mediante la utilidad compartida msToGradientOffset. De este modo
     un pico de 600 ms cae en la zona roja superior TANTO en la miniatura
     como en BenchmarkChart. */
  const rawMax = result.timeSeries.reduce(
    (max, punto) => Math.max(max, punto.averageLatency),
    0,
  )
  const yMaxSpark = Math.max(1, rawMax + rawMax * 0.15)
  const offsetCautela = msToGradientOffset(LATENCY_CAUTION_MAX_MS, yMaxSpark)
  const offsetOptimo = msToGradientOffset(LATENCY_OPTIMAL_MAX_MS, yMaxSpark)

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
                P95 coloreado por el semáforo de umbrales (verde/ámbar/
                rojo según la latencia de "cola ligera"); éxitos en
                verde y fallos en rojo, coherente con BenchmarkMetrics. */}
            <div className="grid grid-cols-3 gap-2">
              <MiniKpi
                label="P95"
                value={formatNumber(p95)}
                unit="ms"
                colorClass={p95ColorClass}
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

            {/* --- SPARKLINE: TENDENCIA DE LATENCIA ---
                Minigráfica de 50 px de alto entre los KPIs y el botón.
                ¿Por qué Recharts de nuevo? Reutiliza el MISMO pipeline
                (AreaChart + Area + dataKey averageLatency) que el
                gráfico de la vista completa, así la serie es idéntica.
                Configuración del modo "compacto/minimalista":
                  - <XAxis hide /> / <YAxis hide />: sin ejes dibujados.
                  - YAxis con domain [0, yMaxSpark] PERO oculto: la
                    escala sigue controlando el dibujo (así picos y
                    valles se colocan igual que en el gráfico grande).
                  - Sin <CartesianGrid> ni <Tooltip>: no hay ruido de
                    fondo ni tooltips pesados en una gráfica de 50 px.
                  - fill="url(#latencyGradient)": el degradado por
                    umbrales definido en <defs> (id único en esta página). */}
            <div className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Tendencia de latencia</span>
              {result.timeSeries.length === 0 ? (
                /* Primeros 500 ms del test: el motor aún no ha emitido
                    el primer tick, la serie está vacía. Un placeholder
                    honesto evita un área en blanco sin explicación. */
                <p className="flex h-[50px] items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                  Recolectando muestras...
                </p>
              ) : (
                <div className="rounded-md border border-border bg-card p-1">
                  <ResponsiveContainer width="100%" height={50}>
                    <AreaChart
                      data={result.timeSeries}
                      margin={{ top: 2, right: 2, bottom: 0, left: 2 }}
                    >
                      <defs>
                        {/* Degradado horizontal de la sparkline: mismo
                            esquema que BenchmarkChart, paradas rojas en
                            la cima (latencias altas) y verdes en la base. */}
                        <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                          <stop offset={`${offsetCautela}%`} stopColor="#fbbf24" stopOpacity={0.35} />
                          <stop offset={`${offsetOptimo}%`} stopColor="#10b981" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="timestamp" hide />
                      <YAxis domain={[0, yMaxSpark]} hide />
                      <Area
                        type="monotone"
                        dataKey="averageLatency"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="url(#latencyGradient)"
                        isAnimationActive={false}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
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