/**
 * ============================================================
 * JAH ENGINE - Storage & Remote Backups
 * (src/features/backups/BackupsPage.tsx)
 * ============================================================
 * Vista COMPLETA del Modulo 3: destinos remotos cifrados (Rclone/S3),
 * jobs de backup con ejecucion manual y snapshots restaurables.
 *
 * ============ SERVICE LAYER: LA UI NO CONOCE EL ORIGEN DE DATOS ============
 * Esta pagina NO importa ni una constante mock ni consulta fetch:
 * SOLO consume las funciones expuestas por services/backupService.ts.
 *   - VITE_USE_MOCK_DATA=true  -> la capa responde desde mockBackupData
 *     con una latencia artificial de 300ms.
 *   - VITE_USE_MOCK_DATA=false -> la misma UI, sin tocar una linea,
 *     pasa a consultar la API real (VITE_API_BASE_URL).
 * Beneficio: podemos construir toda la interfaz con datos simulados y
 * "enchufarla" al backend solo con girar una variable de entorno.
 *
 * ============ REGLA 3-2-1 (cultura del modulo) ============
 * 3 copias de los datos, en 2 medios distintos, 1 copia FUERA del
 * sitio. Los destinos remotos de abajo son esa copia off-site; los
 * snapshots, sus puntos de restauracion.
 *
 * ============ PATRON DE CARGA ASINCRONA EN LA VISTA ============
 *  - Carga inicial: useEffect + Promise.all (las 3 lecturas en
 *    paralelo). Con un flag `cancelled`/mountedRef evitamos hacer
 *    setState sobre un componente ya desmontado (fuga clasica).
 *  - Acciones ("Ejecutar Ahora", "Restaurar"): los handlers son
 *    `async`; mientras la Promise esta en vuelo, un unico id en
 *    estado (runningJobId / restoringId) deshabilita la UI y pinta
 *    el spinner. Al resolver, se aplica el resultado del servicio.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  CheckCircle2,
  Cloud,
  DatabaseBackup,
  Folder,
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
import type { BackupJob, BackupJobStatus, RemoteProvider, RemoteTarget, Snapshot } from './types/backup'
import * as backupService from './services/backupService'

/* =====================================================================
   ======================= MAPAS DE PRESENTACION ========================
   ===================================================================== */

/** Icono por proveedor remoto (se importa como componente <JSX/>). */
const PROVIDER_ICONS: Record<RemoteProvider, LucideIcon> = {
  s3: Cloud,
  rclone: HardDrive,
  b2: Server,
  // SFTP: navega rutas de filesystem remoto, por eso un icono de carpeta.
  sftp: Folder,
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
     ESTADO DE DATOS (llegan del SERVICE LAYER, no de constantes).
     Se inicializan vacios y se rellenan en el useEffect de carga.
     `isLoading` / `loadError` drenar el estado de la carga inicial.
     ------------------------------------------------------------- */
  const [targets, setTargets] = useState<RemoteTarget[]>([])
  const [jobs, setJobs] = useState<BackupJob[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /* -------------------------------------------------------------
     FABRICAS DE CARGA DE ACCIONES:
     `runningJobId` -> el job que se esta ejecutando ahora (spinner).
     `restoringId`  -> el snapshot que se esta restaurando (spinner).
     Mientras un id es distinto de null, la UI bloquea repetir la
     misma accion (single-flight).
     ------------------------------------------------------------- */
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  /* REF de ciclo de vida: true mientas el componente esta montado.
     Todos los `await` de este componente consultan este ref ANTES de
     tocar estado, para no setState sobre un nodo ya desmontado. */
  const mountedRef = useRef(true)

  /* -------------------------------------------------------------
     CARGA INICIAL (paralela) desde la capa de servicio.
     `loadData` esta en useCallback para poder invocarlo tanto desde
     el useEffect como desde el boton "Reintentar", manteniendo la
     MENTIRA del efecto estable (deps []). Dentro se atrapa el error
     y se vuelca en `loadError` para pintar una vista de recuperacion.
     ------------------------------------------------------------- */
  const loadData = useCallback(async (): Promise<void> => {
    try {
      // Promise.all lanza las 3 lecturas a la vez (latencia total ~300ms
      // en vez de 900ms) y se resuelve cuando estan las 3.
      const [remoteTargets, backupJobs, restorePoints] = await Promise.all([
        backupService.getRemoteTargets(),
        backupService.getBackupJobs(),
        backupService.getSnapshots(),
      ])
      if (!mountedRef.current) return
      setTargets(remoteTargets)
      setJobs(backupJobs)
      setSnapshots(restorePoints)
    } catch (error) {
      if (!mountedRef.current) return
      setLoadError(error instanceof Error ? error.message : 'Error desconocido al cargar.')
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // En StrictMode el efecto se monta/desmonta/monta: RESTAURAMOS el
    // flag a true en cada arranque para que la segunda carga funcione.
    mountedRef.current = true
    // EXCEPCIÓN DOCUMENTADA: patron canonico de data fetching (fetch on
    // mount); loadData() establece isLoading() tras su await. Misma
    // justificación que src/features/network/hooks/useTelemetry.ts.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadData()
    return () => {
      mountedRef.current = false
    }
  }, [loadData])

  /* -------------------------------------------------------------
     METRICAS DERIVADAS (ahora del ESTADO, no de constantes mock).
     ------------------------------------------------------------- */
  const totalUsedStorageGb = targets.reduce((suma, remote) => suma + remote.usedStorageGb, 0)
  const connectedTargets = targets.filter((r) => r.status === 'connected').length
  const activeJobs = jobs.filter((j) => j.status !== 'paused').length

  /* Mapa remoteId -> nombre del destino (resolucion O(1) en las filas
     de jobs en lugar de un find() por render). */
  const targetNameById = new Map(targets.map((r) => [r.id, r.name]))

  /* -------------------------------------------------------------
     ACCION: "EJECUTAR AHORA" (async, optimistic update).
     1. Marcamos el job como 'running' DE INMEDIATO (optimismo: la UI
        responde antes de que termine el servidor).
     2. `await backupService.runBackupJob(jobId)` resuelve con el job
        actualizado; lo sustituimos de una vez en la lista.
     3. Si falla, revertimos el job a 'failed' para que el error sea
        visible. En modo mock nunca llega, pero el camino esta listo
        para la API real.
     ------------------------------------------------------------- */
  async function runJobNow(jobId: string): Promise<void> {
    if (runningJobId !== null) return
    setRunningJobId(jobId)
    setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, status: 'running' } : job)))
    try {
      const updated = await backupService.runBackupJob(jobId)
      if (!mountedRef.current) return
      setJobs((prev) => prev.map((job) => (job.id === jobId ? updated : job)))
    } catch {
      if (!mountedRef.current) return
      setJobs((prev) => prev.map((job) => (job.id === jobId ? { ...job, status: 'failed' } : job)))
    } finally {
      if (mountedRef.current) setRunningJobId(null)
    }
  }

  /* -------------------------------------------------------------
     ACCION: "RESTAURAR" snapshot. No devuelve datos del snapshot;
     la Promise es solo una senal de "terminado/fallido" para apagar
     el spinner. El nombre coincide con el de la capa de servicio,
     por eso alli lo usamos cualificado (backupService.restoreSnapshot).
     ------------------------------------------------------------- */
  async function restoreSnapshot(snapshotId: string): Promise<void> {
    if (restoringId !== null) return
    setRestoringId(snapshotId)
    try {
      await backupService.restoreSnapshot(snapshotId)
    } catch {
      // En produccion aqui habria un toast de "restauracion fallida".
    } finally {
      if (mountedRef.current) setRestoringId(null)
    }
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

      {/* ============ ESTADOS DE CARGA INICIAL Y ERROR ============ */}
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Cargando datos desde la capa de servicio...
          </CardContent>
        </Card>
      ) : loadError !== null ? (
        <Card className="border-rose-500/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
            <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">No se pudieron cargar los datos:</span>{' '}
              {loadError}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // El reset sincrono se dispara DESDE UN EVENTO (click),
                // permitido por la norma, y no desde dentro del efecto.
                setLoadError(null)
                setIsLoading(true)
                void loadData()
              }}
              className="shrink-0"
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
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
                <p className="text-xs text-muted-foreground">Destinos conectados</p>
                <p className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {connectedTargets}/{targets.length}
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
                  {snapshots.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Callout didactico de la regla 3-2-1. */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <p>
              <span className="font-semibold text-foreground">Regla 3-2-1:</span> 3 copias de tus
              datos, en 2 medios distintos, y 1 copia{' '}
              <span className="font-medium text-foreground">fuera del sitio</span>. Los destinos
              remotos de abajo son esa copia off-site; los snapshots, sus puntos de restauración.
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
                {targets.map((remote) => {
                  const ProviderIcon = PROVIDER_ICONS[remote.provider]
                  const isConnected = remote.status === 'connected'
                  return (
                    <div
                      key={remote.id}
                      className={cn(
                        'rounded-lg border bg-muted/30 p-3',
                        isConnected ? 'border-border' : 'border-rose-500/40',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ProviderIcon className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">
                            {remote.name}
                          </span>
                        </div>
                        {isConnected ? (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                            <CheckCircle2 className="h-3.5 w-3.5" /> En línea
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] text-rose-500">
                            <XCircle className="h-3.5 w-3.5" /> No alcanzable
                          </span>
                        )}
                      </div>

                      <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                        {remote.bucketOrPath}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        {remote.encrypted ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-emerald-500/40 text-emerald-500"
                          >
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
                    <li
                      key={job.id}
                      className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
                    >
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
                            <CalendarClock className="h-3 w-3" /> cron:{' '}
                            <span className="font-mono">{job.cron}</span>
                          </span>
                          <span>
                            última:{' '}
                            <span className="font-mono">{formatClockTime(job.lastRun)}</span>
                          </span>
                          <span>
                            próxima:{' '}
                            <span className="font-mono">{formatClockTime(job.nextRun)}</span>
                          </span>
                          <span>{formatBytes(job.sizeMb * 1024 * 1024)}</span>
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runJobNow(job.id)}
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
                Cada punto de restauración incluye su checksum SHA-256 de integridad para
                verificar que los datos llegan completos e intactos.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
                  >
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
                        <span>
                          destino:{' '}
                          <span className="font-medium text-foreground">{snapshot.target}</span>
                        </span>
                        <span title={snapshot.checksum} className="max-w-[200px] truncate font-mono">
                          sha256:{snapshot.checksum}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void restoreSnapshot(snapshot.id)}
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
        </>
      )}

      {/* Boton compartido de retorno, visible siempre (incluso en carga). */}
      <BackToDashboardButton />
    </section>
  )
}

export default BackupsPage