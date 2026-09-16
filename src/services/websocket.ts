/**
 * ============================================================
 * JAH ENGINE - Cliente WebSocket (src/services/websocket.ts)
 * ============================================================
 * CAPA DE TRANSPORTE en tiempo real del dashboard.
 *
 * ¿Por qué WebSockets y no polling con fetch()?
 *  - El polling pregunta al servidor "¿hay algo nuevo?" cada X
 *    segundos (latencia media = X/2 + tiempo de red).
 *  - Un WebSocket abre UN canal bidireccional persistente; el
 *    servidor empuja datos automaticamente (push). Ideal para
 *    latencias, benchmarks en vivo y estados de backups.
 *
 * Esta clase encapsula toda la complejidad del protocolo:
 *  1. Apertura de la conexion.
 *  2. Reconexion automatica con backoff exponencial + jitter.
 *  3. Heartbeat (ping/pong) para detectar conexiones muertas.
 *  4. Emision de eventos a los suscriptores (patron Observer).
 *
 * Es un "singleton de instancia" (no forzamos Singleton global):
 * cada consumidor crea el suyo con su URL y opciones, logrando
 * separacion de preocupaciones. El compuesto queda en los hooks.
 */

import type {
  ConnectionStatus,
  RealtimeEnvelope,
  WebSocketOptions,
} from '@/types'

/** Opciones por defecto para una conexion resiliente de home-lab. */
export function defaultWebSocketOptions(): WebSocketOptions {
  return {
    autoReconnect: true,
    // La espera del primer reintento sera de ~1 segundo.
    reconnectBaseMs: 1_000,
    // Nunca esperaremos mas de 30 segundos entre reintentos.
    reconnectMaxMs: 30_000,
    // Jitter del 20%: rompemos la sincronia entre clientes.
    reconnectJitter: 0.2,
    // Reintentos ilimitados (un monitor debe quedarse intentando).
    maxAttempts: -1,
    // Latido cada 25s; los proxies HTTP cierran conexiones inactivas
    // entre ~60-120s, asi que 25s esta holgado pero temprano.
    heartbeatIntervalMs: 25_000,
  }
}

/**
 * Type guard PUBLICO y generico: comprueba que un valor recibido del
 * socket sea un envelope del `type` esperado.
 *
 * TypeScript "estrecha" el tipo del payload cuando este guard devuelve
 * true, de modo que los consumidores no necesitan casting manual:
 *
 *   if (isEnvelopeOfType<HomeLabSnapshot>(msg, 'homeLab.snapshot')) {
 *     msg.payload.overallHealth // <-- tipado y seguro
 *   }
 *
 * @template T - Tipo esperado del payload.
 * @param value - Valor desconocido recibido del WebSocket.
 * @param type  - Discriminante esperado.
 * @returns true si es un envelope con el `type` indicado.
 */
export function isEnvelopeOfType<T>(
  value: unknown,
  type: RealtimeEnvelope<unknown>['type'],
): value is RealtimeEnvelope<T> {
  return isRealtimeEnvelope(value) && value.type === type
}

/**
 * Verifica en runtime que un objeto deserializado tenga la forma de
 * un envelope Realtime (necesario: JSON.parse devuelve `any`).
 *
 * @param value - Valor proveniente de JSON.parse.
 * @returns true si cumple la forma minima de RealtimeEnvelope.
 */
function isRealtimeEnvelope(value: unknown): value is RealtimeEnvelope<unknown> {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj['type'] === 'string' && obj['payload'] !== undefined
}

/**
 * Cliente de tiempo real por WebSocket con reconexion inteligente.
 *
 * Patron de diseno: OBSERVER. Los componentes no se enganchan al
 * WebSocket nativo directamente; se suscriben con callbacks y esta
 * clase les avisa. Ventajas:
 *  - Desacoplamos UI del protocolo (si cambia, solo cambia aqui).
 *  - Varios componentes comparten el mismo flujo de datos sin pisarse.
 *  - El hueco de reconexion queda oculto para quien consume el API.
 */
export class RealtimeSocket {
  /** URL del endpoint WebSocket (p. ej. ws://host:8080/ws). */
  private readonly url: string

  /** Opciones de resiliencia (backoff, heartbeat, etc.). */
  private readonly options: WebSocketOptions

  /** Instancia nativa de WebSocket del navegador (null si no usamos). */
  private socket: WebSocket | null = null

  /** Estado de conexion visto por la capa de UI. */
  private currentStatus: ConnectionStatus = 'disconnected'

  /** Numero de reintentos fallidos consecutivos (sirve para backoff). */
  private reconnectAttempts = 0

  /** Handle del setTimeout de la reconexion programada. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  /** Handle del setInterval del heartbeat (ping). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  /** true si el usuario cerro la conexion a proposito. */
  private manuallyClosed = false

  /** Conjunto de suscriptores de mensajes de negocio. */
  private readonly messageHandlers = new Set<(envelope: unknown) => void>()

  /** Conjunto de suscriptores de cambios de estado de la conexion. */
  private readonly statusHandlers = new Set<(status: ConnectionStatus) => void>()

  /**
   * Constructor: recibe la URL y opciones opcionales.
   *
   * Nota pedagogica sobre sintaxis TS: NUNCA se usa el atajo
   * `constructor(private url: string)`. Por qué? Porque `erasableSyntaxOnly`
   * en el tsconfig prohíbe los "parameter properties". Por eso
   * declaramos los campos arriba y los asignamos aqui explicitamente.
   * De paso, asi queda mas claro el flujo de datos al estudiante.
   *
   * @param url     - Endpoint WebSocket del microservicio emisor.
   * @param options - Opciones parciales; se completan con las default.
   */
  constructor(url: string, options: Partial<WebSocketOptions> = {}) {
    this.url = url
    // Fusionamos las opciones del usuario con los valores por defecto.
    // Spread con "..." primero: las del usuario GANAN sobre el default.
    this.options = { ...defaultWebSocketOptions(), ...options }
  }

  /**
   * Abre la conexion WebSocket.
   * Si ya hay una abierta, es un no-op (evita conexiones duplicadas).
   */
  connect(): void {
    // No duplicamos conexiones ni reintentamos sobre una viva.
    if (this.socket && this.currentStatus === 'connected') return

    // El usuario quiere conectar: anulamos el flag de cierre manual.
    this.manuallyClosed = false
    this.setStatus('connecting')

    // Instancia nativa del navegador. Al construirla ya empieza
    // el handshake. No bloquea el hilo: es asincrono.
    const socket = new WebSocket(this.url)
    this.socket = socket

    // Delegamos cada evento nativo a nuestros metodos privados.
    // Usamos arrow functions para que el `this` apunte a la clase
    // (ver explicacion en handleMessage).
    socket.addEventListener('open', () => this.handleOpen())
    socket.addEventListener('message', (event) => this.handleMessage(event))
    socket.addEventListener('error', () => this.handleError())
    socket.addEventListener('close', () => this.handleClose())
  }

  /**
   * Cierre controlado por el usuario (unmounted de componente, logout,
   * cambio de workspace). Marca `manuallyClosed` para que la logica
   * de reconexion NO se ejecute.
   */
  disconnect(): void {
    this.manuallyClosed = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    this.socket?.close()
    this.socket = null
    this.setStatus('closed')
  }

  /**
   * Envia un envelope por el canal. Tipado generico: el que envia
   * asegura que el payload tiene la forma correcta.
   *
   * @template T - Forma del payload de negocio a enviar.
   * @param envelope - Mensaje completo (type + payload + timestamp).
   * @returns true si el envio era posible (canal OPEN y no cerrado).
   */
  send<T>(envelope: RealtimeEnvelope<T>): boolean {
    // readyState === 1 es el valor de la constante OPEN del protocolo.
    // Solo podemos enviar sobre un canal abierto.
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false
    }
    this.socket.send(JSON.stringify(envelope))
    return true
  }

  /**
   * Suscribe un callback a los mensajes de negocio recibidos.
   *
   * @param handler - Recibe el envelope deserializado (unknown; el
   *                  consumidor lo "estrecha" con type guards).
   * @returns funcion para DESUSCRIBIRSE (importante en el cleanup
   *          de useEffect para evitar fugas de memoria).
   */
  onMessage(handler: (envelope: unknown) => void): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  /**
   * Suscribe un callback a los cambios de estado de la conexion.
   * Util para pintar el indicador "EN VIVO / RECONECTANDO" del widget.
   *
   * @param handler - Recibe el nuevo ConnectionStatus.
   * @returns funcion para desuscribirse (cleanup del useEffect).
   */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler)
    return () => this.statusHandlers.delete(handler)
  }

  /** Consulta rapida del estado actual (lectura sincrona para render). */
  getStatus(): ConnectionStatus {
    return this.currentStatus
  }

  /* ----------------------------------------------------------
     METODOS PRIVADOS: la "plomeria" interna del protocolo.
     Todos son handling de eventos; ver cada uno por separado.
     ---------------------------------------------------------- */

  /** Publica el nuevo estado a todos los suscriptores y lo guarda. */
  private setStatus(status: ConnectionStatus): void {
    this.currentStatus = status
    // Los cambios de estado tambien son datos: los propagamos.
    this.statusHandlers.forEach((handler) => handler(status))
  }

  /**
   * Se dispara cuando el WebSocket completa el handshake (OPEN).
   * Reiniciamos contadores y arrancamos el latido de vida.
   */
  private handleOpen(): void {
    // Conexion establecida: reseteamos el contador de reintentos
    // para que el proximo backoff empiece desde el principio.
    this.reconnectAttempts = 0
    this.setStatus('connected')
    this.startHeartbeat()
  }

  /**
   * Se dispara por CADA mensaje entrante (raw string).
   * Aqui ocurre la deserializacion JSON y la emision a la UI.
   *
   * Nota: pasamos el evento y extraemos `.data`. En el navegador
   * `.data` puede ser string, Blob o ArrayBuffer; por ahora
   * asumimos texto JSON (lo mas comun en estos microservicios).
   */
  private handleMessage(event: MessageEvent): void {
    // Proteccion anti-carreras: puede llegar un mensaje justo tras close.
    if (!this.socket) return

    let parsed: unknown
    try {
      parsed = JSON.parse(String(event.data))
    } catch {
      // Mensaje corrupto/incompleto: lo descartamos sin romper la UI.
      // (En observabilidad, mejor saltarse un dato que tumbar el dashboard.)
      return
    }

    // Filtro minimo de forma: si no parece un envelope, lo ignoramos.
    if (!isRealtimeEnvelope(parsed)) return

    // Reparto del envelope a todos los suscriptores de negocio.
    this.messageHandlers.forEach((handler) => handler(parsed))
  }

  /**
   * Errores a nivel de transporte (red caida, handshake fallido...).
   * No cerramos aqui: el navegador seguira con `close` despues de un
   * error, y es en handleClose donde planificamos la reconexion.
   */
  private handleError(): void {
    // No accionamos nada en el error: dejamos que `close` decida.
  }

  /**
   * Se dispara SIEMPRE cuando la conexion se cierra (con o sin error).
   * Aqui vive la politica de REINTENTO inteligente:
   *   1. Detenemos el heartbeat (ya no hay canal que vigilar).
   *   2. Si el cierre fue manual, respetamos la decision del usuario.
   *   3. Si no, calculamos la espera con BACKOFF EXPONENCIAL + JITTER
   *      y reprogramamos `connect()`.
   */
  private handleClose(): void {
    this.stopHeartbeat()
    this.socket = null

    // Cierre manual (disconnect()): sin reconexion automatica.
    if (this.manuallyClosed) return
    // Reconexion desactivada por configuracion: nos quedamos 'disconnected'.
    if (!this.options.autoReconnect) return
    // Superamos el limite de intentos (si maxAttempts != -1 ilimitado).
    if (this.options.maxAttempts !== -1 && this.reconnectAttempts >= this.options.maxAttempts) {
      this.setStatus('disconnected')
      return
    }

    // --- Calculo del backoff exponencial ------------------------
    // Espera = min(base * 2^intentos, max). El exponente es el numero
    // de reintentos: cada fallo DOBLA la espera (1s -> 2s -> 4s...).
    const exponentialDelay = Math.min(
      this.options.reconnectBaseMs * 2 ** this.reconnectAttempts,
      this.options.reconnectMaxMs,
    )

    // Introducimos ALEATORIEDAD (jitter) para evitar el "thundering herd":
    // si 50 clientes caen juntos y todos esperan exactamente lo mismo,
    // reconectaran juntos y abrumaran al servidor. Un pequeño % aleatorio
    // reparte sus reintentos.
    const jitterFactor = 1 + Math.random() * this.options.reconnectJitter
    const delayMs = Math.round(exponentialDelay * jitterFactor)

    this.reconnectAttempts += 1
    this.setStatus('waitingForRetry')

    // Guardamos el handle para poder CANCELAR la reconexion si el
    // usuario decide desconectar durante la espera.
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.setStatus('reconnecting')
      this.connect()
    }, delayMs)
  }

  /**
   * Programa (o asegura) el latido periodico ping/pong.
   * Las conexiones WebSocket "dormilonas" pueden ser cerradas por
   * proxies sin avisar; el heartbeat detecta eso y dispara close.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return // ya hay uno activo
    this.heartbeatTimer = setInterval(() => {
      // Enviamos un ping ligero. Si el socket está "muerto" (proxy lo
      // corto, red caida), el envio desencadenara un `close()` y eso
      // reactivara la reconexion con backoff en handleClose.
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        // El dato del ping puede ser cualquier fragmento; el estandar
        // de facto es la cadena literal "ping".
        this.socket.send('ping')
      }
    }, this.options.heartbeatIntervalMs)
  }

  /** Detiene el latido (al cerrar la conexion o al desconectar). */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Cancela un backoff en curso (usado por disconnect()). */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}