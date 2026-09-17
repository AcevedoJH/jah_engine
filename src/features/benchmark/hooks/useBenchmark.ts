/**
 * ============================================================
 * JAH ENGINE - Hook useBenchmark (src/features/benchmark/hooks/useBenchmark.ts)
 * ============================================================
 * Custom hook que expone la lógica del Módulo Benchmark a los
 * componentes React SIN que estos tengan que conocer el servicio
 * interno.
 *
 * ¿Por qué un custom hook y no llamar al servicio desde el componente?
 * 1. SEPARACIÓN DE PREOCUPACIONES: el componente solo pinta JSX.
 *    El hook decide QUÉ hacer con el progreso, cuándo limpiar el
 *    estado o cómo reiniciar una prueba.
 * 2. REUTILIZACIÓN: la misma página, futuros widgets o un diálogo
 *    de "lanzar prueba" pueden usar este mismo hook sin duplicar
 *    la lógica de suscripción al progreso.
 * 3. CICLO DE VIDA GARANTIZADO: en el desmontaje del componente
 *    cancelamos la simulación en curso (evita fugas de memoria y
 *    "state updates on unmounted component").
 *
 * FLUJO DE DATOS:
 *   usuario -> startTest(config) -> benchmarkService.runSimulatedBenchmark
 *              -> onProgress(progress) -> setResult(progress) -> UI
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BenchmarkConfig, BenchmarkResult } from '../types/benchmark'
import { createIdleBenchmarkResult } from '../types/benchmark'
import { benchmarkService } from '../services/benchmarkService'

/* =====================================================================
   ================= VALORES POR DEFECTO DEL MÓDULO =====================
   ===================================================================== */

/**
 * Configuración inicial de ejemplo. El usuario la puede sobreescribir
 * desde el formulario (startTest recibe un customConfig opcional).
 * Estos valores están pensados para que la demo termine en ~10 s
 * (200 peticiones / 10 concurrentes = 20 ráfagas de 500 ms).
 */
const DEFAULT_BENCHMARK_CONFIG: BenchmarkConfig = {
  targetUrl: 'https://httpbin.org/get',
  method: 'GET',
  concurrency: 10,
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
 * @param startTest - Lanza la prueba con una config nueva (opcional).
 * @param stopTest  - Cancela la prueba en curso.
 * @param resetTest - Cancela y vuelve al estado inicial 'idle'.
 */
export interface UseBenchmarkResult {
  config: BenchmarkConfig
  result: BenchmarkResult
  isRunning: boolean
  startTest: (customConfig?: BenchmarkConfig) => void
  stopTest: () => void
  resetTest: () => void
}

/* =====================================================================
   ======================== HOOK PRINCIPAL =============================
   ===================================================================== */

/**
 * Encapsula el ciclo de vida de una prueba de estrés simulada.
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

  // --- Guardia de montaje ---
  // Un ref NO provoca re-renders, solo persiste entre renders.
  // Lo usamos para saber si el componente sigue montado cuando llega
  // un progreso desde un setInterval: si no, ignoramos la actualización
  // para no disparar un warning de React.
  const mountedRef = useRef(true)

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
      setConfig(effectiveConfig)
      setIsRunning(true)

      // Llamamos al servicio y nos SUSCRIBIMOS a su progreso.
      // El callback que recibe los ticks es la puerta de entrada
      // del motor hacia el estado de React.
      benchmarkService.runSimulatedBenchmark(effectiveConfig, (progress) => {
        // Si el componente se desmontó a mitad de prueba, descartamos.
        if (!mountedRef.current) return

        // Actualizamos el resultado acumulado en cada tick.
        setResult(progress)

        // El servicio emite 'completed' o 'failed' al terminar:
        // apagamos el spinner cuando el motor informa un estado final.
        if (progress.status === 'completed' || progress.status === 'failed') {
          setIsRunning(false)
        }
      })
    },
    [config],
  )

  /**
   * Cancela la prueba activa (sin borrar el progreso acumulado).
   * El servicio notifica un progreso final 'failed', así que el
   * estado `isRunning` se apaga a través del callback de progreso.
   */
  const stopTest = useCallback(() => {
    benchmarkService.cancelBenchmark()
  }, [])

  /**
   * Reinicia completamente: cancela la simulación y restaura el
   * resultado a su estado inicial 'idle' (arrays vacíos).
   */
  const resetTest = useCallback(() => {
    benchmarkService.cancelBenchmark()
    setResult(createIdleBenchmarkResult())
    setIsRunning(false)
  }, [])

  // --- Efecto de ciclo de vida ---
  useEffect(() => {
    // Marcamos el componente como montado. En el cleanup (desmontaje
    // o re-render que re-ejecute el efecto) cancelamos la simulación
    // y desmarcamos. Así el onProgress del servicio no actualiza un
    // estado de un componente que ya no existe.
    mountedRef.current = true
    return () => {
      // Importante el ORDEN: primero desmarcamos (mountedRef = false)
      // y DESPUÉS cancelamos, porque cancelBenchmark dispara un último
      // onProgress con 'failed' que debe ser ignorado.
      mountedRef.current = false
      benchmarkService.cancelBenchmark()
    }
  }, [])

  return { config, result, isRunning, startTest, stopTest, resetTest }
}