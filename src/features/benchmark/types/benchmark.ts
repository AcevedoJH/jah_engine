/**
 * ============================================================
 * JAH ENGINE - Tipos del Módulo Benchmark & Profiling
 * (src/features/benchmark/types/benchmark.ts)
 * ============================================================
 * Definimos el "contrato de datos" interno del módulo: las formas
 * exactas que tendrán la configuración de una prueba de estrés,
 * las métricas de latencia y el resultado progresivo que el Mock
 * Engine notificará a la UI.
 *
 * ¿Por qué ubicarlos dentro de la feature y no en src/types?
 * src/types/index.ts define los "contratos de transporte" con el
 * backend (lo que viaja por WebSocket: benchmark.progress, etc.).
 * En cambio, ESTOS tipos son el contrato interno del módulo, con
 * el detalle que necesita el frontend (timeSeries para gráficas,
 * contadores granulares...). Es una separacion de preocupaciones
 * tipica de la arquitectura por features (feature-first).
 *
 * ¿Por qué `string literal unions` y no `enum`?
 * El tsconfig activa `erasableSyntaxOnly`, que prohíbe los enums
 * porque generan código en runtime. Las uniones de strings son
 * 100% estáticas, sin runtime, y TypeScript las valida igual.
 */

/* =====================================================================
   ======================== CONFIGURACIÓN ==============================
   ===================================================================== */

/**
 * Métodos HTTP permitidos para la prueba de estrés.
 * Al tiparlo como union de literales, TypeScript autocompleta y
 * rechaza cualquier método inválido en tiempo de compilación.
 */
export type BenchmarkHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

/**
 * Configuración inicial de una prueba de carga (lo que el usuario
 * rellena en el formulario antes de lanzar la prueba).
 *
 * @param targetUrl     - URL objetivo que recibe la carga.
 * @param method        - Método HTTP a usar en cada petición.
 * @param concurrency   - Peticiones simultáneas (1 a 100). En tests
 *                        reales, subir este valor = más presión sobre
 *                        el servidor.
 * @param totalRequests - Cantidad total de peticiones a ejecutar; el
 *                        test termina cuando se completan todas.
 * @param timeoutMs     - Tiempo máximo de espera por petición. Si una
 *                        respuesta tarda más, se cuenta como timeout
 *                        (esto infla el percentil p99, muy útil para
 *                        detectar cuellos de botella).
 */
export interface BenchmarkConfig {
  readonly targetUrl: string
  readonly method: BenchmarkHttpMethod
  readonly concurrency: number
  readonly totalRequests: number
  readonly timeoutMs: number
}

/* =====================================================================
   ======================= MÉTRICAS DE LATENCIA ========================
   ===================================================================== */

/**
 * Métricas estadísticas de latencia de la prueba.
 *
 * ¿Qué es un percentil? Es el valor por debajo del cual cae un
 * porcentaje concreto de las observaciones. Con la latencia de las
 * peticiones completadas, indican la "cola" de la distribución:
 *
 *   - p50 (mediana): la mitad de las peticiones responden en <= p50.
 *   - p90 / p95:      cómo se comporta el 90%/95% más rápido de las
 *                     peticiones (evalúa el caso "común" real).
 *   - p99:            el 1% más lento supera este valor; es donde se
 *                     esconden los timeouts y los cuellos de botella.
 *
 * Por eso en observabilidad se analizan p50/p99 juntos: si el p50 es
 * bajo pero el p99 se dispara, hay pocas peticiones "muy lentas"
 * aunque la mayoría responde bien.
 */
export interface LatencyPercentiles {
  /** Mediana del tiempo de respuesta en ms. */
  readonly p50: number
  /** Percentil 90 del tiempo de respuesta en ms. */
  readonly p90: number
  /** Percentil 95 del tiempo de respuesta en ms. */
  readonly p95: number
  /** Percentil 99 del tiempo de respuesta en ms (cuellos de botella). */
  readonly p99: number
}

/* =====================================================================
   ========================== SERIE TEMPORAL ===========================
   ===================================================================== */

/**
 * Un PUNTO de la serie temporal. Cada vez que el servicio procesa
 * una "ráfaga" de peticiones (cada 500 ms), se genera un punto que
 * alimenta la gráfica de tiempo real.
 *
 * @param timestamp      - Momento de la ráfaga (formato HH:mm:ss).
 * @param currentRps     - Peticiones por segundo en ese instante
 *                         (throughput instantáneo).
 * @param averageLatency - Latencia media de las peticiones de la
 *                         ráfaga, en ms.
 * @param activeErrors   - Errores (4xx/5xx/timeout) ocurridos en el
 *                         intervalo; pintarlos a lo largo del tiempo
 *                         revela "picos" de fallos.
 */
export interface BenchmarkDataPoint {
  readonly timestamp: string
  readonly currentRps: number
  readonly averageLatency: number
  readonly activeErrors: number
}

/* =====================================================================
   ============================ RESULTADO ===============================
   ===================================================================== */

/**
 * Estados posibles del ciclo de vida de una prueba.
 * 'failed' también representa una CANCELACIÓN por parte del usuario:
 * el contrato del módulo no contempla 'cancelled', así que usamos
 * 'failed' para dejar constancia de que la prueba no llegó a
 * 'completed'. (Si más adelante el backend distingue ambos, se
 * añade 'cancelled' a esta union sin romper nada.)
 */
export type BenchmarkRuntimeStatus = 'idle' | 'running' | 'completed' | 'failed'

/**
 * Resultado ACUMULADO de la prueba. El Mock Engine reconstruye y
 * emite un nuevo objeto de este tipo en cada tick (cada 500 ms) a
 * través del callback de progreso.
 *
 * @param status             - Estado actual del ciclo de vida.
 * @param completedRequests  - Peticiones que ya han "respondido".
 * @param successfulRequests - Peticiones con respuesta 2xx/3xx.
 * @param failedRequests     - Peticiones con error 4xx/5xx o timeout.
 * @param percentiles        - Métricas de latencia sobre TODAS las
 *                             peticiones completadas hasta el momento.
 * @param timeSeries         - Historial de puntos para la gráfica en
 *                             tiempo real (acotado a lo reciente).
 */
export interface BenchmarkResult {
  readonly status: BenchmarkRuntimeStatus
  readonly completedRequests: number
  readonly successfulRequests: number
  readonly failedRequests: number
  readonly percentiles: LatencyPercentiles
  readonly timeSeries: BenchmarkDataPoint[]
}

/* =====================================================================
   ===================== ESTADO INICIAL (idle) ==========================
   ===================================================================== */

/**
 * Fábrica del estado inicial de un BenchmarkResult.
 *
 * ¿Por qué una función y no una constante compartida?
 * Porque `timeSeries` es un ARRAY. Si todos usáramos la misma
 * constante, el hook la mutaría por referencia y el estado inicial
 * quedaría "contaminado" entre pruebas. Con esta función, cada
 * llamada devuelve arrays NUEVOS e independientes.
 */
export function createIdleBenchmarkResult(): BenchmarkResult {
  return {
    status: 'idle',
    completedRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    percentiles: {
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
    },
    timeSeries: [],
  }
}