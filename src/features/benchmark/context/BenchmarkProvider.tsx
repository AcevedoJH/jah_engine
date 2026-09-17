/**
 * ============================================================
 * JAH ENGINE - BenchmarkProvider
 * (src/features/benchmark/context/BenchmarkProvider.tsx)
 * ============================================================
 * Componente PROVEEDOR del estado global del Benchmark.
 *
 * Solo monta el hook de estados UNA vez (aunque tenga muchos hijos);
 * el valor del contexto es justamente lo que devuelve `useBenchmark`:
 * `{ config, result, isRunning, startTest, stopTest, resetTest }`.
 *
 * Al vivir en la raíz de la app (ver App.tsx), nunca se desmonta al
 * navegar entre páginas, así que la simulación puede seguir corriendo
 * y cualquier pantalla puede consultar su progreso en vivo.
 *
 * NOTA DE ARQUITECTURA: este archivo SOLO exporta el componente, y el
 * consumo público (hook `useBenchmarkContext`) vive en su propio archivo
 * sin JSX (BenchmarkContext.ts). Es la manera de cumplir la regla
 * react/only-export-components, que exige un único tipo de export por
 * archivo para que Fast Refresh funcione sin recargar la página.
 */

import type { ReactNode } from 'react'
import { useBenchmark } from '../hooks/useBenchmark'
import { BenchmarkContext } from './BenchmarkContext'

/* =====================================================================
   =========================== PROVIDER ================================
   ===================================================================== */

/**
 * Proveedor del estado global del Benchmark.
 *
 * @param props.children - Subárbol React que podrá leer el contexto.
 * @returns El proveedor envolviendo a los hijos.
 */
export function BenchmarkProvider({ children }: { children: ReactNode }) {
  // Un solo `useBenchmark` alimentando a toda la aplicación.
  const benchmark = useBenchmark()

  // `value` es un objeto nuevo por render, pero el provider SOLO
  // re-renderiza cuando cambia el estado del hook (nuevo tick del
  // motor). Es exactamente el momento en que queremos avisar a todos
  // los consumidores, así que no hace falta memorizarlo.
  return <BenchmarkContext.Provider value={benchmark}>{children}</BenchmarkContext.Provider>
}