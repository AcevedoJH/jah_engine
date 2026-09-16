/**
 * ============================================================
 * JAH ENGINE - Simulador de HomeLab Monitor
 * (src/services/homeLabSimulator.ts)
 * ============================================================
 * CUANDO SIRVE este simulador:
 *  - En desarrollo, el microservicio HomeLab Monitor (Astro) puede
 *    no estar levantado. Este modulo emite snapshots identicos a los
 *    reales para que la UI se desarrolle y pruebe sin dependencias.
 *  - Cuando el WebSocket real conecta, el widget deja de simular y
 *    consume datos reales (la decisión vive en el hook useHomeLabWidget).
 *
 * Como imita la realidad:
 *  - "Random walk": la latencia de cada host oscila suavemente alrededor
 *    de un valor base (no son numeros aleatorios puros, sino que cada
 *    muestra deriva poco de la anterior). Eso produce graficas realistas.
 *  - Cambios de estado esporadicos: ocasionalmente un host se degrada
 *    (packet loss alto) o vuelve a la normalidad, simulando incidentes.
 */

import type {
  HomeLabSnapshot,
  Host,
  HostStatus,
  LatencySample,
} from '@/types'

/**
 * Datos "estaticos" de los hosts simulados. El generador no analiza
 * archivos, crea estos cuatro nodos tipicos de un home-lab.
 */
const SIMULATED_HOSTS: Host[] = [
  { id: 'host-router', name: 'Router Pfsense', role: 'router', status: 'online', ipAddress: '192.168.1.1', lastSeenAt: new Date().toISOString() },
  { id: 'host-nas', name: 'NAS Synology', role: 'nas', status: 'online', ipAddress: '192.168.1.20', lastSeenAt: new Date().toISOString() },
  { id: 'host-proxmox', name: 'Proxmox Nodo-01', role: 'compute', status: 'online', ipAddress: '192.168.1.10', lastSeenAt: new Date().toISOString() },
  { id: 'host-plex', name: 'Plex Media', role: 'service', status: 'online', ipAddress: '192.168.1.30', lastSeenAt: new Date().toISOString() },
]

/** Latencia base (ms) y umbral de ruido por host (para la caminata). */
const BASE_LATENCY: Record<string, number> = {
  'host-router': 3,
  'host-nas': 18,
  'host-proxmox': 12,
  'host-plex': 25,
}

/**
 * Configuracion global del generador.
 */
export interface HomeLabSimulatorOptions {
  /** Cada cuantos milisegundos se emite un snapshot nuevo. */
  intervalMs: number
  /** Nº maximo de muestras de latencia conservadas (el widget pinta la
   *  mini-grafica con este historico). */
  historySize: number
}

/** Opciones por defecto: una medicion cada 2 segundos, 20 de historial. */
export function defaultSimulatorOptions(): HomeLabSimulatorOptions {
  return {
    intervalMs: 2_000,
    historySize: 20,
  }
}

/**
 * Estado interno vivo del generador: latencias y estados actuales.
 * Se actualiza en cada "tick" del intervalo.
 */
interface SimulatorState {
  hosts: Host[]
  latencies: Map<string, LatencySample>
}

/** Estado "sano" de arranque: todos online, latencia base en el historial. */
function createInitialState(): SimulatorState {
  const now = new Date().toISOString()
  const latencies = new Map<string, LatencySample>()

  SIMULATED_HOSTS.forEach((host) => {
    // Primera muestra: exactamente la latencia base (sin ruido aun).
    latencies.set(host.id, {
      hostId: host.id,
      latencyMs: BASE_LATENCY[host.id] ?? 10,
      jitterMs: BASE_LATENCY[host.id] ? BASE_LATENCY[host.id] * 0.1 : 1,
      packetLossPct: 0,
      measuredAt: now,
    })
  })

  return { hosts: SIMULATED_HOSTS, latencies }
}

/**
 * Clase generadora de snapshots.
 *
 * Patron: productor/consumidor. Recibe un callback `onSnapshot` y lo
 * invoca con cada snapshot. Devuelve `stop()` para cancelar el
 * intervalo (el cleanup del hook lo llama).
 */
export class HomeLabSimulator {
  /** Callback que recibe cada snapshot generado (inyectado por el hook). */
  private readonly onSnapshot: (snapshot: HomeLabSnapshot) => void

  /** Copia mutable de los hosts (su status cambia con los ticks). */
  private readonly hosts: Host[]

  /** Mapa de la ultima muestra de latencia por host. */
  private readonly latencies: Map<string, LatencySample>

  /** Buffer circular de muestras para la mini-grafica (se poda). */
  private readonly history: LatencySample[] = []

  private readonly options: HomeLabSimulatorOptions
  private timer: ReturnType<typeof setInterval> | null = null

  /**
   * Nota pedagogica: `erasableSyntaxOnly` prohibe las "parameter
   * properties" (atajo que declara y asigna un campo a la vez). Por eso
   * declaramos cada campo arriba y lo asignamos de forma explicita aqui.
   *
   * @param onSnapshot - Callback invocado con cada snapshot generado.
   * @param options    - Intervalo e historial (opcional).
   */
  constructor(
    onSnapshot: (snapshot: HomeLabSnapshot) => void,
    options: Partial<HomeLabSimulatorOptions> = {},
  ) {
    const state = createInitialState()
    this.onSnapshot = onSnapshot
    // Clonamos los hosts: el simulador muta `status`, y no queremos
    // modificar el array "constante" original.
    this.hosts = state.hosts.map((host) => ({ ...host }))
    this.latencies = state.latencies
    this.options = { ...defaultSimulatorOptions(), ...options }

    // Forzamos la primera emision inmediata (sin esperar el primer tick)
    // para que la UI tenga datos desde el primer render.
    this.emitSnapshot()
  }

  /** Arranca el bucle de generacion de datos. */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.emitSnapshot(), this.options.intervalMs)
  }

  /** Detiene el bucle (unmount del componente / desmontaje del hook). */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Construye y emite un snapshot actualizado.
   * Es el "corazon" del simulador: muta el estado interno (historicos,
   * latencias, estados) y lo empaqueta en un HomeLabSnapshot.
   */
  private emitSnapshot(): void {
    const now = new Date().toISOString()

    // 1) Move random-walk de latencia para cada host ------------------
    // La nueva latencia depende de la anterior + pequeño delta aleatorio
    // con media 0. Asi la serie "camina" de forma continua y natural.
    this.latencies.forEach((sample) => {
      const base = BASE_LATENCY[sample.hostId] ?? 10
      // Delta dentro de [-20%, +30%] del valor base (asimetria leve
      // para que la red "tienda" a degradarse).
      const delta = base * (Math.random() * 0.5 - 0.2)
      const nextLatency = Math.max(1, sample.latencyMs + delta)

      // El jitter es la varianza instantanea: a mas latencia, mas ruido.
      const nextJitter = nextLatency * (0.05 + Math.random() * 0.15)

      // El packet loss aparece de forma esporadica (0 normalmente).
      // ~3% de probabilidad de "pequena perdida" (simula interferencia).
      const nextLoss = Math.random() < 0.03 ? Math.random() * 2 : 0

      this.latencies.set(sample.hostId, {
        hostId: sample.hostId,
        latencyMs: Math.round(nextLatency * 10) / 10,
        jitterMs: Math.round(nextJitter * 10) / 10,
        packetLossPct: Math.round(nextLoss * 100) / 100,
        measuredAt: now,
      })
    })

    // 2) Manejamos estados de host (degradado/recuperado) ------------
    // Con pequeña probabilidad "degradamos" un host sano (fleco de red)
    // y con otra probabilidad recuperamos uno degradado a 'online'.
    this.aggregateHostStatuses()

    // 3) Conservamos el historico de la latencia PROMEDIO del cluster.
    const averageLatency = this.averageLatency()
    const historySample: LatencySample = {
      hostId: 'cluster',
      latencyMs: averageLatency,
      jitterMs: Math.round(averageLatency * 0.1 * 10) / 10,
      packetLossPct: this.averagePacketLoss(),
      measuredAt: now,
    }

    // Guardamos la muestra en el buffer circular del historico
    // (el array se poda solo: nunca crece mas alla de historySize).
    this.pushHistory(historySample)

    // 4) Empacamos el snapshot con su metrica sintetica de salud.
    const health = this.computeOverallHealth(historySample)
    const snapshot: HomeLabSnapshot = {
      generatedAt: now,
      hosts: this.hosts.map((host) => ({
        ...host,
        // Fechamos el ultimo pulso con el momento actual.
        lastSeenAt: now,
        latency: this.latencies.get(host.id) ?? null,
        uptime: {
          hostId: host.id,
          // Uptime simulado: 30 dias menos los incidentes contados.
          uptimeSeconds: 2_592_000 - (this.countIncidents(host.id) * 300),
          uptimePercent: 99.5 - this.countIncidents(host.id) * 0.2,
          incidentCount30d: this.countIncidents(host.id),
          lastIncidentAt: this.lastIncidentOf(host.id),
        },
      })),
      overallHealth: health,
      latencyHistory: this.getHistory(),
    }

    this.onSnapshot(snapshot)
  }

  /* ---------------------------------------------------------------
     METODOS AUXILIARES del simulador (matemáticas de la metrica).
     --------------------------------------------------------------- */

  /** Media aritmetica de las latencias de todos los hosts. */
  private averageLatency(): number {
    const samples = [...this.latencies.values()]
    if (samples.length === 0) return 0
    const sum = samples.reduce((acc, s) => acc + s.latencyMs, 0)
    return Math.round((sum / samples.length) * 10) / 10
  }

  /** Media de perdida de paquetes del cluster. */
  private averagePacketLoss(): number {
    const samples = [...this.latencies.values()]
    if (samples.length === 0) return 0
    const sum = samples.reduce((acc, s) => acc + s.packetLossPct, 0)
    return Math.round((sum / samples.length) * 100) / 100
  }

  /**
   * Metrica global de salud [0-100]. Como la produccion real la vincula
   * a perdida y latencia, la modelizamos con una formula sencilla:
   *   100 - (perdida * 5 + latencia/10)
   * La latencia de un home-lab es baja, asi que el factor dominante
   * es la perdida de paquetes (el "fallo" tipico de red Wifi/ISP).
   */
  private computeOverallHealth(latest: LatencySample): number {
    const penalty = latest.packetLossPct * 5 + latest.latencyMs / 10
    // clamp a [0, 100] para que nunca se desborde.
    return Math.max(0, Math.min(100, Math.round(100 - penalty)))
  }

  /** Recuento de incidentes "fingidos" de cada host (0, 1 o 2). */
  private countIncidents(hostId: string): number {
    // Determinista por la suma de caracteres: estable entre ticks.
    const seed = [...hostId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    return seed % 3
  }

  /** Fecha del ultimo incidente fingido de un host (null si ninguno). */
  private lastIncidentOf(hostId: string): string | null {
    const incidents = this.countIncidents(hostId)
    if (incidents === 0) return null
    // 24h * incidents atras. Simula incidentes recientes.
    const ago = Date.now() - 24 * 3600 * 1000 * incidents
    return new Date(ago).toISOString()
  }

  /** Actualiza status de hosts: degradaciones y recuperaciones aleatorias. */
  private aggregateHostStatuses(): void {
    this.hosts.forEach((host) => {
      const current = host.status
      // Host sano: 2% de probabilidad de degradarse.
      if (current === 'online' && Math.random() < 0.02) {
        host.status = 'degraded' as HostStatus
      }
      // Host degradado: 15% de probabilidad de recuperarse.
      if (current === 'degraded' && Math.random() < 0.15) {
        host.status = 'online'
      }
    })
  }

  /* ---------------------------------------------------------------
     GESTION DEL HISTORICO (para la mini-grafica del widget).
     --------------------------------------------------------------- */

  /** Anade una muestra y poda el exceso (FIFO). */
  private pushHistory(sample: LatencySample): void {
    this.history.push(sample)
    if (this.history.length > this.options.historySize) {
      // Shift quita el primer elemento (el mas antiguo).
      this.history.shift()
    }
  }

  /** Devuelve una COPIA para que nadie mute el estado interno. */
  getHistory(): LatencySample[] {
    return [...this.history]
  }
}