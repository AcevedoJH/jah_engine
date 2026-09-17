/**
 * ============================================================
 * JAH ENGINE - BenchmarkContext
 * (src/features/benchmark/context/BenchmarkContext.ts)
 * ============================================================
 * ESTADO GLOBAL del Módulo Benchmark & Profiling.
 *
 * ¿Por qué necesitamos un Context en lugar de usar `useBenchmark` en
 * cada pantalla por su cuenta?
 *
 * La navegación de JAH Engine es URL-driven (React Router): al pasar
 * de `/` a `/benchmark`, DashboardPage se DESMONTA y BenchmarkPage se
 * MONTA. Si cada pantalla instanciara su propio `useBenchmark`, cada
 * una viviría en una burbuja de estado distinta:
 *   - Una prueba iniciada en /benchmark se "perdería" al volver al
 *     Dashboard (el widget no sabría que hubo un test).
 *   - Peor: el cleanup del hook cancelaría la simulación.
 *
 * La técnica clásica de React para ESTADO COMPARTIDO se llama
 * "lifting state up" (elevar el estado): mover el estado al ancestro
 * común MÁS CERCANO que nunca se desmonta; aquí, la raíz de la app.
 * Con eso conseguimos que el mismo `result`/`isRunning` alimente tanto
 * a la página completa como al gadget del Dashboard, y ambos
 * re-renderizan al unísono conforme llegan los ticks del motor.
 *
 * ESTRUCTURA (dos archivos, por la regla react/only-export-components):
 *   - BenchmarkContext.ts (ESTE): el contexto crudo + el hook público
 *     de lectura. Es un archivo SIN JSX, por eso puede exportar el
 *     objeto de contexto y el hook sin romper Fast Refresh.
 *   - BenchmarkProvider.tsx: el componente que monta `useBenchmark`
 *     una sola vez en la raíz y publica su valor en el contexto.
 *
 * FLUJO DE DATOS:
 *   motor (setInterval) -> onProgress -> useBenchmark -> Contexto
 *        -> { BenchmarkPage, BenchmarkWidget del Dashboard }
 */

import { createContext, useContext } from 'react'
import type { UseBenchmarkResult } from '../hooks/useBenchmark'

/* =====================================================================
   ======================== CONTEXTO INTERNO ===========================
   ===================================================================== */

/**
 * Contexto crudo de React. El tipo es `UseBenchmarkResult | null`:
 * empezamos en `null` y solo toma valor real cuando <BenchmarkProvider>
 * se monta y ejecuta `useBenchmark`. Se exporta porque el provider
 * (en su archivo separado) necesita leerlo para publicar el valor;
 * pero la API pública para consumidores es solo `useBenchmarkContext`.
 */
export const BenchmarkContext = createContext<UseBenchmarkResult | null>(null)

/* =====================================================================
   ======================== HOOK DE CONSUMO ============================
   ===================================================================== */

/**
 * Hook de lectura del estado global del Benchmark.
 *
 * ¿Qué hace la "guardia de error"?
 * useContext devolvería `null` si este hook se llamara fuera del
 * provider. En vez de fallar de forma confusa más tarde ("cannot read
 * isRunning of null"), la guardia falla RÁPIDO (fail-fast) con un
 * mensaje que apunta directamente a la causa raíz.
 *
 * @returns El estado y las acciones de `useBenchmark` (ver UseBenchmarkResult).
 * @throws Error si se usa sin <BenchmarkProvider> por encima.
 */
export function useBenchmarkContext(): UseBenchmarkResult {
  const context = useContext(BenchmarkContext)

  if (context === null) {
    // Este error solo debería aparecer en desarrollo si movemos un
    // consumidor fuera del árbol del provider.
    throw new Error('useBenchmarkContext debe usarse dentro de <BenchmarkProvider>')
  }

  return context
}