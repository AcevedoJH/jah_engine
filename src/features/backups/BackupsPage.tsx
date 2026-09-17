/**
 * ============================================================
 * JAH ENGINE - Storage & Remote Backups
 * (src/features/backups/BackupsPage.tsx)
 * ============================================================
 * Vista COMPLETA del Modulo 3: gestiona destinos remotos cifrados
 * (Rclone/S3), jobs de backup con ejecucion manual y la tabla de
 * snapshots restaurables.
 *
 * ============ REGLA 3-2-1 (cultura del modulo) ============
 * La regla de oro de la resiliencia:
 *   - 3 copias de los datos          (original + 2 respaldos).
 *   - 2 medios distintos             (local + nube, por ej.).
 *   - 1 copia FUERA del sitio        (sobrevive a un desastre local).
 * Los "destinos remotos" de abajo son las ubicaciones OFF-SITE de esa
 * tercera copia; los snapshots son los puntos de restauracion.
 *
 * ============ RCLONE CON CIFRADO LOCAL (crypt) ============
 * Rclone puede envolver cualquier destino (S3, B2, SFTP...) con una
 * capa "crypt": los ficheros se cifran AES-256 EN EL EQUIPO LOCAL
 * ANTES de subir. El proveedor nunca ve el contenido en claro.
 * Por eso cada tarjeta de destino indica si es cifrado ("AES-256"),
 * la configuracion RECOMENDADA para la copia por definicion.
 *
 * ============ ESTADOS ASINCRONOS EN REACT ============
 * Este componente demuestra el patron basico de una operacion async:
 *   1. La UI recuerda "que" operacion esta pendiente con UN solo
 *      estado: `runningJobId` (fabrica de la carga).
 *   2. Mientras dura, el boton queda DESHABILITADO y muestra un
 *      spinner: el usuario ve el estado y no puede lanzar otra.
 *   3. Al terminar, el estado vuelve a null y la UI refleja el
 *      resultado (el job pasa a 'completed' con su nuevo lastRun).
 * En produccion, el setTimeout seria una llamada a la API con
 * try/catch/finally y gestion de rechazo; aqui simulamos la latencia
 * para no depender de backend.
 */

import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  HardDrive,
  Loader2,
  Lock,
  Play,
  RotateCcw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { BackToDashboardButton } from '@/components/layout/BackToDashboardButton'
import { cn } from '@/utils/cn'
import { formatBytes, formatClockTime, formatNumber } from '@/utils/format'
import type {
  BackupJob,
  BackupJobStatus,
  RemoteProvider,
  RemoteTarget,
  Snapshot,
} from './types/backup'

/* =====================================================================
   ========================= DATOS DE DEMO (MOCK) ======================
   =====================================================================
   Datos completamente tipados con los contratos del modulo. En el
   futuro vendran del microservicio (vía WebSocket/integración), pero
   su forma obliga a que la UI ya este preparada. */

const REMOTE_TARGETS: RemoteTarget[] = [
  {
    id: 'r1',
    name: 'S3 - Produccion',
    provider: 's3',
    bucketOrPath: 'jah-prod-backups',
    encrypted: true,
    usedStorageGb: 412.6,
    status: 'online',
  },
  {
    id: 'r2',
    name: 'B2 - Archivado',
    provider: 'b2',
    bucketOrPath: 'jah-archive',
    encrypted: true,
    usedStorageGb: 188.2,
    status: 'online',
  },
  {
    id: 'r3',
    name: 'Rclone NAS Casa',
    provider: 'rclone',
    bucketOrPath: 'nas:backups-sin-cifrar',
    encrypted: false,
    usedStorageGb: 96.4,
    status: 'offline',
  },
]

const BACKUP_JOBS: BackupJob[] = [
  {
    id: 'j1',
    name: 'NAS - Fotos Julio',
    sourcePath: '/vol1/fotos',
    targetId: 'r1',
    cron: '0 2 * * *',
    lastRun: '2026-09-16T02:00:00',
    nextRun: '2026-09-18T02:00:00',
    status: 'active',
    sizeMb: 204_800,
  },
  {
    id: 'j2',
    name: 'Servidor - Bases MySQL',
    sourcePath: '/var/backups/db',
    targetId: 'r1',
    cron: '30 3 * * *',
    lastRun: '2026-09-16T03:30:00',
    nextRun: '2026-09-18T03:30:00',
    status: 'completed',
    sizeMb: 12_800,
  },
  {
    id: 'j3',
    name: 'Documentos - Archivado legal',
    sourcePath: '/srv/legal',
    targetId: 'r2',
    cron: '0 5 * * 1',
    lastRun: '2026-09-14T05:00:00',
    nextRun: '2026-09-21T05:00:00',
    status: 'paused',
    sizeMb: 3_200,
  },
]

const SNAPSHOTS: Snapshot[] = [
  {
    id: 's1',
    jobId: 'j1',
    jobName: 'NAS - Fotos Julio',
    timestamp: '2026-09-16T02:00:00',
    size: 109_678_592,
    target: 'S3 - Produccion',
    checksum: 'a41f9a2b_9c3e...b5d0',
  },
  {
    id: 's2',
    jobId: 'j1',
    jobName: 'NAS - Fotos Julio',
    timestamp: '2026-09-15T02:00:00',
    size: 109_488_640,
    target: 'S3 - Produccion',
    checksum: 'c29e8d1f_77ab...f120',
  },
  {
    id: 's3',
    jobId: 'j2',
    jobName: 'Servidor - Bases MySQL',
    timestamp: '2026-09-16T03:30:00',
    size: 13_421_772,
    target: 'S3 - Produccion',
    checksum: '81cd6ce4_00aa...c9e7',
  },
  {
    id: 's4',
    jobId: 'j3',
    jobName: 'Documentos - Archivado legal',
    timestamp: '2026-09-14T05:00:00',
    size: 3_355_443,
    target: 'B2 - Archivado',
    checksum: 'f5b0de12_44cc...8d21',
  },
]

/* =====================================================================
   ======================= MAPAS DE PRESENTACION ========================
   ===================================================================== */

/** Icono por proveedor remoto (se importa como componente <JSX/>). */
const PROVIDER_ICONS: Record<RemoteProvider, LucideIcon> = {
  s3: Cloud,
  rclone: HardDrive,
  b2: Server,
}

/** Etiquetas legibles de estado del job para el badge de la fila. */
const JOB_STATUS_LABELS: Record<BackupJobStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  running: 'En ejecución',
  completed: 'Completado',
  failed: 'Fallido',
}

/** Estilos del badge de estado del job (green/neutro/rojo por token). */
const JOB_STATUS_STYLES: Record<BackupJobStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-muted text-muted-foreground',
  running: 'bg-emerald-500/15 text-emerald-400 animate-pulse',
  completed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-rose-600/15 text-rose-400',
}

/* =====================================================================
   ===================== COMPONENTE PRINCIPAL ===========================
   ===================================================================== */

/** Vista completa de Storage & Remote Backups. */
export function BackupsPage() {
  /* -------------------------------------------------------------
     ESTADO DE LOS JOBS (se pueden MUTAR: "Ejecutar Ahora").
     `runningJobId` es la "fabrica de la carga": mientras tenga un
     id, sabemos QUÉ job está ejecutandose y la UI bloquea re-espisodios.
     ------------------------------------------------------------- */
  const [jobs, setJobs] = useState<BackupJob[]>(BACKUP_JOBS)
  const [runningJobId, setRunningJobId] = useState<string | null>(null)

  /* `restoringId` sigue el mismo patron para la accion "Restaurar"
     de los snapshots: un unico id pendiente = un unico spinner. */
  const [restoringId, setRestoringId] = useState<string | null>(null)

  /* Ref del temporizador activo: al desmontarse la pagina limpiamos
     el timeout pendiente para no hacer setState sobre componente
     desmontado (fuga clasica de la asincronia en React). */
  const timerRef = useRef<number | null>(null)

  // Cleanup de ciclo de vida: si el usuario navega a otra vista
  // mientras un "run" simulado sigue en vuelo, cancelamos el timer.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  /* -------------------------------------------------------------
     METRICAS DEL ENCABEZADO (derivadas del estado/constantes).
     Suma del espacio usado, destinos online, jobs no-pausados y
     numero de snapshots guardados.
     ------------------------------------------------------------- */
  const totalUsedStorageGb = REMOTE_TARGETS.reduce(
    (suma, remote) => suma + remote.usedStorageGb,
    0,
  )
  const onlineTargets = REMOTE_TARGETS.filter((r) => r.status === 'online').length
  const activeJobs = jobs.filter((j) => j.status !== 'paused').length

  /* Mapa remoteId -> nombre del destino, para resolver la fila de
     un job (targetId) sin estar buscando en cada render con find(). */
  const targetNameById = new Map(REMOTE_TARGETS.map((r) => [r.id, r.name]))

  /* -------------------------------------------------------------
     "EJECUTAR AHORA" (operacion asincrona simulada)
     -------------------------------------------------------------
     1. Marcamos el job como 'running' y guardamos su id.
     2. setTimeout simula la latencia de red/frontal de Rclone.
     3. Al terminar: el job pasa a 'completed' y lastRun se actualiza
        al instante actual (ISO), porque de verdad "corrio".
     El estado `runningJobId` se cierra en null para liberar la UI.
     ------------------------------------------------------------- */
  function runJobNow(jobId: string): void {
    // Sentinela: si ya hay un job en vuelo, ignoramos (evita que el
    // usuario lance dos ejecuciones simultaneas de un mismo job).
    if (runningJobId !== null) return

    setRunningJobId(jobId)
    setJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, status: 'running' } : job)),
    )

    timerRef.current = window.setTimeout(() => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, status: 'completed', lastRun: new Date().toISOString() }
            : job,
        ),
      )
      setRunningJobId(null)
    }, 1800)
  }

  /* "Restaurar" snapshot: misma idea (loading con id unico), pero
     aqui NO mutamos el snapshot: en produccion se descargaria de un
     punto concreto. Tras el wait volvemos al reposo. */
  function restoreSnapshot(snapshotId: string): void {
    if (restoringId !== null) return
    setRestoringId(snapshotId)
    timerRef.current = window.setTimeout(() => {
      setRestoringId(null)
    }, 1600)
  }

  return (
    <section className="space-y-6">
      {/* ================= CABECERA ================= */}
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <DatabaseBackup className="h-6 w-6 text-primary" /> Storage &amp; Remote Backups
        </h1>
        <p className="text-sm text-muted-foreground">
          Copias cifradas en origen (AES-256) con sincronización remota vía Rclone / S3.
        </p>
      </header>

      {/* ================= RESUMEN / METRICAS ================= */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Espacio usado en remoto</p>
            <p className="mt-1 flex items-end gap-1 font-mono text-xl font-semibold text-foreground">
              {formatNumber(Number(totalUsedStorageGb.toFixed(1)))}
              <span className="text-xs text-muted-foreground">GiB</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Destinos activos</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {onlineTargets}/{REMOTE_TARGETS.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Jobs activos</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">{activeJobs}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Snapshots</p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {SNAPSHOTS.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Callout didactico de la regla 3-2-1 (cultura del modulo). */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-foreground">Regla 3-2-1:</span> 3 copias de tus
          datos, en 2 medios distintos, y 1 copia <span className="font-medium text-foreground">fuera del sitio</span>.
          Los destinos remotos de abajo son esa copia off-site; los snapshots, sus puntos de
          restauración.
        </p>
      </div>

      {/* ================= DESTINOS REMOTOS (Rclone/S3) ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Destinos cifrados (Rclone Remotes)</CardTitle>
          <CardDescription>
            Cada tarjeta indica si el destino pasa por una capa crypt (cifrado local AES-256)
            y si está operativo ahora mismo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REMOTE_TARGETS.map((remote) => {
              const ProviderIcon = PROVIDER_ICONS[remote.provider]
              const isOnline = remote.status === 'online'
              return (
                <div
                  key={remote.id}
                  className={cn(
                    'rounded-lg border bg-muted/30 p-3',
                    isOnline ? 'border-border' : 'border-rose-500/40',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ProviderIcon className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{remote.name}</span>
                    </div>
                    {isOnline ? (
                      <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> En línea
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-rose-500">
                        <XCircle className="h-3.5 w-3.5" /> Caído
                      </span>
                    )}
                  </div>

                  <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                    {remote.bucketOrPath}
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    {remote.encrypted ? (
                      <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-500">
                        <Lock className="h-3 w-3" /> AES-256
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        Sin cifrar
                      </Badge>
                    )}
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatNumber(remote.usedStorageGb)} GiB
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ================= JOBS DE BACKUP ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jobs de backup</CardTitle>
          <CardDescription>
            Programación cron y ejecución manual con estado de carga en vivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {jobs.map((job) => {
              const isThisJobRunning = runningJobId === job.id
              const isAnyJobRunning = runningJobId !== null
              const targetName = targetNameById.get(job.targetId) ?? 'Desconocido'
              return (
                <li key={job.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{job.name}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          JOB_STATUS_STYLES[job.status],
                        )}
                      >
                        {JOB_STATUS_LABELS[job.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {job.sourcePath} → {targetName}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> cron: <span className="font-mono">{job.cron}</span>
                      </span>
                      <span>
                        última: <span className="font-mono">{formatClockTime(job.lastRun)}</span>
                      </span>
                      <span>
                        próxima: <span className="font-mono">{formatClockTime(job.nextRun)}</span>
                      </span>
                      <span>
                        {formatBytes(job.sizeMb * 1024 * 1024)}
                      </span>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runJobNow(job.id)}
                    disabled={isAnyJobRunning || job.status === 'paused'}
                    title={
                      job.status === 'paused'
                        ? 'El job está pausado: actívalo antes de ejecutarlo'
                        : 'Lanzar esta copia ahora'
                    }
                    className="shrink-0"
                  >
                    {isThisJobRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Ejecutando...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Ejecutar Ahora
                      </>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* ================= TABLA DE SNAPSHOTS ================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshots y restauración</CardTitle>
          <CardDescription>
            Cada punto de restauración incluye su checksum de integridad para verificar
            que los datos llegan completos e intactos.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {SNAPSHOTS.map((snapshot) => (
              <li key={snapshot.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-medium text-foreground">{snapshot.jobName}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatClockTime(snapshot.timestamp)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatBytes(snapshot.size)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>destino: <span className="font-medium text-foreground">{snapshot.target}</span></span>
                    <span title={snapshot.checksum} className="max-w-[200px] truncate font-mono">
                      sha256:{snapshot.checksum}
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreSnapshot(snapshot.id)}
                  disabled={restoringId !== null}
                  className="shrink-0"
                >
                  {restoringId === snapshot.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Restaurando...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" /> Restaurar
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <BackToDashboardButton />
    </section>
  )
}

export default BackupsPage