/**
 * ============================================================
 * JAH ENGINE - Pagina Dashboard (src/features/dashboard/DashboardPage.tsx)
 * ============================================================
 * Vista raiz del engine. Reune los "widgets" de los tres modulos.
 * De momento incluimos:
 *   - Modulo 1: widget operativo en vivo de HomeLab Monitor.
 *   - Modulo 2: widget INTERACTIVO de Benchmark & Profiling, que lee
 *     del ESTADO GLOBAL (BenchmarkContext) para conmutar entre reposo
 *     y cuadro de mando en tiempo real.
 *   - Modulo 3: widget AUTONOMO de Storage & Remote Backups, que baja
 *     sus metricas el mismo desde backupService (mock/API) y enlaza
 *     a su pagina completa.
 *
 * ¿Cual es el papel de esta pagina en la composicion del dashboard?
 * La pagina solo COMPONE (wire): monta cada widget en la rejilla y,
 * cuando hacen falta, les cablea props y callbacks de navegacion.
 * Quien decide "de donde salen los datos" es cada widget (o el
 * contexto global, como en el benchmark), NO esta pagina.
 */

import { useNavigate } from 'react-router-dom'
import { HomeLabMonitorWidget } from '@/components/widgets/HomeLabMonitorWidget'
import { BenchmarkWidget } from '@/components/widgets/BenchmarkWidget'
import { StorageBackupsWidget } from '@/features/dashboard/components/StorageBackupsWidget'
import { useBenchmarkContext } from '@/features/benchmark/context/BenchmarkContext'

/** Pagina principal que agrupa los widgets del dashboard. */
export function DashboardPage() {
  // Hook de navegacion para botones que llevan a otros modulos.
  const navigate = useNavigate()

  // --- ESTADO GLOBAL DEL BENCHMARK ---
  // La pagina solo EJERCE de cableadora: lee el contexto (provisito
  // por <BenchmarkProvider> en la raiz) y se lo pasa por props al
  // widget, que es "tonto/presentacional". Curioso y pedagogico:
  // `isRunning` y `result` llegan aqui aunque la prueba se haya lanzado
  // en /benchmark, porque el provider nunca se desmonta al navegar.
  const { config, result, isRunning } = useBenchmarkContext()

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
          {/* Modulo 2: widget interactivo de benchmarks.
              Props que recibe:
                - isRunning / result: desde el contexto global.
                - totalRequests: del config activo (no vive en `result`);
                  necesario para el % de la barra de progreso.
                - onNavigateToBenchmark: callback que React Router
                  traduce a navigate('/benchmark'). */}
          <BenchmarkWidget
            isRunning={isRunning}
            result={result}
            totalRequests={config.totalRequests}
            onNavigateToBenchmark={() => navigate('/benchmark')}
          />

          {/* Modulo 3: widget AUTONOMO de backups. No necesita props:
              baja sus KPIs del servicio y enlaza a /backups por si
              mismo. La rejilla responsive es la misma para los tres. */}
          <StorageBackupsWidget />
        </div>
      </div>
    </section>
  )
}

export default DashboardPage