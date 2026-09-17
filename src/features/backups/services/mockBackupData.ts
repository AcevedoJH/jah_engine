/**
 * ============================================================
 * JAH ENGINE - Datos MOCK del Modulo 3 (Storage & Remote Backups)
 * (src/features/backups/services/mockBackupData.ts)
 * ============================================================
 * Repositorio de datos SIMULADOS, aislado de la UI. Cuando
 * VITE_USE_MOCK_DATA=true, backupService.ts responde con estas
 * estructuras tras una latencia artificial de 300ms, simulando el
 * comportamiento de la API real sin necesidad de backend.
 *
 * ¿Por qué un archivo aparte y no las constantes pegadas en la vista?
 * PATRON REPOSITORY / SERVICE LAYER:
 *   - La UI (BackupsPage) NO conoce la existencia de estos datos.
 *   - backupService.ts es la UNICA puerta de entrada: decide si lee
 *     de aqui (mock) o de la API (fetch) y devuelve SIEMPRE datos con
 *     el mismo contrato tipado (RemoteTarget, BackupJob, Snapshot).
 *   - Mañana, al cambiar los datos de origen, no se toca ni una linea
 *     del componente. Eso es la inversion de dependencia.
 *
 * Los datos son REALISTAS de un home lab: destinos Rclone (S3, B2,
 * SFTP), volumenes de Docker en rutas del sistema local y checksums
 * SHA-256 completos (64 caracteres hex) que la tabla de snapshots
 * mostrara como certificado de integridad.
 */

import type { BackupJob, RemoteTarget, Snapshot } from '../types/backup'

/* =====================================================================
   ======================= DESTINOS REMOTOS (RCLONE) =====================
   =====================================================================
   Cada entrada es un "remote" de Rclone (o bucket). Fijate en que
   usamos los estados del contrato: 'connected' responde, 'unreachable'
   no. La UI los pinta con semaforo verde/rojo. */

export const MOCK_TARGETS: RemoteTarget[] = [
  {
    id: 'r1',
    name: 'S3 - Bucket Produccion',
    provider: 's3',
    // Bucket real de AWS S3 donde aterrizan las copias del cluster.
    bucketOrPath: 'jah-backups-prod',
    // Capa "crypt" de Rclone: cifrado AES-256 LOCAL antes de subir.
    encrypted: true,
    usedStorageGb: 412.6,
    status: 'connected',
  },
  {
    id: 'r2',
    name: 'Backblaze B2 - Archivado',
    provider: 'b2',
    // B2 (Backblaze) es barato y es el destino clasico de archivado frio.
    bucketOrPath: 'jah-backups-archive',
    encrypted: true,
    usedStorageGb: 188.2,
    status: 'connected',
  },
  {
    id: 'r3',
    name: 'SFTP - NAS Casa',
    provider: 'sftp',
    // Remote SFTP apuntando a un NAS local (fuera de la nube).
    bucketOrPath: 'sftp://backup@nas.local/srv/backups',
    // ¡Ojo! Sin capa crypt: el proveedor ve los ficheros en claro.
    encrypted: false,
    usedStorageGb: 96.4,
    // Estado que dispara semaforo rojo en la tarjeta del destino.
    status: 'unreachable',
  },
]

/* =====================================================================
   =========================== JOBS DE BACKUP ==========================
   =====================================================================
   Tareas programadas con expresion cron (formato estandar de 5 campos)
   que unen un ORIGEN local (rutas de volumenes Docker reales) con un
   DESTINO remoto (targetId referencia a MOCK_TARGETS). */

export const MOCK_JOBS: BackupJob[] = [
  {
    id: 'j1',
    name: 'Docker - Postgres Volumen',
    // Ruta tipica de un volumen Docker en el host.
    sourcePath: '/var/lib/docker/volumes/postgres_data/_data',
    targetId: 'r1',
    // Cron: cada dia a las 02:00 (minuto 0, hora 2, todos los dia/mes/semana).
    cron: '0 2 * * *',
    lastRun: '2026-09-16T02:00:00',
    nextRun: '2026-09-18T02:00:00',
    status: 'active',
    // Tamano aproximado del origen: ~200 GiB de postgres.
    sizeMb: 204_800,
  },
  {
    id: 'j2',
    name: 'Docker - Nextcloud Volumen',
    sourcePath: '/var/lib/docker/volumes/nextcloud_data/_data',
    targetId: 'r2',
    cron: '30 3 * * *', // Cada dia a las 03:30.
    lastRun: '2026-09-16T03:30:00',
    nextRun: '2026-09-18T03:30:00',
    status: 'completed',
    sizeMb: 102_400,
  },
  {
    id: 'j3',
    name: 'Docker - Home Assistant Config',
    sourcePath: '/var/lib/docker/volumes/homeassistant_config/_data',
    targetId: 'r3', // Apunta al destino SFTP que esta unreachable.
    cron: '0 4 * * 0', // Domingo a las 04:00.
    lastRun: '2026-09-13T04:00:00',
    nextRun: '2026-09-20T04:00:00',
    // Pausado: el operador lo dejo en reposo, no ejecuta.
    status: 'paused',
    sizeMb: 5_120,
  },
]

/* =====================================================================
   =========================== SNAPSHOTS (PITR) =========================
   =====================================================================
   Historial de puntos de restauracion (Point-In-Time Recovery). Cada
   uno certifica su integridad con un checksum SHA-256 COMPLETO de
   64 caracteres hex: si al restaurar el hash no cuadra, se detecta
   corrupcion. Los tamanos estan en BYTES (formatBytes los legibiliza). */

export const MOCK_SNAPSHOTS: Snapshot[] = [
  {
    id: 's1',
    jobId: 'j1',
    jobName: 'Docker - Postgres Volumen',
    timestamp: '2026-09-16T02:00:00',
    // ~200 GiB de postgres respaldados.
    size: 214_748_364_800,
    target: 'S3 - Bucket Produccion',
    checksum: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
  },
  {
    id: 's2',
    jobId: 'j1',
    jobName: 'Docker - Postgres Volumen',
    timestamp: '2026-09-15T02:00:00',
    size: 214_748_364_800,
    target: 'S3 - Bucket Produccion',
    checksum: '2c395849e275cbb2e83fc4c0451bb8b1f04daa5d1e5c5e6e2e8a3f9c1d4b6a0e',
  },
  {
    id: 's3',
    jobId: 'j2',
    jobName: 'Docker - Nextcloud Volumen',
    timestamp: '2026-09-16T03:30:00',
    // ~100 GiB de Nextcloud.
    size: 107_374_182_400,
    target: 'Backblaze B2 - Archivado',
    checksum: '59e1748777448c69de6b800d7a33bb8129a7186dfcf6c8b4f0c2c1a5e2b3d4f5',
  },
  {
    id: 's4',
    jobId: 'j3',
    jobName: 'Docker - Home Assistant Config',
    timestamp: '2026-09-13T04:00:00',
    // ~5 GiB de configuracion del domotica.
    size: 5_368_709_120,
    target: 'SFTP - NAS Casa',
    checksum: '3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
]