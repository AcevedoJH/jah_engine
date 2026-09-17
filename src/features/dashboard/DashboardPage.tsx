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

         2) `items-stretch` (ALINEACION DE ITEMS - simetria de fila):
            `align-items: stretch` es el valor POR DEFECTO de Grid: los
            items de una MISMA fila igualan su altura al hermano mas
            alto. Lo hacemos EXPLICITO porque es justo lo que queremos
            en la fila inferior (Benchmark y Backups, una tarjeta por
            columna): ambas terminan con la MISMA altura y el grid queda
            simetrico. Para que funcione, cada tarjeta hija usa `h-full`
            (100% del wrapper ya estirado) y `flex flex-col`, de modo que
            su interior se reparte y el pie/boton queda abajo.
            ¿Y el hero (row 1)? Esta SOLO en su fila (col-span-2), sin
            hermano con quien igualarse: su altura la marca su contenido.
            Por eso aqui `stretch` no reintroduce el "estiramiento
            vertical" que sufríamos cuando compartia fila con las otras
            dos tarjetas apiladas.

         3) `gap-6`: separacion uniforme entre celdas, tanto en filas
            como en columnas, sin margenes manuales en cada widget.

         4) `lg:col-span-2` en el hero: le dice a HomeLab Monitor que
            abarque las DOS columnas (formato ancho/panoramico). Los
            otros dos widgets caen solos en la fila inferior, uno por
            columna, en una cuadricula simetrica. */}
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
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