/**
 * ============================================================
 * JAH ENGINE - Capa de Servicio del Modulo Storage & Remote Backups
 * (src/features/backups/services/backupService.ts)
 * ============================================================
 * La UNICA puerta de entrada que usa la UI para hablar con el mundo
 * exterior. Aisla la Vista (BackupsPage) del ORIGEN de los datos:
 *
 *   UI (BackupsPage)
 *      │  importa SOLO funciones de este archivo
 *      ▼
 *   backupService.ts  ── mockO?  SÍ  ──▶ mockBackupData.ts (+300ms)
 *                        │ NO
 *                        ▼
 *                     fetch(API_BASE_URL/...)
 *
 * ============ PATRON REPOSITORY / SERVICE LAYER ============
 * Este archivo es un "Repository": una capa que esconde el mecanismo
 * de obtencion de datos y devuelve SIEMPRE el mismo contrato tipado.
 * Sus beneficios (y por que es REGLA aceptada del proyecto):
 *
 *  1. La UI no sabe ni le importa si los datos son mock o de red:
 *     ambas rutas devuelven RemoteTarget[] / BackupJob[] / Snapshot[].
 *  2. Alternar entre simulado y real es UN CAMBIO DE VARIABLE DE
 *     ENTORNO (VITE_USE_MOCK_DATA), no un cambio de codigo.
 *  3. Cada funcion de servicio es un punto de COSTURA: hay un solo
 *     lugar por endpoint para logs, reintentos, auth o mapeo de errores.
 *
 * Este Service Layer se desarrolla primero con mocks (nos permite
 * construir la UI sin backend) y luego se "enchufa" a la API real
 * simplemente poniendo VITE_USE_MOCK_DATA=false.
 *
 * ============ VARIABLES DE ENTORNO EN VITE (import.meta.env) ============
 * Vite inyecta en el CODIGO DEL NAVEGADOR una variable global llamada
 * `import.meta.env` con TODAS las variables del entorno que empiecen
 * por `VITE_`. Reglas:
 *  - Solo se expone lo que empieza por VITE_: asi nunca se filtra un
 *    SECRETO al cliente. (Los secretos reales viven en el servidor.)
 *  - El codigo las lee en TIEMPO DE COMPILACION y el valor queda
 *    "quemado" en el bundle. Por eso, tras editar un .env hay que
 *    reiniciar `npm run dev` (o rebuild) para que surta efecto.
 *  - Los valores son SIEMPRE cadenas ('true', '3000'...), de ahi que
 *    comparemos con === 'true' en vez de === true.
 *  - TypeScript los puede tipar con seguridad desde src/vite-env.d.ts
 *    (ver la interfaz ImportMetaEnv).
 */

import type { BackupJob, RemoteTarget, Snapshot } from '../types/backup'
import { MOCK_JOBS, MOCK_SNAPSHOTS, MOCK_TARGETS } from './mockBackupData'

/* =====================================================================
   ============== LECTURA DE CONFIGURACION DESDE import.meta.env =========
   ===================================================================== */

/**
 * ¿Estamos en modo datos simulados?
 * import.meta.env.VITE_USE_MOCK_DATA es una CADENA, nunca un boolean.
 * Por eso la comparacion explicita con 'true' (si la variable no esta
 * definida, devuelve undefined y la expresion cae a false).
 */
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true'

/**
 * URL base de la API REST de backups. Debe constar siempre en el
 * entorno (la proveemos en .env / .env.example). El fallback con '??'
 * evita un crash silencioso si alguien borra la variable por error.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

/* =====================================================================
   ====================== HELPERS INTERNOS (privados) =====================
   ===================================================================== */

/**
 * Retardo artificial de red cuando el modo es simulado.
 * Devuelve una Promise que se resuelve al cabo de `ms`. Con promesas
 * en lugar de callbacks, la UI puede usar `await` y encapsular la
 * latencia fuera de los componentes.
 *
 * @param ms - Milisegundos de espera (300 por defecto, segun spec).
 */
function simulateNetworkDelay(ms = 300): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Clon des-ES-tructural de un objeto: crea una COPIA nueva. Necesario
 * para que MOCK_JOBS sea inmutable y no contaminar el repo. Si la UI
 * modificara el array original, los datos volverian "sucios" en la
 * siguiente lectura.
 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * Peticion HTTP generica GET hacia la API real.
 * Analizamos 'res.ok' (respuesta 2xx) porque fetch NO lanza error en
 * un 404/500: solo lo hace con fallos de red. Lanzar una excepcion
 * tipada aqui centraliza el manejo de errores en un solo lugar.
 *
 * @param path - Ruta relativa (p. ej. '/backups/jobs').
 * @returns El JSON deserializado con el tipo pedido.
 */
async function httpGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`API de backups respondio ${response.status} en ${path}`)
  }
  return (await response.json()) as T
}

/**
 * Peticion HTTP generica POST hacia la API real (misma filosofia
 * de manejo de errores que httpGet, pero enviando cuerpo JSON).
 */
async function httpPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`API de backups respondio ${response.status} en ${path}`)
  }
  return (await response.json()) as T
}

/* =====================================================================
   =============== FUNCIONES PUBLICAS DE LA CAPA DE SERVICIO ============
   =====================================================================
   Contrato de uso desde la UI:
     const targets = await backupService.getRemoteTargets()
   Con mock  -> devuelve copias de las constantes tras 300ms.
   Con API   -> fetch a `${API_BASE_URL}/backups/targets`.
   El resto de la app JAMAS importa mockBackupData directamente.
   ===================================================================== */

/**
 * Devuelve los destinos remotos configurados (Rclone remotes/buckets).
 * Ruta real: GET /backups/targets.
 */
export async function getRemoteTargets(): Promise<RemoteTarget[]> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    return clone(MOCK_TARGETS)
  }
  return httpGet<RemoteTarget[]>('/backups/targets')
}

/**
 * Devuelve el listado de trabajos de respaldo programados.
 * Ruta real: GET /backups/jobs.
 */
export async function getBackupJobs(): Promise<BackupJob[]> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    return clone(MOCK_JOBS)
  }
  return httpGet<BackupJob[]>('/backups/jobs')
}

/**
 * Ejecuta MANUALMENTE un job de respaldo (accion "Ejecutar Ahora").
 *
 * En modo mock da de comer al patron "optimistic update": la UI ya
 * habia marcado el job como 'running'; cuando llega la respuesta, este
 * servicio devuelve el job ACTUALIZADO (status 'completed' y lastRun
 * con el instante real) para que la UI lo aplique con un solo setState.
 *
 * @param jobId - Identificador del job a lanzar.
 * @returns El job ya ejecutado, listo para sustituir al de la lista.
 * @throws Si el job no existe (valida la "base de datos" simulada).
 */
export async function runBackupJob(jobId: string): Promise<BackupJob> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    // Busqueda en el "repo" simulado; si no existe, error explicito
    // (misma semantica que un 404 de la API real).
    const found = MOCK_JOBS.find((job) => job.id === jobId)
    if (!found) throw new Error(`Job de backup no encontrado: ${jobId}`)
    // Devolvemos una copia MUY actualizada del job.
    return {
      ...clone(found),
      status: 'completed',
      lastRun: new Date().toISOString(),
    }
  }
  return httpPost<BackupJob>('/backups/jobs/run', { jobId })
}

/**
 * Devuelve los puntos de restauracion (snapshots) disponibles.
 * Ruta real: GET /backups/snapshots.
 */
export async function getSnapshots(): Promise<Snapshot[]> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    return clone(MOCK_SNAPSHOTS)
  }
  return httpGet<Snapshot[]>('/backups/snapshots')
}

/**
 * Solicita la restauracion de un snapshot (accion "Restaurar").
 * No devuelve datos del snapshot: solo confirma (resolve) o falla
 * (reject) la peticion. La UI usa la Promise para saber cuando parar
 * el spinner.
 *
 * @param snapshotId - Identificador del snapshot a restaurar.
 */
export async function restoreSnapshot(snapshotId: string): Promise<void> {
  if (USE_MOCK_DATA) {
    await simulateNetworkDelay()
    // Valida que el snapshot exista (404 simulado).
    const found = MOCK_SNAPSHOTS.some((snapshot) => snapshot.id === snapshotId)
    if (!found) throw new Error(`Snapshot no encontrado: ${snapshotId}`)
    return
  }
  // httpPost necesita cuerpo; envia el id como JSON para reproducir
  // el cuerpo tipico de la API REST (y devuelve void tras el OK).
  await httpPost<never>('/backups/snapshots/restore', { snapshotId })
}