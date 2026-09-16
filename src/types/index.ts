/**
 * ============================================================
 * JAH ENGINE - Tipos globales (src/types/index.ts)
 * ============================================================
 * Este archivo es el "contrato de datos" de toda la aplicacion.
 * Define qué forma tiene la informacion que circula entre:
 *   - el microservicio HomeLab Monitor (Astro)  -> dashboard
 *   - el motor de benchmarks (stress HTTP)      -> dashboard
 *   - el orquestador de backups cifrados         -> dashboard
 *
 * ¿Por que centralizar aquí los tipos?
 * Porque TypeScript nos da SEGURIDAD EN COMPILACION: si el equipo
 * del microservicio cambia la forma del JSON, el resto del codigo
 * deja de compilar y detectamos el error ANTES de desplegar.
 *
 * Nota pedagógica (por que uniones de strings y no `enum`):
 * El tsconfig activa `erasableSyntaxOnly`, que prohíbe los `enum`
 * (consumen runtime y no son borrables por el transpilador).
 * La alternativa moderna son "string literal unions": el mismo
 * autocompletado y seguridad, pero 100% estatico y tipado mas fino.
 */

/* =====================================================================
   =========================== MODULO HOMELAB ============================
   ===================================================================== */

/** Estados posibles de un host (servidor/nodo) dentro del HomeLab. */
export type HostStatus = 'online' | 'degraded' | 'offline' | 'maintenance'

/**
 * Identifica el rol que cumple un host en la infraestructura.
 * Facilita agrupar metrivas por capa en el dashboard (red, compute,
 * almacenamiento, servicios de aplicacion).
 */
export type HostRole = 'router' | 'nas' | 'compute' | 'service'

/**
 * Representacion de un HOST monitorizado por HomeLab Monitor.
 *
 * @param id          - Identificador unico (lo usa React como `key`).
 * @param name        - Nombre amigable mostrado en el widget.
 * @param role        - Rol dentro de la infraestructura (para filtros).
 * @param status      - Estado de salud actual del host.
 * @param ipAddress   - Direccion IP (solo lectura, nunca se muestra al
 *                      completo por seguridad en el widget).
 * @param lastSeenAt  - Timestamp (ISO 8601) del ultimo "pulso" recibido.
 *                      Su antiguedad permite detectar hosts zombies.
 */
export interface Host {
  id: string
  name: string
  role: HostRole
  status: HostStatus
  ipAddress: string
  lastSeenAt: string
}

/**
 * Muestra de latencia capturada para un host.
 *
 * En el protocolo de HomeLab Monitor se envía una muestra por host
 * y por ventana de medicion (ej. cada 5 segundos con ICMP o HTTP).
 *
 * @param hostId        - Host al que pertenece la muestra.
 * @param latencyMs     - Latencia en milisegundos (promedio ventana).
 * @param jitterMs      - Variabilidad entre paquetes (cuanto "baila").
 * @param packetLossPct - Porcentaje de paquetes perdidos [0-100].
 * @param measuredAt    - Momento exacto de la medicion (ISO 8601).
 */
export interface LatencySample {
  hostId: string
  latencyMs: number
  jitterMs: number
  packetLossPct: number
  measuredAt: string
}

/**
 * Datos de disponibilidad (uptime) agregados de un host.
 *
 * @param uptimeSeconds    - Tiempo acumulado encendido sin cortes.
 * @param uptimePercent    - Desponibilidad de los ultimos 30 dias (0-100).
 * @param incidentCount30d - Numero de incidentes (caidas) registrados.
 * @param lastIncidentAt   - Cuando ocurrio la ultima caida (nullable si no hubo).
 */
export interface HostUptime {
  hostId: string
  uptimeSeconds: number
  uptimePercent: number
  incidentCount30d: number
  lastIncidentAt: string | null
}

/**
 * Detalle extendido de un host: combina informacion estatica (Host)
 * con las metricas en vivo mas recientes (LatencySample + HostUptime).
 * Es la forma mas comoda de pintar una fila en el widget.
 */
export interface HostDetailed extends Host {
  latency: LatencySample | null
  uptime: HostUptime | null
}

/**
 * SNAPSHOT COMPLETO que envia HomeLab Monitor al dashboard.
 * Es el "payload" deserializado de cada mensaje WebSocket.
 *
 * @param generatedAt  - Momento en que el microservicio genero el snapshot.
 * @param hosts        - Lista de hosts (con sus ultimas metricas).
 * @param overallHealth- Numero que destila la salud global del cluster.
 *                       Convencion: > 95 excelente, 80-95 atencion,
 *                       < 80 degradado. Util para el semaforo del widget.
 * @param latencyHistory - Serie temporal acotada (max ~N muestras) para
 *                       pintar la mini-grafica de latencia del widget.
 */
export interface HomeLabSnapshot {
  generatedAt: string
  hosts: HostDetailed[]
  overallHealth: number
  latencyHistory: LatencySample[]
}

/**
 * Alertas de HomeLab: se emiten SOLO cuando algo cambia de estado
 * (host caido, latencia media disparada, packet loss no tolerable),
 * evitando el ruido de enviar alertas constantes.
 */
export interface HomeLabAlert {
  id: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  hostId: string | null
  emittedAt: string
}

/* =====================================================================
   ===================== MODULO BENCHMARK & PROFILING ====================
   ===================================================================== */

/** Estados del ciclo de vida de una prueba de estres. */
export type BenchmarkStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * Metricas agregadas de una prueba HTTP/codigo (Benchmark).
 *
 * @param requestsPerSecond - Throughput: peticiones servidas por segundo.
 * @param p50Ms / p95Ms / p99Ms - Percentiles de latencia en ms.
 *                            - p50: la mitad de peticiones van por debajo.
 *                            - p99: solo el 1% mas lento supera este valor
 *                              (el que marca la experiencia "cola de cola").
 * @param errorRatePct      - % de respuestas con error (5xx/4xx).
 * @param cpuUsageAvgPct    - Uso medio de CPU del servidor durante la prueba.
 * @param memoryUsedMb      - Consumo RAM pico del proceso bajo prueba.
 * @param durationMs        - Duracion total de la prueba.
 * @param concurrency       - Numero de conexiones simultaneas lanzadas.
 */
export interface BenchmarkResult {
  requestsPerSecond: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  errorRatePct: number
  cpuUsageAvgPct: number
  memoryUsedMb: number
  durationMs: number
  concurrency: number
}

/**
 * Ejecucion (run) de un benchmark dentro del sistema.
 *
 * @param id            - Identificador del run.
 * @param targetUrl     - URL objetivo contra la que se estresa.
 * @param status        - Estado actual del run.
 * @param result        - Metricas finales (null mientras corre).
 * @param progressPct   - Progreso global 0-100 (para la barra en vivo).
 * @param createdAt     - Cuando se lanzo.
 * @param finishedAt    - Cuando termino / fallo (null si sigue activo).
 */
export interface BenchmarkRun {
  id: string
  targetUrl: string
  status: BenchmarkStatus
  result: BenchmarkResult | null
  progressPct: number
  createdAt: string
  finishedAt: string | null
}

/* =====================================================================
   ================== MODULO STORAGE & REMOTE BACKUPS ==================
   ===================================================================== */

/** Estados posibles de un job de copia de seguridad. */
export type BackupStatus = 'idle' | 'encrypting' | 'uploading' | 'verify' | 'completed' | 'failed'

/**
 * Job de respaldo cifrado (AES-256 en origen) con sincronizacion
 * remota via Rclone / S3 API.
 *
 * @param id           - Identificador del job.
 * @param name         - Nombre descriptivo (ej: "NAS - Fotos Julio").
 * @param sourcePath   - Ruta origen que se respalda.
 * @param targetBucket - Destino remoto (S3/Rclone bucket o ruta).
 * @param status       - Estado actual del job.
 * @param encryptedBytes - Bytes ya cifrados en esta ejecucion.
 * @param totalBytes   - Bytes totales a procesar.
 * @param checksumOk   - Verdadero si la verificacion de integridad paso.
 * @param lastRunAt    - Ultima ejecucion (ISO).
 * @param nextRunAt    - Proxima ejecucion programada (para retrovisor).
 */
export interface BackupJob {
  id: string
  name: string
  sourcePath: string
  targetBucket: string
  status: BackupStatus
  encryptedBytes: number
  totalBytes: number
  checksumOk: boolean
  lastRunAt: string | null
  nextRunAt: string | null
}

/* =====================================================================
   ================== CAPA DE TRANSPORTE (WEBSOCKET) ====================
   ===================================================================== */

/**
 * Tipos de mensaje que pueden viajar por el WebSocket del dashboard.
 * El prefijo por modulo (homeLab. / benchmark. / backup.) permite que
 * un SOLO canal WebSocket transporte informacion de los tres modulos
 * y que cada receptor filtre por su tipo.
 */
export type RealtimeEventType =
  | 'homeLab.snapshot'
  | 'homeLab.alert'
  | 'benchmark.progress'
  | 'benchmark.result'
  | 'backup.status'

/**
 * ENVOLTURA GENERICA de todos los mensajes del canal.
 * Generic type: `payload` cambia segun `type`.
 *
 * @template Payload - Forma de los datos de negocio del mensaje
 *                     (HomeLabSnapshot, BenchmarkRun, BackupJob...).
 *
 * @param type      - Discriminante: TypeScript usa este campo para
 *                    estrechar el tipo de `payload` (discriminated union).
 * @param payload   - Datos de negocio deserializados.
 * @param timestamp - Momento de emision (ISO 8601).
 * @param source    - Suficiencia opcional del emisor (ej. "homeLab-01").
 */
export interface RealtimeEnvelope<Payload> {
  type: RealtimeEventType
  payload: Payload
  timestamp: string
  source?: string
}

/**
 * Estado de la CONEXION WebSocket visto desde la UI.
 * No coincide 1:1 con ReadyState (que expone el navegador) porque
 * añade estados de negocio: `waitingForRetry` cuando el cliente esta
 * haciendo backoff entre reintentos y `reconnecting`.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'waitingForRetry'
  | 'closed'

/**
 * Opciones de configuracion del cliente WebSocket (RealtimeSocket).
 * Perfiladas para entornos de home-lab donde la red puede ser
 * inestable y queremos auto-recuperacion prudente.
 *
 * @param autoReconnect  - Si falla la conexion, ¿reintentamos solos?
 * @param reconnectBaseMs- Espera BASE del primer reintento (backoff).
 * @param reconnectMaxMs - Techo del backoff (evita reintentos agresivos).
 * @param reconnectJitter- Fraccion de aleatoriedad (0-1) para evitar
 *                         "thundering herd" si muchos clientes caen juntos.
 * @param maxAttempts    - Maximo de reintentos (-1 = ilimitado).
 * @param heartbeatIntervalMs - Intervalo de ping/pong de mantenimiento.
 */
export interface WebSocketOptions {
  autoReconnect: boolean
  reconnectBaseMs: number
  reconnectMaxMs: number
  reconnectJitter: number
  maxAttempts: number
  heartbeatIntervalMs: number
}