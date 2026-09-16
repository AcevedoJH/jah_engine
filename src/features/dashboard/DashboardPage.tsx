/**
 * ============================================================
 * JAH ENGINE - Pagina Dashboard (src/features/dashboard/DashboardPage.tsx)
 * ============================================================
 * Vista raiz del engine. Reune los "widgets" de los tres modulos.
 * De momento incluimos el widget operativo de HomeLab Monitor
 * (Modulo 1); los demas modulos muestran tarjetas resumen que
 * enlazan a su pagina completa.
 */

import { useNavigate } from 'react-router-dom'
import { DatabaseBackup, Gauge } from 'lucide-react'
import { HomeLabMonitorWidget } from '@/components/widgets/HomeLabMonitorWidget'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/** Pagina principal que agrupa los widgets del dashboard. */
export function DashboardPage() {
  // Hook de navegacion para botones que llevan a otros modulos.
  const navigate = useNavigate()

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Observabilidad y estado general de tu infraestructura DevOps.
        </p>
      </header>

      {/* Rejilla responsive: 1 columna en movil, 2 en pantallas medianas. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Modulo 1: widget en vivo de HomeLab Monitor. */}
        <HomeLabMonitorWidget />

        <div className="space-y-6">
          {/* Modulo 2: acceso al motor de benchmarks. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-5 w-5 text-primary" /> Benchmark & Profiling
              </CardTitle>
              <CardDescription>
                Lanza pruebas de estrés HTTP y mide percentiles p95/p99, throughput y uso de recursos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate('/benchmark')}>
                Ir a Benchmark
              </Button>
            </CardContent>
          </Card>

          {/* Modulo 3: acceso a los backups cifrados. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DatabaseBackup className="h-5 w-5 text-primary" /> Storage & Remote Backups
              </CardTitle>
              <CardDescription>
                Copias cifradas en origen con AES-256 y sincronización remota vía Rclone / S3.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={() => navigate('/backups')}>
                Ir a Backups
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}

export default DashboardPage