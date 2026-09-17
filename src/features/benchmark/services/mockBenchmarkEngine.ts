/**
 * ============================================================
 * JAH ENGINE - Mock Engine del Módulo Benchmark & Profiling
 * (src/features/benchmark/services/mockBenchmarkEngine.ts)
 * ============================================================
 * Simula la ejecución de una prueba de estrés HTTP sin backend, de la
 * MISMA forma que luego hará el endpoint real `POST /benchmark/run`.
 *
 * ¿Por qué extraerlo a su propio archivo?
 * La capa pública `benchmarkService.ts` ahora es un FACADE (fachada)
 * que decide según `VITE_USE_MOCK_DATA` si delegar AQUÍ (mock) o al
 * backend (fetch). Separar el simulador permite:
 *   1. Tener un mock realista y autocontenido, con responsabilidad
 *      única (generar métricas falsas creíbles).
 *   2. Poder sustituir el BACKEND real más adelante sin tocar la UI:
 *      la página y el hook siempre llaman a `benchmarkService`.
 *
 * ¿Por qué una Promise y no callbacks directos?
 * El hook necesita un contrato igual al del backend. `POST /benchmark/run`
 * devuelve una Promise (la respuesta HTTP), así que el mock también:
 * `run(config)` -> Promise<BenchmarkResult>. La UI "sigue" el avance con
 * un `onProgress` OPCIONAL (streaming), igual que un WebSocket, pero el
 * valor de retorno se resuelve con el resultado final.
 *
 * ¿Por qué `setInterval` y no un bucle for directamente?
 * 1. El navegador ejecuta JavaScript en UN solo hilo. Un bucle que
 *    procesara miles de peticiones de golpe BLOQUEARÍA la UI (no se
 *    vería la barra de progreso ni las gráficas animarse).
 * 2. `setInterval` delega la ejecución al Event Loop: el proceso
 *    principal queda libre entre ticks, la interfaz se mantiene
 *    fluida y podemos ir generando resultados progresivamente.
 *
 * NOTA DE DISEÑO: el engine es "fire and notify". Cada tick llama a
 * `onProgress(progress)` con el RESULTADO ACUMULADO hasta el momento,
 * no con deltas: así la UI nunca necesita reconstruir el total, solo
 * renderizar lo que recibe.
 */

import type {
  BenchmarkConfig,
  BenchmarkDataPoint,
  BenchmarkResult,
} from '../types/benchmark'

/**
 * Error estándar de CANCELACIÓN. Cuando el usuario detiene la prueba,
 * la Promise rechaza con esta clase (y no con un Error genérico) para
 * que el hook pueda distinguir "cancelación voluntaria" de un fallo
 * real del servicio y no pintar un mensaje de error en la UI.
 */
export class BenchmarkAbortError extends Error {
  constructor() {
    super('Benchmark cancelado por el usuario.')
    this.name = 'BenchmarkAbortError'
  }
}

/* =====================================================================
   ======================= CONSTANTES DE TUNEO ==========================
   ===================================================================== */

/** Intervalo entre ráfagas de peticiones simuladas (ms). */
const TICK_INTERVAL_MS = 500

/** Duración objetivo de la prueba simulada con la config por defecto
 *  (~200 peticiones): 5 reposiciones × 500 ms ≈ 2.5 segundos. */
const TARGET_DURATION_MS = 2500

/** Reposiciones totales derivadas de la duración objetivo. */
const TOTAL_TICKS = Math.max(1, Math.round(TARGET_DURATION_MS / TICK_INTERVAL_MS))

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
 * El TTFB (Time To First Byte) es la demora hasta recibir la PRIMERA
 * parte de la respuesta. Es menor que la latencia total: aquí lo
 * modelamos como el 35-65% de la latencia de cada petición.
 */
const TTFB_RATIO_MIN = 0.35
const TTFB_RATIO_MAX = 0.65

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
 * Se usa para el campo `averageLatency` de cada dataPoint, el
 * `avgLatencyMs` del summary y el `ttfbMs`.
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
   ====================== MOCK BENCHMARK ENGINE ========================
   ===================================================================== */

/**
 * Simula una prueba de estrés HTTP en tiempo real y devuelve una
 * Promise con el resultado final (misma forma que tendrá el endpoint
 * real). Permite una única prueba simultánea: lanzar una nueva
 * cancela automáticamente la anterior.
 */
export class MockBenchmarkEngine {
  /** Identificador del setInterval activo (null cuando no corre). */
  private intervalId: ReturnType<typeof setInterval> | null = null

  /** Callback que la UI registra para recibir el streaming de progreso. */
  private onProgress: ((progress: BenchmarkResult) => void) | null = null

  /** Resolvers de la Promise en curso (null cuando no hay prueba). */
  private resolveTest: ((result: BenchmarkResult) => void) | null = null
  private rejectTest: ((reason: unknown) => void) | null = null

  private config: BenchmarkConfig | null = null

  // --- Estado acumulado de la prueba actual ---
  private completedRequests = 0
  private successfulRequests = 0
  private failedRequests = 0

  /** Ventana de latencias (acotada a MAX_PERCENTILE_SAMPLES). */
  private latencies: number[] = []

  /** Ventana de TTFB por petición (misma cota que latencias). */
  private ttfbSamples: number[] = []

  /** Historial de puntos para la gráfica en tiempo real. */
  private timeSeries: BenchmarkDataPoint[] = []

  /** Tasa de errores fijada por sorteo al inicio de cada prueba (1-3%). */
  private errorRate = ERROR_RATE_MIN

  /** Momento (epoch ms) en que arrancó la prueba, para el RPS global. */
  private startedAtMs = 0

  /** true mientras exista una simulación en curso. */
  get isRunning(): boolean {
    return this.intervalId !== null
  }

  /**
   * Inicia una nueva prueba simulada.
   *
   * @param config    - Configuración de la carga (URL, método, etc.).
   * @param onProgress- Callback OPCIONAL para el streaming de avance;
   *                    se invoca en cada tick con el resultado acumulado
   *                    (incluido el estado final).
   * @returns Promise que se resuelve con el resultado final 'completed',
   *          o se rechaza con `BenchmarkAbortError` si se cancela.
   * @throws Error si la configuración no es válida.
   */
  run(config: BenchmarkConfig, onProgress?: (progress: BenchmarkResult) => void): Promise<BenchmarkResult> {
    // --- Validación de configuración ---
    // El tipado garantiza el rango correcto, pero validamos también
    // en runtime: un 0 en concurrency haría un bucle infinito.
    if (!config.targetUrl) {
      throw new Error('MockBenchmarkEngine: targetUrl no puede estar vacía.')
    }
    if (config.concurrency < 1) {
      throw new Error('MockBenchmarkEngine: concurrency debe ser >= 1.')
    }
    if (config.totalRequests < 1) {
      throw new Error('MockBenchmarkEngine: totalRequests debe ser >= 1.')
    }

    // Cancelamos cualquier simulación anterior (guardia de reentrada).
    this.cancelInternal()

    // --- Reinicio de estado para la nueva prueba ---
    this.config = config
    this.onProgress = onProgress ?? null
    this.completedRequests = 0
    this.successfulRequests = 0
    this.failedRequests = 0
    this.latencies = []
    this.ttfbSamples = []
    this.timeSeries = []
    this.startedAtMs = Date.now()

    // La tasa de errores se sortea UNA vez por prueba, para que el
    // resultado de una misma prueba sea consistente en todos sus ticks.
    this.errorRate =
      ERROR_RATE_MIN + Math.random() * (ERROR_RATE_MAX - ERROR_RATE_MIN)

    return new Promise<BenchmarkResult>((resolve, reject) => {
      this.resolveTest = resolve
      this.rejectTest = reject

      // Emisión inicial con estado 'running': la UI muestra la prueba
      // activa desde el primer instante, aunque aún no haya peticiones.
      this.onProgress?.(this.buildResult('running'))

      // Programamos el bucle de ráfagas. El callback se ejecutará cada
      // TICK_INTERVAL_MS mientras el intervalo siga activo.
      this.intervalId = setInterval(() => {
        this.tick()
      }, TICK_INTERVAL_MS)
    })
  }

  /**
   * Cancela la prueba en curso (si la hay): detiene el intervalo,
   * notifica un último progreso con estado 'failed' (cancelación) y
   * RECHAZA la Promise pendiente con `BenchmarkAbortError`.
   * Llamar varias veces es seguro (idempotente).
   */
  cancel(): void {
    if (!this.isRunning) return
    this.cancelInternal()

    // Notificamos el resultado final cancelado a la UI para que pueda
    // marcar la prueba como interrumpida (nunca como completada).
    this.onProgress?.(this.buildResult('failed'))
  }

  /**
   * Detiene la simulación y rechaza la Promise pendiente SIN notificar
   * progreso. Uso interno: sirve de guardia de reentrada en `run` y lo
   * llama `cancel` para la notificación externa.
   */
  private cancelInternal(): void {
    this.stopTimer()
    if (this.rejectTest) {
      this.rejectTest(new BenchmarkAbortError())
    }
    this.resolveTest = null
    this.rejectTest = null
    this.onProgress = null
    this.config = null
  }

  /**
   * Procesa UNA ráfaga de peticiones dentro del setInterval.
   *
   * Pasos:
   *   1. Calcula cuántas peticiones le tocan a esta ráfaga.
   *   2. Simula una a una (latencia, TTFB, éxito/error).
   *   3. Construye un dataPoint y lo añade al timeSeries.
   *   4. Emite el resultado acumulado.
   *   5. Si ya se completaron todas, resuelve la Promise.
   */
  private tick(): void {
    if (!this.config) return

    // Distribuimos `totalRequests` entre las 5 reposiciones objetivo:
    // así la prueba de configuración por defecto dura ~2.5s y la
    // gráfica se "llena" sin terminar de golpe.
    const maxBatch = Math.max(1, Math.ceil(this.config.totalRequests / TOTAL_TICKS))
    const remaining = this.config.totalRequests - this.completedRequests
    // Respetamos la concurrencia configurada: nunca más de X simultáneas.
    const batchSize = Math.min(this.config.concurrency, maxBatch, remaining)

    // Latencias de SOLO esta ráfaga (para el averageLatency del punto).
    const batchLatencies: number[] = []
    let batchErrors = 0

    for (let i = 0; i < batchSize; i++) {
      // ¿Esta petición falla? Comparamos un aleatorio [0,1) contra la
      // tasa de errores de la prueba: ~1-3% de peticiones fallarán.
      const isError = Math.random() < this.errorRate
      const latency = this.simulateRequestLatency(isError, this.config.timeoutMs)
      const ttfb = this.simulateTtfb(latency, this.config.timeoutMs, isError)

      // Acumulamos las muestras en las ventanas FIFO.
      this.pushFifo(this.latencies, latency)
      this.pushFifo(this.ttfbSamples, ttfb)

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

    // Emitimos el estado intermedio (streaming).
    this.onProgress?.(this.buildResult('running'))

    // ¿La prueba terminó? Resolvemos la Promise con el resultado final.
    if (this.completedRequests >= this.config.totalRequests) {
      this.finish()
    }
  }

  /**
   * Inserta una muestra en una ventana FIFO acotada.
   * `shift` elimina la más antigua: O(n) pero suficiente para un mock;
   * en producción real esto sería un ring buffer.
   */
  private pushFifo(window: number[], value: number): void {
    window.push(value)
    if (window.length > MAX_PERCENTILE_SAMPLES) {
      window.shift()
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
   * Simula el Time To First Byte (ms) de una petición.
   * Modelo simple: entre el 35% y el 65% de la latencia total; en una
   * petición con error, el TTFB agota el timeout (no llega "primera
   * parte" útil de la respuesta).
   *
   * @param latency  - Latencia total simulada de la petición.
   * @param timeoutMs- Límite de tiempo de la petición.
   * @param isError  - Si la petición representa un fallo.
   * @returns TTFB simulado redondeado a entero (ms).
   */
  private simulateTtfb(latency: number, timeoutMs: number, isError: boolean): number {
    if (isError) {
      return timeoutMs
    }
    const ratio = TTFB_RATIO_MIN + Math.random() * (TTFB_RATIO_MAX - TTFB_RATIO_MIN)
    return Math.round(latency * ratio)
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
   * Da por finalizada la prueba con estado 'completed': emite el
   * resultado final por streaming y RESUELVE la Promise. Se llama
   * exactamente cuando completedRequests llega al total.
   */
  private finish(): void {
    this.stopTimer()
    const finalResult = this.buildResult('completed')
    this.onProgress?.(finalResult)
    this.resolveTest?.(finalResult)
    this.resolveTest = null
    this.rejectTest = null
    this.onProgress = null
    this.config = null
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

    // Segundos transcurridos desde el arranque para el RPS global.
    // `Math.max(0.25, ...)` evita valores absurdos en el primer tick.
    const elapsedSec = Math.max(0.25, (Date.now() - this.startedAtMs) / 1000)
    const requestsPerSecond = Math.round(this.completedRequests / elapsedSec)
    const successRate =
      this.completedRequests > 0
        ? Math.round((this.successfulRequests / this.completedRequests) * 100)
        : 0

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
      summary: {
        targetUrl: this.config?.targetUrl ?? '',
        method: this.config?.method ?? 'GET',
        concurrency: this.config?.concurrency ?? 0,
        ttfbMs: average(this.ttfbSamples),
        avgLatencyMs: average(this.latencies),
        requestsPerSecond,
        successRate,
      },
      timeSeries: this.timeSeries.map((point) => ({ ...point })),
    }
  }
}

/* =====================================================================
   ================== EXTRA MÓDULO (SINGLETON) ==========================
   ===================================================================== */

/**
 * Instancia singleton del Mock Engine (patrón módulo).
 *
 * ¿Por qué un singleton? El hook `useBenchmark` comparte la misma
 * simulación sin importar cuántos componentes la consuman. Además,
 * en tests se puede instanciar un `new MockBenchmarkEngine()` aislado.
 */
export const benchmarkSimulator = new MockBenchmarkEngine()