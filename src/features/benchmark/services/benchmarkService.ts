/**
 * ============================================================
 * JAH ENGINE - Mock Engine del Módulo Benchmark & Profiling
 * (src/features/benchmark/services/benchmarkService.ts)
 * ============================================================
 * Este archivo es el "corazón" del Módulo 2: una clase que simula
 * la ejecución de una prueba de estrés sin necesidad de un backend.
 *
 * ¿Qué resuelve? Reproduce el comportamiento de una herramienta de
 * load testing (como Artillery, k6 o Vegeta) de forma ABREVIADA:
 * genera peticiones "sintéticas" en ráfagas, calcula métricas de
 * latencia y las notifica en tiempo real a la UI.
 *
 * ¿Por qué `setInterval` y no un bucle for directamente?
 * 1. El navegador ejecuta JavaScript en UN solo hilo. Un bucle que
 *    procesara miles de peticiones de golpe BLOQUEARÍA la UI (no se
 *    vería la barra de progreso ni las gráficas animarse).
 * 2. `setInterval` delega la ejecución al Event Loop: el proceso
 *    principal queda libre entre ticks, la interfaz se mantiene
 *    fluida y podemos ir generando resultados progresivamente.
 *
 * NOTA DE DISEÑO: este Mock Engine es "fire and notify". Cada tick
 * llama a `onProgress(progress)` con el RESULTADO ACUMULADO hasta el
 * momento, no con deltas: así la UI nunca necesita reconstruir el
 * total, solo renderizar lo que recibe.
 */

import type {
  BenchmarkConfig,
  BenchmarkDataPoint,
  BenchmarkResult,
} from '../types/benchmark'

/* =====================================================================
   ======================= CONSTANTES DE TUNEO ==========================
   ===================================================================== */

/** Intervalo entre ráfagas de peticiones simuladas (ms). */
const TICK_INTERVAL_MS = 500

/** Mínimo y máximo de la latencia "normal" de una respuesta (ms). */
const BASE_LATENCY_MIN_MS = 20
const BASE_LATENCY_MAX_MS = 150

/** Comportamiento de "cola" (tail): un % pequeño de peticiones ve
 *  latencias mucho mayores, lo que dispara los percentiles p95/p99. */
const SPIKE_PROBABILITY = 0.05
const SPIKE_EXTRA_MIN_MS = 200
const SPIKE_EXTRA_MAX_MS = 600

/** La tasa de errores se elige una vez por prueba: 1% a 3%. */
const ERROR_RATE_MIN = 0.01
const ERROR_RATE_MAX = 0.03

/**
 * Cota para la ventana de muestras sobre la que se calculan los
 * percentiles. ¿Por qué acotar? Si una prueba lanzara millones de
 * peticiones, guardar TODAS las latencias exigiría mucha memoria.
 * Aquí conservamos las últimas MAX muestras (ventana FIFO).
 */
const MAX_PERCENTILE_SAMPLES = 5000

/** Cota del historial timeSeries enviado a la gráfica. */
const MAX_TIME_SERIES_POINTS = 200

/* =====================================================================
   ==================== HELPERS ESTADÍSTICOS ===========================
   ===================================================================== */

/**
 * Media aritmética de un conjunto de números.
 * Se usa para el campo `averageLatency` de cada dataPoint.
 *
 * @param values - Latencias de una ráfaga (ms).
 * @returns La media redondeada a entero (ms).
 */
function average(values: number[]): number {
  if (values.length === 0) return 0
  const total = values.reduce((acc, value) => acc + value, 0)
  return Math.round(total / values.length)
}

/**
 * Percentil por el método NEAREST-RANK (rango más cercano).
 *
 * Explicación del algoritmo:
 *   index = ceil( (p/100) * n ) - 1
 * Después de ORDENAR las muestras ascendente, el percentil `p` es el
 * valor que ocupa la posición `index` (0-indexada). Por ejemplo, con
 * 100 muestras, el p95 es la muestra 95 (posición 94).
 *
 * Es el método más simple y el que usa la mayoría de herramientas de
 * benchmark para p50/p90/p95/p99.
 *
 * @param sortedValues - Muestras ORDENADAS de menor a mayor.
 * @param percent       - Percentil a calcular (0 a 100).
 * @returns El valor del percentil, o 0 si no hay muestras.
 */
function percentile(sortedValues: number[], percent: number): number {
  if (sortedValues.length === 0) return 0
  // La posición "rankeada" buscada. `ceil` garantiza que para un
  // percentil alto haya al menos 1 muestra que lo supere.
  const index = Math.min(
    sortedValues.length - 1,
    Math.ceil((percent / 100) * sortedValues.length) - 1,
  )
  return sortedValues[Math.max(0, index)]
}

/**
 * Formatea un Date como `HH:mm:ss` (el timestamp de los dataPoints).
 * Se monta a mano (padStart) para no depender de locale ni librerías.
 *
 * @param date - Momento a formatear.
 * @returns String del reloj en format HH:mm:ss.
 */
function formatClockTime(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/* =====================================================================
   ======================== SERVICIO (MOCK) ============================
   ===================================================================== */

/**
 * Simula una prueba de estrés HTTP en tiempo real.
 *
 * Ciclo de vida por prueba:
 *   runSimulatedBenchmark(config, onProgress)
 *     -> (cada 500 ms) se procesa una ráfaga de `concurrency`
 *        peticiones y se emite un BenchmarkResult acumulado.
 *     -> al completar `totalRequests` se emite estado `completed`.
 *
 * Permite una única prueba simultánea: lanzar una nueva
 * automáticamente cancela la anterior.
 */
export class BenchmarkService {
  /** Identificador del setInterval activo (null cuando no corre). */
  private intervalId: ReturnType<typeof setInterval> | null = null

  /** Callback que la UI registra para recibir progreso. */
  private onProgress: ((progress: BenchmarkResult) => void) | null = null

  private config: BenchmarkConfig | null = null

  // --- Estado acumulado de la prueba actual ---
  private completedRequests = 0
  private successfulRequests = 0
  private failedRequests = 0

  /** Ventana de latencias (acotada a MAX_PERCENTILE_SAMPLES). */
  private latencies: number[] = []

  /** Historial de puntos para la gráfica en tiempo real. */
  private timeSeries: BenchmarkDataPoint[] = []

  /** Tasa de errores fijada por sorteo al inicio de cada prueba (1-3%). */
  private errorRate = ERROR_RATE_MIN

  /** true mientras exista una simulación en curso. */
  get isRunning(): boolean {
    return this.intervalId !== null
  }

  /**
   * Inicia una nueva prueba simulada.
   *
   * @param config    - Configuración de la carga (URL, método, etc.).
   * @param onProgress- Callback invocado en cada tick con el resultado
   *                    acumulado (también con el estado final).
   * @throws Error si la configuración no es válida.
   */
  runSimulatedBenchmark(
    config: BenchmarkConfig,
    onProgress: (progress: BenchmarkResult) => void,
  ): void {
    // --- Validación de configuración ---
    // El tipado garantiza el rango correcto, pero validamos también
    // en runtime: un 0 en concurrency haría un bucle infinito.
    if (!config.targetUrl) {
      throw new Error('BenchmarkService: targetUrl no puede estar vacía.')
    }
    if (config.concurrency < 1) {
      throw new Error('BenchmarkService: concurrency debe ser >= 1.')
    }
    if (config.totalRequests < 1) {
      throw new Error('BenchmarkService: totalRequests debe ser >= 1.')
    }

    // Cancelamos cualquier simulación anterior (guardia de reentrada).
    this.stopTimer()

    // --- Reinicio de estado para la nueva prueba ---
    this.config = config
    this.onProgress = onProgress
    this.completedRequests = 0
    this.successfulRequests = 0
    this.failedRequests = 0
    this.latencies = []
    this.timeSeries = []

    // La tasa de errores se sortea UNA vez por prueba, para que el
    // resultado de una misma prueba sea consistente en todos sus ticks.
    this.errorRate =
      ERROR_RATE_MIN + Math.random() * (ERROR_RATE_MAX - ERROR_RATE_MIN)

    // Emisión inicial con estado 'running': la UI muestra la prueba
    // activa desde el primer instante, aunque aún no haya peticiones.
    onProgress(this.buildResult('running'))

    // Programamos el bucle de ráfagas. El callback se ejecutará cada
    // TICK_INTERVAL_MS mientras el intervalo siga activo.
    this.intervalId = setInterval(() => {
      this.tick()
    }, TICK_INTERVAL_MS)
  }

  /**
   * Cancela la prueba en curso (si la hay): detiene el intervalo y
   * notifica un último progreso con estado 'failed' (cancelación).
   * Llamar varias veces es seguro (idempotente).
   */
  cancelBenchmark(): void {
    if (!this.isRunning) return
    this.stopTimer()

    // Notificamos el resultado final cancelado a la UI para que pueda
    // marcar la prueba como interrumpida (nunca como completada).
    if (this.onProgress) {
      const progress = this.buildResult('failed')
      this.onProgress(progress)
    }

    // Limpiamos referencias para dejar el servicio listo para una
    // nueva prueba.
    this.config = null
    this.onProgress = null
  }

  /**
   * Procesa UNA ráfaga de peticiones dentro del setInterval.
   *
   * Pasos:
   *   1. Calcula cuántas peticiones le tocan a esta ráfaga.
   *   2. Simula una a una (latencia, éxito/error).
   *   3. Construye un dataPoint y lo añade al timeSeries.
   *   4. Emite el resultado acumulado.
   *   5. Si ya se completaron todas, finaliza la prueba.
   */
  private tick(): void {
    if (!this.config) return

    const remaining = this.config.totalRequests - this.completedRequests
    // La última ráfaga suele ser parcial (le tocan las que queden).
    const batchSize = Math.min(this.config.concurrency, remaining)

    // Latencias de SOLO esta ráfaga (para el averageLatency del punto).
    const batchLatencies: number[] = []
    let batchErrors = 0

    for (let i = 0; i < batchSize; i++) {
      // ¿Esta petición falla? Comparamos un aleatorio [0,1) contra la
      // tasa de errores de la prueba: ~1-3% de peticiones fallarán.
      const isError = Math.random() < this.errorRate
      const latency = this.simulateRequestLatency(isError, this.config.timeoutMs)

      // Acumulamos la muestra en la ventana FIFO de percentiles.
      this.latencies.push(latency)
      if (this.latencies.length > MAX_PERCENTILE_SAMPLES) {
        // `shift` elimina la más antigua: O(n) pero suficiente para
        // un mock; en producción real esto sería un ring buffer.
        this.latencies.shift()
      }

      batchLatencies.push(latency)
      if (isError) {
        this.failedRequests++
        batchErrors++
      } else {
        this.successfulRequests++
      }
      this.completedRequests++
    }

    // --- DataPoint representativo de esta ráfaga ---
    // currentRps: batchSize peticiones en TICK_INTERVAL_MS segundos.
    const dataPoint: BenchmarkDataPoint = {
      timestamp: formatClockTime(new Date()),
      currentRps: Math.round(batchSize * (1000 / TICK_INTERVAL_MS)),
      averageLatency: average(batchLatencies),
      activeErrors: batchErrors,
    }
    this.timeSeries.push(dataPoint)

    // Acotamos el historial para que la gráfica no crezca sin límite
    // (si quitamos el elemento más viejo, la gráfica "desliza").
    if (this.timeSeries.length > MAX_TIME_SERIES_POINTS) {
      this.timeSeries.shift()
    }

    // Emitimos el estado intermedio.
    this.onProgress?.(this.buildResult('running'))

    // ¿La prueba terminó? Finalizamos limpiando el intervalo.
    if (this.completedRequests >= this.config.totalRequests) {
      this.finish()
    }
  }

  /**
   * Simula la latencia (ms) de UNA petición individual.
   *
   * Reglas del modelo:
   *   - Petición con error  -> cuenta TIME-OUT (timeoutMs). Así las
   *     peticiones fallidas inflan el p99, igual que en producción.
   *   - Petición normal     -> 20 a 150 ms.
   *   - "Spike" ocasional    -> latencia base + 200/600 ms extra
   *     (≈5% de las peticiones). Estos picos concentrados generan la
   *     cola pesada que separa p50 de p95/p99 en la gráfica.
   *
   * @param isError   - Si la petición representa un fallo (timeout).
   * @param timeoutMs - Límite de tiempo de la petición.
   * @returns Latencia simulada redondeada a entero (ms).
   */
  private simulateRequestLatency(isError: boolean, timeoutMs: number): number {
    if (isError) {
      return timeoutMs
    }

    const base =
      BASE_LATENCY_MIN_MS +
      Math.random() * (BASE_LATENCY_MAX_MS - BASE_LATENCY_MIN_MS)

    if (Math.random() < SPIKE_PROBABILITY) {
      const extra =
        SPIKE_EXTRA_MIN_MS +
        Math.random() * (SPIKE_EXTRA_MAX_MS - SPIKE_EXTRA_MIN_MS)
      return Math.round(base + extra)
    }

    return Math.round(base)
  }

  /**
   * Detiene el intervalo sin notificar (uso interno). No toca el
   * estado acumulado; simplemente apaga el "motor pulsante".
   */
  private stopTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /**
   * Da por finalizada la prueba con estado 'completed'.
   * Se llama exactamente cuando completedRequests llega al total.
   */
  private finish(): void {
    this.stopTimer()
    this.onProgress?.(this.buildResult('completed'))
    this.config = null
    this.onProgress = null
  }

  /**
   * Construye un objeto BenchmarkResult INMUTABLE a partir del estado
   * interno actual. Devuelve copias (nunca referencias a los arrays
   * internos) para que el hook/componente no pueda mutar el servicio
   * por error.
   *
   * @param status - Estado del ciclo de vida a reportar.
   * @returns Resultado acumulado listo para la UI.
   */
  private buildResult(status: BenchmarkResult['status']): BenchmarkResult {
    // Una copia ordenada de menor a mayor de las muestras: el
    // algoritmo de percentiles requiere entrada ordenada.
    const sorted = [...this.latencies].sort((a, b) => a - b)

    return {
      status,
      completedRequests: this.completedRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      percentiles: {
        p50: percentile(sorted, 50),
        p90: percentile(sorted, 90),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
      },
      timeSeries: this.timeSeries.map((point) => ({ ...point })),
    }
  }
}

/* =====================================================================
   ====================== EXTRA MÓDULO (SINGLETON) ======================
   ===================================================================== */

/**
 * Instancia singleton del Mock Engine (patrón módulo).
 *
 * ¿Por qué un singleton? El hook `useBenchmark` comparte la misma
 * simulación sin importar cuántos componentes la consuman. Además,
 * en tests se puede instanciar un `new BenchmarkService()` aislado.
 *
 * Ejemplo de uso:
 * ```ts
 * benchmarkService.runSimulatedBenchmark(config, (progress) => {
 *   console.log(progress.status, progress.percentiles.p95)
 * })
 * ```
 */
export const benchmarkService = new BenchmarkService()