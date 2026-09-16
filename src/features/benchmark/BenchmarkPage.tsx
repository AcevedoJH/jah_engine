/**
 * ============================================================
 * JAH ENGINE - Pagina Benchmark & Profiling
 * (src/features/benchmark/BenchmarkPage.tsx)
 * ============================================================
 * Placeholder del Modulo 2. Documenta que se construira aquí:
 *  - Formulario para lanzar una prueba de estrés HTTP.
 *  - Suscripción WebSocket a `benchmark.progress` para la barra en vivo.
 *  - Graficas Recharts de percentiles (p50/p95/p99), throughput y recursos.
 *
 * Se deja como pagina real y enrutada para que el esqueleto de
 * navegacion este completo desde el primer commit.
 */

import { Gauge } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Vista del motor de benchmarking (aun sin logica). */
export function BenchmarkPage() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Gauge className="h-6 w-6 text-primary" /> Benchmark &amp; Profiling
        </h1>
        <p className="text-sm text-muted-foreground">
          Motor de pruebas de estrés y perfilado de recursos. En construcción.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aquí se lanzarán pruebas de estrés HTTP y se mostrarán los
          percentiles p95/p99, el throughput y el consumo de CPU/RAM.
        </CardContent>
      </Card>
    </section>
  )
}

export default BenchmarkPage