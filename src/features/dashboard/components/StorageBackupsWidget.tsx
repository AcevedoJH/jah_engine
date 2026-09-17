/**
 * ============================================================
 * JAH ENGINE - Widget Storage & Remote Backups (Dashboard)
 * (src/features/dashboard/components/StorageBackupsWidget.tsx)
 * ============================================================
 * Gadget del Modulo 3 para la vista principal. Resume en un vistazo
 * el estado del sistema de copias de seguridad mediante 4 KPIs y un
 * enlace directo a la vista detallada `/backups`.
 *
 * ============ ¿CÓMO SE COMPONE UN DASHBOARD? ============
 * Un dashboard es un "patio de juegos" de widgets: cada pieza es un
 * componente INDEPENDIENTE que se encarga SOLO de su modulo, y la
 * pagina (DashboardPage) hace de CABLEADORA, montandolos en una
 * rejilla responsive. Hay dos religiones de datos para un widget:
 *
 *   1) PRESENTACIONAL: no sabe de donde salen los datos; los recibe
 *      por PROPS de quien los posee (es el caso de BenchmarkWidget,
 *      alimentado por el estado global del BenchmarkContext).
 *   2) AUTONOMO: el widget pide sus propios datos a la capa de
 *      servicio, gestiona su loading/error y decide como pintarse.
 *      ESTE es el caso de este widget (y de HomeLabMonitorWidget).
 *
 * ¿Por que autonomo aqui? Para no duplicar estado global: las
 * metricas de backups no cambian en tiempo real ni se comparten entre
 * pantallas (a diferencia del benchmark), asi que no merece la pena
 * subirlas a un Context. El widget baja datos cuando se monta y ya.
 *
 * ============ REUTILIZACIÓN DE LA CAPA DE SERVICIO ============
 * Este widget importa LAS MISMAS funciones que BackupsPage
 * (getRemoteTargets / getBackupJobs / getSnapshots) desde
 * `backupService.ts`. Por eso NO conoce (ni le importa) el origen:
 *   - VITE_USE_MOCK_DATA=true  -> responde mockBackupData tras 300ms.
 *   - VITE_USE_MOCK_DATA=false -> fetch contra VITE_API_BASE_URL.
 * El dia que el backend este en produccion, este widget seguira
 * funcionando sin tocar una linea: es la inversion de dependencia
 * del patron Repository/Service Layer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  Cloud,
  HardDrive,
  History,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  getBackupJobs,
  getRemoteTargets,
  getSnapshots,
} from '@/features/backups/services/backupService'
import type { BackupJob, RemoteTarget, Snapshot } from '@/features/backups/types/backup'
import { cn } from '@/utils/cn'
import { formatBytes, formatClockTime, formatNumber } from '@/utils/format'

/* =====================================================================
   ====================== DATOS DEL WIDGET (mock/API) ==================
   ===================================================================== */

/**
 * Paquete de datos que el widget necesita para pintar sus KPIs.
 * Agrupa las tres colecciones en UN solo objeto: se cargan en paralelo
 * con Promise.all y se guardan juntas con un unico setState (menos
 * estados parciales = menos errores de "medio actualizado").
 */
interface BackupsSnapshot {
  readonly targets: RemoteTarget[]
  readonly jobs: BackupJob[]
  readonly snapshots: Snapshot[]
}

/* =====================================================================
   ==================== COMPONENTE AUXILIAR: KpiCell ====================
   ===================================================================== */

/**
 * Una celda del grid 2x2 de KPIs (metrica clave del modulo).
 * Componente puro interno, no exportado.
 *
 * @param icon      - Icono lucide de la metrica.
 * @param label     - Nombre corto de la metrica (ej. "Espacio usado").
 * @param value     - Valor principal formateado (ej. "697.2 GiB").
 * @param subtext   - Micro-caption bajo el valor (contexto adicional).
 * @param badge     - Badge de alerta opcional (ej. destino unreachable).
 * @param valueClass- Clase Tailwind del color del valor (verde/rojo...).
 */
function KpiCell({
  icon,
  label,
  value,
  subtext,
  badge,
  valueClass,
}: {
  icon: ReactNode
  label: string
  value: string
  subtext: string
  badge?: ReactNode
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </span>
        {badge}
      </div>
      <p className={cn('mt-1 font-mono text-base font-semibold text-foreground sm:text-lg', valueClass)}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtext}</p>
    </div>
  )
}

/* =====================================================================
   ====== ESTADOS DE CARGA Y ERROR (misma filosofia que otros widgets) ==
   ===================================================================== */

/**
 * Skeleton de carga: dibuja la MISMA estructura que el contenido real
 * pero con bloques pulsantes (animate-pulse). Evita el "layout shift"
 * (salto brusco del layout) cuando los datos llegan: la tarjeta no
 * cambia de tamano, solo se rellena.
 */
function StorageSkeleton() {
  return (
    // `h-full` + `min-h-[340px]`: el skeleton adopta la MISMA altura
    // base que BenchmarkWidget para que, mientras carga, el grid ya
    // tenga las dos tarjetas simetricas (sin saltos al llegar datos).
    <Card className="flex h-full min-h-[340px] flex-col animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="h-5 w-48 rounded bg-muted" />
          </div>
          <div className="h-8 w-20 rounded-md bg-muted" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Simula la descripcion del modulo. */}
        <div className="h-3 w-full rounded bg-muted" />
        {/* Simula el grid 2x2 de KPIs. */}
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2 rounded-lg border bg-muted p-3">
              <div className="h-3 w-3/4 rounded bg-muted" />
              <div className="h-5 w-1/2 rounded bg-muted" />
              <div className="h-2.5 w-5/6 rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Estado de error con boton de reintento: avisa con un icono de alerta
 * y ofrece repreguntar a la capa de servicio (no al usuario).
 */
function StorageErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="flex h-full flex-col border-destructive/50">
      <CardContent className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground">Error de Backups</h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}

/* =====================================================================
   ==================== COMPONENTE PRINCIPAL ===========================
   ===================================================================== */

/** Widget autonomo de Storage & Remote Backups para el Dashboard. */
export function StorageBackupsWidget() {
  // --- Navegacion declarativa (React Router) ---
  // El widget navega por SU cuenta a la pagina completa del modulo;
  // no necesita que el Dashboard le inyecte un callback.
  const navigate = useNavigate()

  /* --------------------------------------------------------------
     CARGA DE DATOS DESDE LA CAPA DE SERVICIO (mock/API)
     --------------------------------------------------------------
     Patron identico al de useTelemetry y al historial de la pagina:
     funcion async + guardia de montaje + estado de error + reintento.
     `Promise.all` lanza las tres peticiones EN PARALELO: no espera a
     que termine una para empezar la siguiente, tardan el maximo de
     una sola (300ms del mock) en lugar de la suma. */
  const [data, setData] = useState<BackupsSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /** Contador para forzar la recarga ("Reintentar"): al incrementarlo,
   *  el efecto se re-ejecuta (es su dependencia). */
  const [reloadKey, setReloadKey] = useState(0)

  /** Guardia anti-desmontaje: evita setState sobre componente desmontado. */
  const mountedRef = useRef(true)

  /** Baja las metricas del modulo desde backupService. */
  const loadBackups = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Las tres llamadas comparten la misma fachada: si una falla,
      // Promise.all rechaza con el primer error y caemos en el catch.
      const [targets, jobs, snapshots] = await Promise.all([
        getRemoteTargets(),
        getBackupJobs(),
        getSnapshots(),
      ])
      // Solo actualizamos el estado si el widget sigue montado.
      if (mountedRef.current) {
        setData({ targets, jobs, snapshots })
        setIsLoading(false)
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return
      const message =
        err instanceof Error ? err.message : 'Error desconocido al cargar los backups.'
      setError(message)
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // EXCEPCION DOCUMENTADA (misma que en useTelemetry/BenchmarkPage):
    // patron canonico de "fetch on mount". `loadBackups` va a pedir
    // datos y, al volver, actualizar estados; la regla
    // react/set-state-in-effect apunta a reacciones a props/estado,
    // no a peticiones de red. Por eso la desactivamos puntualmente.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadBackups()

    return () => {
      mountedRef.current = false
    }
  }, [loadBackups, reloadKey])

  // --- Estados de carga y error (misma estructura visual) ---
  if (isLoading) {
    return <StorageSkeleton />
  }
  if (error) {
    return <StorageErrorState error={error} onRetry={() => setReloadKey((key) => key + 1)} />
  }
  // Seguridad: sin datos tras no-error no pintamos nada.
  if (!data) return null

  /* --------------------------------------------------------------
     METRICAS DERIVADAS DE LOS DATOS CRUDOS
     --------------------------------------------------------------
     El widget NO muestra los datos tal cual: los reduce a KPIs. Son
     calculos puros sobre los modelos de dominio (RemoteTarget, BackupJob,
     Snapshot) que devuelve la capa de servicio. */
  const targets = data.targets
  const jobs = data.jobs
  const snapshots = data.snapshots

  // 1) Espacio total usado: suma del campo `usedStorageGb` (ya en GiB)
  //    de todos los destinos, pasado a bytes para formatBytes (1024^3).
  const totalStorageGiB = targets.reduce((acc, target) => acc + target.usedStorageGb, 0)

  // 2) Salud de destinos remotos.
  const connectedCount = targets.filter((target) => target.status === 'connected').length
  const unreachableCount = targets.length - connectedCount
  const hasAlerts = unreachableCount > 0

  // 3) Jobs activos: solo los habilitados ('active' o en 'running'
  //    ahora mismo). Pausados/completados NO cuentan como programados.
  const activeJobs = jobs.filter(
    (job) => job.status === 'active' || job.status === 'running',
  )
  // Proxima ejecucion: la fecha mas temprana de `nextRun` entre los
  // jobs activos. Las ISO ordenan lexicograficamente = cronologicamente.
  const nextRunTime = activeJobs
    .map((job) => job.nextRun)
    .filter((value): value is string => value !== null)
    .sort()[0]

  // 4) Snapshots: cada punto de restauracion certifica integridad.
  const snapshotCount = snapshots.length

  return (
    // `h-full flex flex-col`: ocupa el alto estirado del grid (simetria
    // con BenchmarkWidget) y permite repartir el interior en vertical.
    <Card className="flex h-full flex-col">
      {/* Cabecera: titulo con icono de almacenamiento + enlace a la
          vista detallada (patron "hub-and-spoke": el dashboard es el
          hub y cada widget dispara hacia su modulo). */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Storage &amp; Remote Backups</CardTitle>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/backups')}>
            Ver todo
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <CardDescription className="text-xs">
          Copias cifradas en origen con AES-256 y sincronización remota vía Rclone / S3.
        </CardDescription>

        {/* ==========================================================
            GRID 2x2 DE KPI CARDS
            ==========================================================
            En movil la tarjeta ya entra en 2 columnas (cada KPI es
            compacto); el widget se adapta solo porque el propio grid
            del dashboard es responsive. Cada celda resume UNA dimension
            del estado de las copias. */}
        <div className="grid grid-cols-2 gap-3">
          {/* KPI 1 - ESPACIO USADO */}
          <KpiCell
            icon={<HardDrive className="h-3.5 w-3.5" />}
            label="Espacio usado"
            value={formatBytes(totalStorageGiB * 1024 ** 3)}
            subtext={`En ${formatNumber(targets.length)} destinos`}
          />

          {/* KPI 2 - DESTINOS (con alerta si hay alguno caido) */}
          <KpiCell
            icon={<Cloud className="h-3.5 w-3.5" />}
            label="Destinos"
            value={`${formatNumber(connectedCount)} / ${formatNumber(targets.length)}`}
            subtext={
              hasAlerts ? `${formatNumber(unreachableCount)} sin conexión` : 'Todos conectados'
            }
            valueClass={hasAlerts ? 'text-rose-500' : 'text-emerald-500'}
            badge={
              hasAlerts ? (
                <span className="rounded-full bg-rose-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400">
                  Alerta
                </span>
              ) : undefined
            }
          />

          {/* KPI 3 - TAREAS CRON ACTIVAS */}
          <KpiCell
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Tareas cron"
            value={`${formatNumber(activeJobs.length)}`}
            subtext={
              nextRunTime
                ? `Próxima ejecución a las ${formatClockTime(nextRunTime).slice(0, 5)}`
                : 'Sin ejecución programada'
            }
          />

          {/* KPI 4 - SNAPSHOTS (puntos de restauracion) */}
          <KpiCell
            icon={<History className="h-3.5 w-3.5" />}
            label="Snapshots"
            value={`${formatNumber(snapshotCount)}`}
            subtext="Checksums verificados SHA-256"
          />
        </div>
      </CardContent>
    </Card>
  )
}

export default StorageBackupsWidget