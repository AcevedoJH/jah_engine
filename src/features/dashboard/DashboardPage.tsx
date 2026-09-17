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

      {/* ============================================================
          REJILLA PRINCIPAL DEL DASHBOARD (CSS Grid)
         ============================================================
         ¿Por que CSS Grid y no flexbox? Porque queremos COLOCAR los
         widgets en una cuadricula de filas/columnas con tramos que
         ocupan celdas distintas (el hero abarca 2, los demas 1), y Grid
         expresa eso de forma declarativa con `col-span-*`.

         Decisiones clave de esta rejilla:

         1) `grid-cols-1 lg:grid-cols-2` (RESPONSIVE):
            - En movil/tablet hay UNA sola columna: todo se apila y cada
              widget ocupa el ancho completo (maxima legibilidad).
            - Desde `lg` (>=1024px) hay DOS columnas simetricas.
            No hace falta media query CSS: Tailwind aplica la clase del
            breakpoint correspondiente segun el ancho del viewport.

         2) `items-start` (ALINEACION DE ITEMS - el arreglo del bug):
            Por defecto, CSS Grid aplica `align-items: stretch`, que
            ESTIRA todos los items de una misma fila para igualar sus
            alturas. Eso es lo que provocaba el "estiramiento vertical":
            las tarjetas bajas (Benchmark/Backups) se deformaban y
            aparecian huecos internos enormes. Con `items-start` cada
            item toma su ALTURA NATURAL (content-based) y la fila deja
            de forzar simetrias de altura. La simetria que buscamos es
            de COLUMNAS (mismo ancho), no de alturas.

         3) `gap-6`: separacion uniforme entre celdas, tanto en filas
            como en columnas, sin margenes manuales en cada widget.

         4) `lg:col-span-2` en el hero: le dice a HomeLab Monitor que
            abarque las DOS columnas (formato ancho/panoramico). Los
            otros dos widgets caen solos en la fila inferior, uno por
            columna, en una cuadricula simetrica. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* HERO (fila superior): HomeLab Monitor a ancho completo. */}
        <div className="lg:col-span-2">
          <HomeLabMonitorWidget />
        </div>

        {/* FILA INFERIOR: dos columnas simetricas.
            - Modulo 2 (izquierda): widget interactivo de benchmarks.
              Props que recibe:
                - isRunning / result: desde el contexto global.
                - totalRequests: del config activo (no vive en `result`);
                  necesario para el % de la barra de progreso.
                - onNavigateToBenchmark: callback que React Router
                  traduce a navigate('/benchmark').
            - Modulo 3 (derecha): widget AUTONOMO de backups; baja sus
              KPIs del servicio y enlaza a /backups por si mismo. */}
        <div>
          <BenchmarkWidget
            isRunning={isRunning}
            result={result}
            totalRequests={config.totalRequests}
            onNavigateToBenchmark={() => navigate('/benchmark')}
          />
        </div>

        <div>
          <StorageBackupsWidget />
        </div>
      </div>
    </section>
  )
}

export default DashboardPage