/**
 * ============================================================
 * JAH ENGINE - Hook useBenchmark (src/features/benchmark/hooks/useBenchmark.ts)
 * ============================================================
 * Custom hook que expone la lógica del Módulo Benchmark a los
 * componentes React SIN que estos tengan que conocer la capa de
 * servicio (benchmarkService.ts).
 *
 * ¿Por qué un custom hook y no llamar al servicio desde el componente?
 * 1. SEPARACIÓN DE PREOCUPACIONES: el componente solo pinta JSX.
 *    El hook decide QUÉ hacer con el progreso, cuándo limpiar el
 *    estado o cómo reiniciar una prueba.
 * 2. REUTILIZACIÓN Y ESTADO GLOBAL: este hook lo consume
 *    <BenchmarkProvider> (ver context/BenchmarkContext.tsx), que lo
 *    monta UNA sola vez en la raíz. Así la misma instancia alimenta a
 *    la página /benchmark y al gadget del Dashboard: ambos leen el
 *    MISMO resultado conforme llegan los ticks del motor.
 * 3. CICLO DE VIDA GARANTIZADO: al desmontarse el provider (solo con
 *    la propia app) cancelamos la simulación en curso, evitando fugas
 *    de memoria y "state updates on unmounted component".
 *
 * FLUJO DE DATOS (API Promise + streaming):
 *   usuario -> startTest(config) -> benchmarkService.runBenchmarkTest(config, onProgress)
 *     - onProgress(progress) -> setResult(progress)  (también con el estado final)
 *     - la Promise se resuelve con el resultado 'completed'
 *     - si el usuario detiene, se rechaza con BenchmarkAbortError
 *   El contrato es el MISMO que tendrá el backend real (POST /benchmark/run):
 *   la UI no sabe si la prueba la ejecuta el mock o el servidor.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BenchmarkConfig, BenchmarkResult } from '../types/benchmark'
import { createIdleBenchmarkResult } from '../types/benchmark'
import {
  BenchmarkAbortError,
  cancelBenchmark,
  runBenchmarkTest,
} from '../services/benchmarkService'

/* =====================================================================
   ================= VALORES POR DEFECTO DEL MÓDULO =====================
   ===================================================================== */

/**
 * Configuración inicial de ejemplo. El usuario la puede sobreescribir
 * desde el formulario (startTest recibe un customConfig opcional).
 * Estos valores están pensados para que la demo termine en ~2.5 s
 * (200 peticiones / 40 concurrentes = 5 ráfagas de 500 ms).
 */
const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  targetUrl: 'https://httpbin.org/get',
  method: 'GET',
  concurrency: 40,
  totalRequests: 200,
  timeoutMs: 5000,
}

/* =====================================================================
   ========================= TYPES PÚBLICOS ============================
   ===================================================================== */

/**
 * Valor devuelto por el hook (estado + acciones).
 *
 * @param config    - Configuración actual (la última usada).
 * @param result    - Progreso acumulado de la prueba.
 * @param isRunning - true mientras el servicio está simulando.
 * @param error     - Mensaje de error de la última ejecución (null si
 *                    todo OK). No se pinta ante cancelaciones (estas
 *                    no son errores).
 * @param startTest - Lanza la prueba con una config nueva (opcional).
 * @param stopTest  - Cancela la prueba en curso.
 * @param resetTest - Cancela y vuelve al estado inicial 'idle'.
 */
export interface UseBenchmarkResult {
  config: BenchmarkConfig
  result: BenchmarkResult
  isRunning: boolean
  error: string | null
  startTest: (customConfig?: BenchmarkConfig) => void
  stopTest: () => void
  resetTest: () => void
}

/* =====================================================================
   ======================== HOOK PRINCIPAL =============================
   ===================================================================== */

/**
 * Encapsula el ciclo de vida de una prueba de estrés.
 *
 * @returns Estado actual + acciones (ver UseBenchmarkResult).
 */
export function useBenchmark(): UseBenchmarkResult {
  // --- Estado de la configuración actual ---
  const [config, setConfig] = useState<BenchmarkConfig>(DEFAULT_BENCHMARK_CONFIG)

  // --- Estado del resultado acumulado ---
  // El useState inicializa LAZY (callback) para no reconstruir el
  // objeto inicial en cada render. createIdleBenchmarkResult() genera
  // arrays nuevos, evitando compartir referencias entre renders.
  const [result, setResult] = useState<BenchmarkResult>(
    () => createIdleBenchmarkResult(),
  )

  // --- Indicador de prueba en curso ---
  const [isRunning, setIsRunning] = useState(false)

  // --- Mensaje de error de la última ejecución ---
  const [error, setError] = useState<string | null>(null)

  // --- Guardia de montaje ---
  // Un ref NO provoca re-renders, solo persiste entre renders.
  // Lo usamos para saber si el componente sigue montado cuando llega
  // un progreso desde un setInterval o se resuelve la Promise: si no,
  // ignoramos la actualización para no disparar un warning de React.
  const mountedRef = useRef(true)

  // --- Contador de ejecuciones ---
  // Identifica cada prueba lanzada. Cuando una Promise "vieja" termina
  // (por ejemplo, cancelada por una reentrada), el finally compara su
  // id contra el actual: si no coincide, NO toca el estado. Así una
  // prueba nueva nunca ve su indicador isRunning pisado por la anterior.
  const runIdRef = useRef(0)

  /**
   * Lanza una prueba de estrés.
   *
   * @param customConfig - Configuración opcional. Si no se pasa,
   *                       se reutiliza la última `config` del hook.
   *                       El servicio cancela internamente cualquier
   *                       simulación anterior (una sola a la vez).
   */
  const startTest = useCallback(
    (customConfig?: BenchmarkConfig) => {
      // Elegimos la configuración efectiva: la nueva o la guardada.
      const effectiveConfig = customConfig ?? config

      // La reflejamos en el estado (para que el formulario muestre
      // los valores con los que se está ejecutando la prueba).
      const runId = ++runIdRef.current
      setConfig(effectiveConfig)
      setIsRunning(true)
      setError(null)

      // Lanzamos la prueba como PROMESA. La ejecutamos en una función
      // async "fire and forget" (void) porque su manejo interno ya
      // incluye try/catch/finally; así no dejamos promises colgadas.
      //
      // El `onProgress` es el STREAMING del motor->React: cada tick
      // actualiza `result` (también el estado final saliente), y el
      // resultado de la Promise es una segunda vía para `completed`.
      void (async () => {
        try {
          const finalResult = await runBenchmarkTest(effectiveConfig, (progress) => {
            // Si el componente se desmontó a mitad de prueba, descartamos.
            if (!mountedRef.current) return
            setResult(progress)
          })

          // La Promise se resuelve con el resultado final 'completed'.
          if (mountedRef.current) setResult(finalResult)
        } catch (err: unknown) {
          // Abortos (cancelación voluntaria) no son errores: se callan
          // para no pintar un mensaje en la UI. El estado final 'failed'
          // ya llega por streaming desde el motor.
          if (err instanceof BenchmarkAbortError) return

          // Error real (p. ej. el backend devolvió HTTP 500).
          if (!mountedRef.current) return
          setError(err instanceof Error ? err.message : 'Error desconocido al ejecutar el benchmark.')
        } finally {
          // Apagamos el spinner, pero SOLO si esta ejecución sigue siendo
          // la última (que una prueba antigua no pise a la nueva).
          if (mountedRef.current && runIdRef.current === runId) {
            setIsRunning(false)
          }
        }
      })()
    },
    [config],
  )

  /**
   * Cancela la prueba activa (sin borrar el progreso acumulado).
   * El motor ONProgress notifica un progreso final 'failed' (la UI lo
   * marca como "Detenido") y su PROMESA se rechaza con
   * BenchmarkAbortError, que startTest ignora silenciosamente.
   */
  const stopTest = useCallback(() => {
    setError(null)
    cancelBenchmark()
  }, [])

  /**
   * Reinicia completamente: cancela la simulación y restaura el
   * resultado a su estado inicial 'idle' (arrays vacíos).
   */
  const resetTest = useCallback(() => {
    runIdRef.current++
    cancelBenchmark()
    setResult(createIdleBenchmarkResult())
    setIsRunning(false)
    setError(null)
  }, [])

  // --- Efecto de ciclo de vida ---
  useEffect(() => {
    // Marcamos el hook como montado. En el cleanup (solo al desmontarse
    // el provider, es decir, con la propia app) cancelamos la simulación
    // y desmarcamos. Así el onProgress del servicio no actualiza un
    // estado de un componente que ya no existe.
    // NOTA: no llama a setState, por eso no dispara el lint
    // react/set-state-in-effect.
    mountedRef.current = true
    return () => {
      // Importante el ORDEN: primero desmarcamos (mountedRef = false)
      // y DESPUÉS cancelamos, porque cancelBenchmark dispara un último
      // onProgress con 'failed' que debe ser ignorado.
      mountedRef.current = false
      cancelBenchmark()
    }
  }, [])

  return { config, result, isRunning, error, startTest, stopTest, resetTest }
}