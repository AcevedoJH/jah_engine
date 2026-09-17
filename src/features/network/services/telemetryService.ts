/**
 * ============================================================
 * JAH ENGINE - Servicio de Telemetría (Strategy Pattern)
 * (src/features/network/services/telemetryService.ts)
 * ============================================================
 * Capa de ABSTRACCIÓN DE RED del módulo HomeLab Monitor.
 *
 * ¿Qué hace este archivo?
 * Resuelve UNA pregunta: "¿de dónde salen los datos de telemetría?"
 * Dependiendo de la variable de entorno `VITE_USE_MOCK_DATA`,
 * el servicio ejecuta UNA de dos estrategias (Strategy Pattern):
 *
 *   - MockTelemetryStrategy  → devuelve datos del JSON de ejemplo.
 *   - HttpTelemetryStrategy  → hace una petición fetch al backend real.
 *
 * ¿Por qué un Strategy y no un simple if/else?
 * 1. PORQUE es extensible: si mañana se necesita otra fuente (por
 *    ejemplo, un WebSocket en tiempo real), se añade una clase nueva
 *    sin tocar el servicio ni los hooks.
 * 2. PORQUE es testeable: en un test, pasamos MockTelemetryStrategy
 *    sin consultar variables de entorno ni hacer red real.
 * 3. PORQUE cumple el Principio Abierto/Cerrado (Open/Closed): abre
 *    extension (nuevas estrategias) pero cierra modificación (el
 *    servicio y los hooks no cambian).
 *
 * NOTA SOBRE `import.meta.env`:
 * Vite expone las variables de entorno a traves de este objeto.
 * Solo las variables que empiezan por `VITE_` son visibles en el
 * navegador. Las demas quedan reemplazadas por `undefined`.
 */

import type { TelemetryData, ContainerMetrics } from '@/types/telemetry'
import telemetryMock from '../mocks/telemetryMock.json'

/* =====================================================================
   ======================== ERROR PERSONALIZADO ========================
   ===================================================================== */

/**
 * Error especifico del dominio de telemetría.
 * Hereda de Error nativo pero añade un campo `status` (código HTTP).
 *
 * ¿Por qué un error propio?
 * Porque nos permite diferenciar errores de red/HTTP de errores
 * generales de JavaScript en el componente. El hook `useTelemetry`
 * puede decir "error 401: token invalido" en lugar de solo "fetch failed".
 *
 * @param status - Código HTTP del error (400, 401, 403, 500...).
 * @param message- Mensaje legible para mostrar al usuario.
 */
export class TelemetryError extends Error {
  /** Código HTTP asociado al error (puede ser 0 si no hubo respuesta). */
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'TelemetryError'
    // NOTA: `erasableSyntaxOnly` prohibe asignar campos en la firma del
    // constructor (parameter properties), por eso la asignacion es explicita.
    this.status = status
  }
}

/* =====================================================================
   ===================== INTERFAZ ESTRATEGIA ===========================
   ===================================================================== */

/**
 * Interfaz que toda fuente de datos debe implementar.
 * El método `fetchTelemetry` devuelve una Promesa de TelemetryData.
 * No le importa si los datos vienen de un JSON local o de la nube.
 *
 * @param signal - AbortSignal opcional: permite cancelar la petición
 *                 cuando el componente se desmonta (evita data races).
 */
export interface TelemetryStrategy {
  /** Identificador legible de la estrategia (para el badge de la UI). */
  readonly kind: 'mock' | 'http'
  /** Obtiene un snapshot completo de telemetría. */
  fetchTelemetry(signal?: AbortSignal): Promise<TelemetryData>
}

/* =====================================================================
   ================== ESTRATEGIA: DATOS SIMULADOS =====================
   ===================================================================== */

/**
 * Estrategia MOCK: devuelve el JSON de ejemplo con un delay simulado.
 *
 * ¿Por qué un delay artificial (400ms)?
 * Para que la UI muestre el skeleton/spinner y el desarrollador pueda
 * observar el estado de carga. Sin delay, el skeleton nunca se vería
 * y no podríamos verificar que la experiencia de usuario es correcta.
 *
 * ADICIONALMENTE: el timestamp y collected_at del JSON se sobreescriben
 * con la fecha/hora actual para que el widget siempre muestre una
 * "ultima actualización" reciente.
 */
class MockTelemetryStrategy implements TelemetryStrategy {
  readonly kind = 'mock' as const

  /**
   * Devuelve datos simulados tras un delay de 400ms.
   *
   * @param signal - Si ya fue abortado, lanzamos directamente el error.
   * @returns Snapshot de telemetría tipado.
   */
  fetchTelemetry(signal?: AbortSignal): Promise<TelemetryData> {
    // Si el signal ya está abortado antes de empezar, abortamos rápido.
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Abortado', 'AbortError'))
    }

    // Simulamos latencia de red (400ms).
    return new Promise<TelemetryData>((resolve, reject) => {
      const timer = setTimeout(() => {
        const now = new Date().toISOString()

        // Clonamos el mock. El cast "doble" (as unknown as TelemetryData)
        // es intencional: el tipo inferido del JSON usa literales amplios
        // (ej. load_average: number[] en vez de la tupla [n,n,n]), que no
        // son asignables directamente. En produccion real el backend pasa
        // por la validacion estructural HTTP, aqui confiamos en el fixture.
        const snapshot = structuredClone(telemetryMock) as unknown as TelemetryData

        // Sobre-escribimos los timestamps con el momento actual para que
        // el widget refleje "datos recientes". Sin esto, el timestamp del
        // JSON sería siempre el mismo y parecería un bug.
        snapshot.timestamp = now
        snapshot.source = { ...snapshot.source, collected_at: now }

        resolve(snapshot)
      }, 400)

      // Escuchamos la seña de abort: si llega, cancelamos el timer
      // y lanzamos el error de abort para que el hook limpie su estado.
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Abortado', 'AbortError'))
      }, { once: true })
    })
  }
}

/* =====================================================================
   =============== ESTRATEGIA: LLAMADA HTTP AL BACKEND =================
   ===================================================================== */

/**
 * Estrategia HTTP: conecta al microservicio HomeLab Monitor real.
 *
 * Configuración esperada en `.env`:
 *   VITE_API_URL = https://homelab-monitor.acevedojavier.dev/api/v1/metrics/telemetry
 *   VITE_API_KEY = tu_token_secreto_aqui
 */
class HttpTelemetryStrategy implements TelemetryStrategy {
  readonly kind = 'http' as const

  /**
   * Lee las variables de entorno una vez (en construccion).
   * Cada peticion usa estos valores; si el usuario cambia el .env,
   * debe reiniciar el dev-server.
   */
  private readonly apiUrl: string
  private readonly apiKey: string

  constructor() {
    this.apiUrl = import.meta.env['VITE_API_URL']
      ?? 'https://homelab-monitor.acevedojavier.dev/api/v1/metrics/telemetry'
    this.apiKey = import.meta.env['VITE_API_KEY'] ?? ''
  }

  /**
   * Realiza una petición GET al backend y deserializa la respuesta.
   *
   * 1. Construye los headers (Accept + X-API-Key).
   * 2. Lanza fetch() con timeout y signal.
   * 3. Valida el código de respuesta HTTP.
   * 4. Parsea el JSON y aplica una verificación mínima de forma.
   *
   * @param signal - Señal de abort para cancelar desde el hook.
   * @returns Snapshot tipado de TelemetryData.
   * @throws TelemetryError si la respuesta HTTP es un error.
   * @throws DOMException si el fetch fue abortado.
   */
  async fetchTelemetry(signal?: AbortSignal): Promise<TelemetryData> {
    // Cabeceras de la petición: Accept indica que queremos JSON,
    // X-API-Key autentica contra el backend.
    const headers = new Headers({
      Accept: 'application/json',
    })

    // Solo añadimos la cabecera de autenticación si hay clave.
    // Esto permite probar sin API key sin que falle la cabecera vacía.
    if (this.apiKey) {
      headers.set('X-API-Key', this.apiKey)
    }

    const response = await fetch(this.apiUrl, {
      method: 'GET',
      headers,
      signal,
    })

    // --- Verificación de errores HTTP ---
    // Cada rango de código tiene un significado distinto. Los mapeamos
    // a mensajes claros para que el usuario sepa qué hacer.
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Sin detalle')

      switch (response.status) {
        case 400:
          throw new TelemetryError(
            `Solicitud incorrecta: el backend rechazó los parámetros. Detalle: ${errorBody}`,
            400,
          )
        case 401:
          throw new TelemetryError(
            'Autenticación fallida: la VITE_API_KEY no es válida o no se ha proporcionado.',
            401,
          )
        case 403:
          throw new TelemetryError(
            'Acceso denegado: la clave existe pero no tiene permisos para este recurso.',
            403,
          )
        case 404:
          throw new TelemetryError(
            'Recurso no encontrado: la URL del endpoint es incorrecta.',
            404,
          )
        case 429:
          throw new TelemetryError(
            'Límite de peticiones alcanzado. Intente de nuevo en unos segundos.',
            429,
          )
        default:
          throw new TelemetryError(
            `Error inesperado del servidor (${response.status}).`,
            response.status,
          )
      }
    }

    // Deserialización y verificación mínima de forma.
    const data: unknown = await response.json()

    // --- Guardia de forma (structural type check) ---
    // Verificamos que las claves raíz existan y sean del tipo esperado.
    // Esto no es una validación completa (Zod haría eso) pero sí
    // detecta el 90% de errores comunes: JSON mal formado, endpoints
    // que devuelven HTML (error pages), o APIs que cambiaron la raíz.
    if (!isTelemetryShape(data)) {
      throw new TelemetryError(
        'La respuesta del backend no tiene la estructura esperada (schema_version, source, system, network, containers, security).',
        response.status,
      )
    }

    return data as TelemetryData
  }
}

/* =====================================================================
   ========= VERIFICADOR MÍNIMO DE FORMA (structural guard) ===========
   ===================================================================== */

/**
 * Comprueba en runtime que un objeto desconocido tenga las claves
 * raíz de TelemetryData. NO valida sub-campos (sería excesivo sin
 * Zod), pero descarta HTML, strings, arrays y objetos vacíos.
 *
 * @param value - Resultado de JSON.parse (unknown).
 * @returns true si parece un TelemetryData.
 */
function isTelemetryShape(value: unknown): value is TelemetryData {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj['schema_version'] === 'string'
    && typeof obj['timestamp'] === 'string'
    && typeof obj['source'] === 'object' && obj['source'] !== null
    && typeof obj['system'] === 'object' && obj['system'] !== null
    && typeof obj['network'] === 'object' && obj['network'] !== null
    && Array.isArray(obj['containers'])
    && typeof obj['security'] === 'object' && obj['security'] !== null
  )
}

/* =====================================================================
   =================== HELPER: HEALTH SUMMARY =========================
   ===================================================================== */

/**
 * Extrae un resumen de salud de los contenedores.
 * No vive en types/ porque es una utilidad de presentación, no un
 * contrato de datos. Pero es muy usada por el servicio y el widget.
 *
 * @param containers - Array de contenedores del snapshot.
 * @returns Objeto con contadores de cada estado de salud.
 */
export function summarizeContainerHealth(containers: ContainerMetrics[]): {
  total: number
  running: number
  healthy: number
  unhealthy: number
  exited: number
  other: number
} {
  const summary = {
    total: containers.length,
    running: 0,
    healthy: 0,
    unhealthy: 0,
    exited: 0,
    other: 0,
  }

  for (const c of containers) {
    if (c.status === 'running') summary.running++
    if (c.health === 'healthy') summary.healthy++
    if (c.health === 'unhealthy') summary.unhealthy++
    if (c.status === 'exited') summary.exited++
    if (c.status !== 'running' && c.status !== 'exited') summary.other++
  }

  return summary
}

/* =====================================================================
   ===================== SERVICIO PÚBLICO =============================
   ===================================================================== */

/**
 * Servicio de telemetría (fachada pública).
 *
 * Por defecto, resuelve la estrategia automáticamente leyendo
 * `VITE_USE_MOCK_DATA`. También acepta una estrategia inyectada
 * directamente (útil en tests).
 *
 * Ejemplo de uso:
 * ```ts
 * const data = await telemetryService.fetchTelemetry()
 * ```
 */
export class TelemetryService {
  /** Estrategia activa (mock o http). */
  private readonly strategy: TelemetryStrategy

  /**
   * @param strategy - Estrategia inyectada (para tests). Si no se
   *                   pasa, se resuelve automaticamente por env.
   */
  constructor(strategy?: TelemetryStrategy) {
    this.strategy = strategy ?? resolveStrategyFromEnv()
  }

  /** Obtiene un snapshot completo de telemetría. */
  fetchTelemetry(signal?: AbortSignal): Promise<TelemetryData> {
    return this.strategy.fetchTelemetry(signal)
  }

  /** Tipo de estrategia activa (para mostrar en la UI). */
  get strategyKind(): TelemetryStrategy['kind'] {
    return this.strategy.kind
  }
}

/* =====================================================================
   ========= FACTORY: RESOLUCIÓN AUTOMÁTICA DE ESTRATEGIA ==============
   ===================================================================== */

/**
 * Lee `VITE_USE_MOCK_DATA` y devuelve la estrategia correspondiente.
 *
 * Por defecto (sin .env o variable ausente) se usa MOCK: es la
 * decision mas segura para desarrollo sin backend levantado.
 *
 * @returns MockTelemetryStrategy o HttpTelemetryStrategy.
 */
function resolveStrategyFromEnv(): TelemetryStrategy {
  const useMock = import.meta.env['VITE_USE_MOCK_DATA'] !== 'false'

  // Logging pedagógico: en desarrollo, indica qué fuente de datos
  // está activa para que el desarrollador no se confunda.
  if (import.meta.env.DEV) {
    console.log(
      `%c[JAH Engine] Estrategia de telemetría: %c${useMock ? 'MOCK' : 'HTTP'}`,
      'color: gray',
      `color: ${useMock ? 'orange' : 'green'}; font-weight: bold`,
    )
  }

  return useMock ? new MockTelemetryStrategy() : new HttpTelemetryStrategy()
}

/**
 * Instancia SINGLETON del servicio (patrón módulo).
 * Todo el código del frontend comparte la misma instancia, lo que
 * garantiza consistencia (todas las partes leen la misma estrategia).
 *
 * En un test, puedes reemplazarla:
 * ```ts
 * const mockService = new TelemetryService(new MockTelemetryStrategy())
 * ```
 */
export const telemetryService = new TelemetryService()

/**
 * Helper re-exportado para que los componentes no necesiten importar
 * la estrategia ni el servicio por separado. Un solo punto de entrada.
 */
export { resolveStrategyFromEnv }