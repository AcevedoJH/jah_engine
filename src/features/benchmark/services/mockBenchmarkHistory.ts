/**
 * ============================================================
 * JAH ENGINE - Historial Mock de Benchmark
 * (src/features/benchmark/services/mockBenchmarkHistory.ts)
 * ============================================================
 * Datos ficticios pero creíbles de pruebas anteriores, usados cuando
 * `VITE_USE_MOCK_DATA=true`. La fachada `benchmarkService.ts` los
 * devuelve desde `getBenchmarkHistory()` con la misma forma que el
 * futuro endpoint `GET /benchmark/history`.
 *
 * ¿Por qué un archivo aparte para el mock?
 * Lo mismo que `mockBackupData.ts` en Backups: mantener los datos de
 * ejemplo aislados de la lógica de red/estrategia hace que cualquiera
 * pueda "escenificar" nuevos casos (o apuntar a una API real) sin tocar
 * el resto del módulo.
 *
 * Los tiempos en `finishedAt` son relativos a la hora actual (Date.now()
 * menos un intervalo), para que la UI muestre fechas "recientes" en
 * cualquier momento en que se abra la app.
 */

import type { BenchmarkHistoryItem } from '../types/benchmark'

/** Desplazamientos de tiempo (ms) para simular finalizaciones recientes. */
const MINUTES = 60 * 1000
const HOURS = 60 * MINUTES

/** Timestamp ISO de hace `offsetMs` respecto de ahora. */
function recentIso(offsetMs: number): string {
  return new Date(Date.now() - offsetMs).toISOString()
}

/**
 * Historial ficticio del módulo Benchmark.
 *
 * Cada entrada combina un `config` verosímil (endpoints típicos de un
 * backend de HomeLab) con su `summary` agregado. Los valores siguen la
 * misma distribución que genera el Mock Engine: p99 notablemente mayor
 * que p50 (cola pesada) y tasa de éxito ~97-99%.
 */
export const MOCK_BENCHMARK_HISTORY: BenchmarkHistoryItem[] = [
  {
    id: 'mock-bench-001',
    finishedAt: recentIso(45 * MINUTES),
    config: {
      targetUrl: 'http://localhost:3000/api/health',
      method: 'GET',
      concurrency: 10,
      totalRequests: 100,
      timeoutMs: 2000,
    },
    summary: {
      targetUrl: 'http://localhost:3000/api/health',
      method: 'GET',
      concurrency: 10,
      ttfbMs: 42,
      avgLatencyMs: 96,
      requestsPerSecond: 180,
      successRate: 99,
    },
  },
  {
    id: 'mock-bench-002',
    finishedAt: recentIso(2 * HOURS),
    config: {
      targetUrl: 'http://localhost:3000/api/users',
      method: 'GET',
      concurrency: 25,
      totalRequests: 250,
      timeoutMs: 3000,
    },
    summary: {
      targetUrl: 'http://localhost:3000/api/users',
      method: 'GET',
      concurrency: 25,
      ttfbMs: 58,
      avgLatencyMs: 134,
      requestsPerSecond: 310,
      successRate: 98,
    },
  },
  {
    id: 'mock-bench-003',
    finishedAt: recentIso(26 * HOURS),
    config: {
      targetUrl: 'http://localhost:3000/api/login',
      method: 'POST',
      concurrency: 50,
      totalRequests: 400,
      timeoutMs: 5000,
    },
    summary: {
      targetUrl: 'http://localhost:3000/api/login',
      method: 'POST',
      concurrency: 50,
      ttfbMs: 121,
      avgLatencyMs: 267,
      requestsPerSecond: 405,
      successRate: 97,
    },
  },
  {
    id: 'mock-bench-004',
    finishedAt: recentIso(3 * 24 * HOURS),
    config: {
      targetUrl: 'http://localhost:3000/api/products?page=1',
      method: 'GET',
      concurrency: 5,
      totalRequests: 60,
      timeoutMs: 1500,
    },
    summary: {
      targetUrl: 'http://localhost:3000/api/products?page=1',
      method: 'GET',
      concurrency: 5,
      ttfbMs: 31,
      avgLatencyMs: 74,
      requestsPerSecond: 95,
      successRate: 100,
    },
  },
]