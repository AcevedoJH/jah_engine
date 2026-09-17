/**
 * ============================================================
 * JAH ENGINE - Capa de Servicio del Módulo Benchmark & Profiling
 * (src/features/benchmark/services/benchmarkService.ts)
 * ============================================================
 * Fachada (FACADE) del módulo: la ÚNICA puerta que usan el hook y la
 * página para ejecutar pruebas y consultar el historial.
 *
 * ¿Por qué delegar todo en esta capa?
 * El usuario puede lanzar una prueba de estrés en DOS mundos:
 *
 *   1. MODO MOCK  (VITE_USE_MOCK_DATA=true): sin backend. Delegamos en
 *      `MockBenchmarkEngine` (mockBenchmarkEngine.ts), que simula
 *      peticiones HTTP con métricas creíbles de latencia y TTFB.
 *   2. MODO REAL   (VITE_USE_MOCK_DATA=false): cada llamada se traduce
 *      en un fetch al backend (`VITE_API_BASE_URL`):
 *        - POST /benchmark/run      -> ejecutar una prueba
 *        - GET  /benchmark/history  -> historial de pruebas previas
 *
 * ¿Por qué import.meta.env? Vite expone las variables de entorno del
 * proyecto en `import.meta.env` (tipadas en src/vite-env.d.ts). El
 * método `??` da un fallback por si faltan: así la app FUNCIONA en
 * modo mock sin exigir configurar nada.
 *
 * Al exponer el MISMO contrato en ambos modos, la UI no sabe (ni le
 * importa) de dónde vienen los datos: si un día levantas el backend,
 * solo cambias una variable de entorno y todo sigue funcionando.
 * Es el patrón "Strategy en tiempo de ejecución" (aquí vía env).
 */

import type {
  BenchmarkConfig,
  BenchmarkHistoryItem,
  BenchmarkResult,
} from '../types/benchmark'
import { BenchmarkAbortError, benchmarkSimulator } from './mockBenchmarkEngine'
import { MOCK_BENCHMARK_HISTORY } from './mockBenchmarkHistory'

/** true si el proyecto corre en modo mock (sin backend). */
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

/** Base URL del backend API (fallback útil si no se configura nada). */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

/** Retardo artificial del mock para que la UI muestre loading/spinner
 *  y el desarrollador perciba una "ida al servidor" (300 ms típico). */
const MOCK_DELAY_MS = 300

/**
 * Pequeña pausa que imita la latencia de red en modo mock.
 * Devuelve una Promise que se resuelve tras `delayMs`.
 */
function simulateNetworkDelay(delayMs: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

/**
 * Clona un objeto con JSON para que el consumidor reciba copias
 * independientes y no pueda mutar las constantes mock compartidas.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Lanza un error descriptivo cuando una respuesta HTTP no es ok.
 * Extraído a helper para reutilizarlo en todas las llamadas reales.
 */
async function throwHttpError(response: Response, action: string): Promise<never> {
  let detail = ''
  try {
    detail = await response.text()
  } catch {
    // Si el cuerpo no es texto legible, seguimos con el detalle vacío.
  }
  throw new Error(`[benchmarkService] ${action}: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`)
}

/* =====================================================================
   ========================= EJECUCIÓN DE PRUEBA ========================
   ===================================================================== */

/**
 * Ejecuta una prueba de estrés y devuelve (vía Promise) el resultado
 * final. En modo mock delega en el simulador; en modo real hace
 * `POST {API_BASE_URL}/benchmark/run` con la config como JSON.
 *
 * @param config      - Configuración de la carga a ejecutar.
 * @param onProgress  - Callback opcional de STREAMING: se invoca en
 *                      cada tick con el resultado acumulado (lo usa la
 *                      página para pintar la gráfica en tiempo real).
 * @returns Promise<BenchmarkResult> con el resultado final 'completed';
 *          en modo mock puede rechazar con `BenchmarkAbortError` si el
 *          usuario detiene la prueba.
 */
export async function runBenchmarkTest(
  config: BenchmarkConfig,
  onProgress?: (progress: BenchmarkResult) => void,
): Promise<BenchmarkResult> {
  if (USE_MOCK_DATA) {
    // Estrategia MOCK: el simulador del módulo.
    return benchmarkSimulator.run(config, onProgress)
  }

  // Estrategia REAL: el backend hace la prueba y la UI recibe el
  // resultado final (en producción se integraría el streaming, p. ej.
  // con Server-Sent Events o WebSocket, como en src/types/index.ts).
  const response = await fetch(`${API_BASE_URL}/benchmark/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!response.ok) {
    await throwHttpError(response, 'POST /benchmark/run')
  }
  return (await response.json()) as BenchmarkResult
}

/**
 * Cancela la prueba en curso (si la hay). A través de la fachada para
 * que el hook no dependa del simulador directamente; en modo real
 * implicaría abortar el fetch o notificar al backend.
 */
export function cancelBenchmark(): void {
  benchmarkSimulator.cancel()
}

/** true si hay una prueba corriendo en este momento. */
export function isBenchmarkRunning(): boolean {
  return benchmarkSimulator.isRunning
}

/* =====================================================================
   ============================ HISTORIAL ==============================
   ===================================================================== */

/**
 * Devuelve el historial de pruebas previas, ordenado de más reciente
 * a más antigua.
 *
 *  - Mock: copias de `MOCK_BENCHMARK_HISTORY` tras `simulateNetworkDelay`
 *    (para que el loading de la UI sea perceptible).
 *  - Real: `GET {API_BASE_URL}/benchmark/history`.
 */
export async function getBenchmarkHistory(): Promise<BenchmarkHistoryItem[]> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    return clone(MOCK_BENCHMARK_HISTORY)
  }

  const response = await fetch(`${API_BASE_URL}/benchmark/history`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    await throwHttpError(response, 'GET /benchmark/history')
  }
  return (await response.json()) as BenchmarkHistoryItem[]
}

/* =====================================================================
   ===================== RE-EXPORT DE ERRORES ==========================
   ===================================================================== */

/**
 * Se re-exporta la clase del error de cancelación para que todos los
 * consumidores del módulo importen SIEMPRE desde la fachada y no tengan
 * que conocer la estructura interna del simulador.
 */
export { BenchmarkAbortError }