/**
 * ============================================================
 * JAH ENGINE - Tipos del Módulo Storage & Remote Backups
 * (src/features/backups/types/backup.ts)
 * ============================================================
 * "Contrato de datos" INTERNO del módulo de backups, con todo el
 * detalle que necesita la UI para renderizar destinos remotos,
 * jobs y snapshots.
 *
 * ¿Por qué ubicarlos dentro de la feature y no en src/types?
 * src/types/index.ts define los contratos de TRANSPORTE con el backend
 * (lo que viaja por WebSocket: backup.status, BackupJob con
 * encryptedBytes y checksumOk...). En cambio, ESTOS tipos son el
 * "modelo de dominio" del frontend, más rico y estático: añaden
 * cron, nextRun, tamaño en MB del job, checksum de cada snapshot...
 * Es la misma separación feature-first que ya aplica el módulo
 * Benchmark (types internos vs. src/types).
 *
 * REGLA 3-2-1 DE BACKUPS (cultura del módulo):
 * La regla de oro de la resiliencia de datos dice:
 *   - 3 copias de los datos (la original + 2 respaldos).
 *   - 2 medios de almacenamiento distintos (p. ej. disco local + nube).
 *   - 1 copia FUERA del sitio (off-site), para sobrevivir a un
 *     desastre físico local (incendio, robo, inundación).
 * Cada `RemoteTarget` de abajo representa un DESTINO de esa copia
 * off-site; los snapshots son la "copias numeradas" que permiten
 * restaurar un punto concreto en el tiempo.
 *
 * CIFRADO EN ORIGEN CON RCLONE CRYPT (por qué `encrypted`):
 * Rclone permite colocar una capa "crypt" entre tus archivos y el
 * almacenamiento remoto: los datos se cifran LOCALMENTE (AES-256)
 * ANTES de subir. Así el proveedor (S3, B2...) solo ve bloques
 * cifrados y blandos; aunque alguien robara el bucket, no leería
 * nada. Por eso la UI distingue destinos marcados como cifrados:
 * son los recomendados para la copia por definición.
 */

/* =====================================================================
   ========================== DESTINOS REMOTOS ==========================
   ===================================================================== */

/**
 * Proveedores de almacenamiento remoto soportados (Rclone/S3 eq.).
 * 'sftp' se incluye porque es el destino "sin cifrar" tipico de un
 * NAS local/remoto, y la UI lo pinta en rojo para avisar al operador.
 */
export type RemoteProvider = 's3' | 'rclone' | 'b2' | 'sftp'

/**
 * Estado de salud del destino remoto (visible en las tarjetas).
 * Llega del backend conforme lo reporta el orquestador de backups.
 */
export type RemoteStatus = 'connected' | 'unreachable'

/**
 * Destino remoto donde aterrizan los backups (un "remote" de Rclone
 * o un bucket S3/B2).
 *
 * @param id            - Identificador unico (key de React).
 * @param name          - Nombre amigable del destino (ej. "S3-Prod").
 * @param provider      - Proveedor subyacente (s3 / rclone / b2).
 * @param bucketOrPath  - Bucket o ruta concreta dentro del proveedor.
 * @param encrypted     - true si este destino pasa por una capa crypt
 *                        de Rclone (cifrado AES-256 LOCAL).
 * @param usedStorageGb - Espacio consumido a dia de hoy (GiB enteros)
 *                        para las metricas del encabezado.
 * @param status        - connected (responde) u unreachable (caido).
 */
export interface RemoteTarget {
  readonly id: string
  readonly name: string
  readonly provider: RemoteProvider
  readonly bucketOrPath: string
  readonly encrypted: boolean
  readonly usedStorageGb: number
  readonly status: RemoteStatus
}

/* =====================================================================
   =========================== JOBS DE BACKUP ===========================
   ===================================================================== */

/** Estados del ciclo de vida de un job (programado o manual). */
export type BackupJobStatus =
  | 'active' // habilitado y con cron vigente
  | 'paused' // deshabilitado temporalmente (no ejecuta)
  | 'running' // se esta ejecutando AHORA (async en curso)
  | 'completed' // ultima ejecucion termino bien
  | 'failed' // ultima ejecucion fallo

/**
 * Job de copia de seguridad: une un ORIGEN local con un DESTINO remoto.
 *
 * @param id         - Identificador del job.
 * @param name       - Nombre descriptivo (ej. "NAS - Fotos Julio").
 * @param sourcePath - Ruta local que se respalda.
 * @param targetId   - Referencia al RemoteTarget donde se sube.
 * @param cron       - Expresion cron de la programacion automatica
 *                     (p. ej. "0 2 * * *" = cada dia a las 02:00).
 * @param lastRun    - ISO del ultimo arranque (null si nunca corrio).
 * @param nextRun    - ISO de la proxima ejecucion programada.
 * @param status     - Estado actual (ver BackupJobStatus).
 * @param sizeMb     - Tamano aproximado del origen en MiB (para el
 *                     encabezado y el estimado de la fila).
 */
export interface BackupJob {
  readonly id: string
  readonly name: string
  readonly sourcePath: string
  readonly targetId: string
  readonly cron: string
  readonly lastRun: string | null
  readonly nextRun: string | null
  readonly status: BackupJobStatus
  readonly sizeMb: number
}

/* =====================================================================
   ============================ SNAPSHOTS ===============================
   ===================================================================== */

/**
 * Snapshot: una "foto" restaurable de un job en un instante concreto.
 * Es la pieza que alimenta la tabla de restauracion.
 *
 * @param id        - Identificador del snapshot.
 * @param jobId     - Job que lo genero (para cruzarlo con la lista).
 * @param jobName   - Nombre del job (denormalizado para la tabla).
 * @param timestamp - ISO 8601 del momento en que se capturo.
 * @param size      - Tamano en BYTES del snapshot (formatBytes lo
 *                    pasa a GiB/MiB legibles en la UI).
 * @param target    - Nombre del destino remoto donde reside.
 * @param checksum  - Hash de integridad (p. ej. MD5/SHA-256). Si al
 *                    restaurar no cuadra, avisamos de corrupcion.
 */
export interface Snapshot {
  readonly id: string
  readonly jobId: string
  readonly jobName: string
  readonly timestamp: string
  readonly size: number
  readonly target: string
  readonly checksum: string
}