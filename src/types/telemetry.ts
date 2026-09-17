/**
 * ============================================================
 * JAH ENGINE - Contratos de Telemetría (src/types/telemetry.ts)
 * ============================================================
 * Este archivo define el CONTRATO DE DATOS (data contract) que
 * comparten el microservicio HomeLab Monitor (backend) y el
 * dashboard (frontend).
 *
 * ¿Qué es un contrato de datos?
 * Un acuerdo de forma. Si el backend envía un campo con otro nombre
 * o tipo, TypeScript deja de compilar el frontend y detectamos el
 * error ANTES de desplegar. Es el equivalente a un "esquema" pero
 * verificado en tiempo de compilación.
 *
 * NOTA DE ESTILO (importante y deliberada):
 * A diferencia del resto del proyecto (que usa camelCase), aquí
 * usamos snake_case (`schema_version`, `bound_ports`...). ¿Por qué?
 * Porque este módulo REFLEJA 1:1 el JSON que emite el backend en
 * Python (FastAPI/HomeLab Monitor). Mantener el mismo nombre elimina
 * una capa de traducción (mapping) que sería una fuente constante de
 * bugs. Es una decisión consciente: "el cable manda".
 *
 * NOTA SOBRE `enum` vs uniones de strings:
 * El tsconfig activa `erasableSyntaxOnly`, que prohíbe los `enum`.
 * Usamos "string literal unions": idéntica seguridad de tipos y
 * autocompletado, pero 100% estáticos (no generan código en runtime).
 */

/* =====================================================================
   ============================ ENUMS LIGEROS ===========================
   ===================================================================== */

/** Entorno lógico del host que emite la telemetría. */
export type TelemetryEnvironment = 'production' | 'staging' | 'development' | 'homelab'

/** Estado de salud genérico (contenedores, servicios, checks...). */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown'

/** Estado de una interfaz de red o túnel. */
export type LinkState = 'up' | 'down' | 'connected' | 'disconnected' | 'starting' | 'unknown'

/* =====================================================================
   ============================ SOURCE INFO =============================
   ===================================================================== */

/**
 * Información del host emisor (el "quién" y "dónde" del mensaje).
 *
 * @param hostname      - Nombre del servidor (ej. "homelab-node-01").
 * @param ip_address    - IP principal del host en la LAN.
 * @param environment   - Entorno lógico (homelab, production...).
 * @param os            - Distribución/versión del sistema operativo.
 * @param kernel        - Versión del kernel Linux.
 * @param agent_version - Versión del agente/colector que reporta.
 * @param collected_at  - Momento exacto de recolección (ISO 8601).
 */
export interface SourceInfo {
  hostname: string
  ip_address: string
  environment: TelemetryEnvironment
  os: string
  kernel: string
  agent_version: string
  collected_at: string
}

/* =====================================================================
   =========================== SYSTEM METRICS ==========================
   ===================================================================== */

/**
 * Métricas de CPU.
 *
 * @param usage_percent     - Uso global de CPU [0-100].
 * @param cores             - Nº de núcleos lógicos disponibles.
 * @param load_average      - Carga media [1m, 5m, 15m]. Es una TUPLA de
 *                            exactamente 3 números (el orden importa).
 * @param frequency_mhz     - Frecuencia media actual en MHz.
 */
export interface CpuMetrics {
  usage_percent: number
  cores: number
  load_average: [number, number, number]
  frequency_mhz: number
}

/**
 * Métricas de memoria RAM y swap.
 *
 * Todos los tamaños se expresan en BYTES (enteros) para no arrastrar
 * errores de coma flotante; el frontend se encarga de formatearlos
 * a GiB/MiB para el usuario.
 *
 * @param total_bytes       - RAM total instalada.
 * @param used_bytes        - RAM en uso.
 * @param free_bytes        - RAM libre (sin contar buffers/caché).
 * @param available_bytes   - RAM realmente disponible para aplicaciones.
 * @param usage_percent     - Porcentaje de uso [0-100].
 * @param swap_total_bytes  - Tamaño total de swap.
 * @param swap_used_bytes   - Swap en uso.
 */
export interface MemoryMetrics {
  total_bytes: number
  used_bytes: number
  free_bytes: number
  available_bytes: number
  usage_percent: number
  swap_total_bytes: number
  swap_used_bytes: number
}

/**
 * Uso de almacenamiento de UN punto de montaje.
 *
 * Se modela por punto de montaje (`/`, `/var/lib/docker`, `/mnt/backups`)
 * porque cada volumen puede estar en un disco distinto.
 *
 * @param mount_point   - Ruta donde está montado (ej. "/").
 * @param device        - Dispositivo físico o lógico (ej. "/dev/nvme0n1p2").
 * @param filesystem    - Tipo de sistema de archivos (ext4, btrfs, zfs...).
 * @param total_bytes   - Capacidad total.
 * @param used_bytes    - Espacio ocupado.
 * @param free_bytes    - Espacio libre.
 * @param usage_percent - Porcentaje ocupado [0-100].
 */
export interface StorageMount {
  mount_point: string
  device: string
  filesystem: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  usage_percent: number
}

/**
 * Agregado de métricas del sistema operativo.
 *
 * @param cpu                 - Métricas de CPU.
 * @param memory              - Métricas de memoria.
 * @param temperature_celsius - Temperatura del sistema (null si no hay sensor).
 * @param uptime_seconds      - Tiempo encendido acumulado.
 * @param storage             - Lista de puntos de montaje monitorizados.
 * @param process_count       - Nº de procesos activos.
 */
export interface SystemMetrics {
  cpu: CpuMetrics
  memory: MemoryMetrics
  temperature_celsius: number | null
  uptime_seconds: number
  storage: StorageMount[]
  process_count: number
}

/* =====================================================================
   ========================== NETWORK METRICS ==========================
   ===================================================================== */

/**
 * Estado de UNA interfaz de red.
 *
 * @param name       - Nombre (eth0, docker0, tailscale0...).
 * @param ip_address - IPv4/IPv6 asignada (null si no tiene).
 * @param mac_address- Dirección MAC (null en interfaces virtuales).
 * @param state      - Estado del enlace (up/down/unknown).
 * @param speed_mbps - Velocidad negociada en Mbps (null si desconocida).
 * @param rx_bytes   - Bytes recibidos acumulados.
 * @param tx_bytes   - Bytes transmitidos acumulados.
 * @param rx_errors  - Paquetes con error en recepción.
 * @param tx_errors  - Paquetes con error en transmisión.
 */
export interface NetworkInterface {
  name: string
  ip_address: string | null
  mac_address: string | null
  state: LinkState
  speed_mbps: number | null
  rx_bytes: number
  tx_bytes: number
  rx_errors: number
  tx_errors: number
}

/**
 * Estado de un TÚNEL de red (Cloudflare Tunnel, Tailscale, WireGuard...).
 *
 * @param name        - Identificador lógico (ej. "cloudflared", "tailscale").
 * @param provider    - Proveedor/tecnología (cloudflare, tailscale, wireguard).
 * @param status      - Estado de la conexión.
 * @param ip_address  - IP virtual asignada por el túnel (si aplica).
 * @param latency_ms  - Latencia medida al punto de salida (null si N/A).
 * @param peers       - Nº de peers/dispositivos conectados (si aplica).
 * @param since       - Desde cuándo está conectado (ISO 8601, null si caído).
 */
export interface TunnelStatus {
  name: string
  provider: string
  status: LinkState
  ip_address: string | null
  latency_ms: number | null
  peers: number
  since: string | null
}

/**
 * Agregado de métricas de red.
 *
 * @param interfaces     - Interfaces detectadas.
 * @param tunnels        - Túneles y su estado.
 * @param default_gateway- Puerta de enlace por defecto.
 * @param dns_servers    - Servidores DNS configurados.
 * @param external_ip    - IP pública de salida (null si no se pudo resolver).
 * @param latency_ms     - Latencia media externa medida por el agente.
 */
export interface NetworkMetrics {
  interfaces: NetworkInterface[]
  tunnels: TunnelStatus[]
  default_gateway: string | null
  dns_servers: string[]
  external_ip: string | null
  latency_ms: number | null
}

/* =====================================================================
   ========================= CONTAINER METRICS =========================
   ===================================================================== */

/**
 * Mapeo de un puerto publicado por un contenedor Docker.
 *
 * `bound_ports` es el nombre exacto que usa el backend para el array
 * de puertos vinculados (host -> contenedor).
 *
 * @param host_port      - Puerto en el host (ej. 8080).
 * @param container_port - Puerto dentro del contenedor (ej. 80).
 * @param protocol       - Protocolo de transporte.
 * @param host_ip        - IP de escucha en el host (0.0.0.0 = todas).
 */
export interface ContainerPortBinding {
  host_port: number
  container_port: number
  protocol: 'tcp' | 'udp'
  host_ip: string
}

/**
 * Métricas de UN contenedor Docker.
 *
 * @param id                  - ID corto del contenedor (12 hex).
 * @param name                - Nombre legible (ej. "nginx-proxy").
 * @param image               - Imagen y tag (ej. "nginx:1.27-alpine").
 * @param status              - Estado del contenedor.
 * @param health              - Resultado del HEALTHCHECK de Docker.
 * @param cpu_percent         - % de CPU consumido.
 * @param memory_used_bytes   - RAM usada por el contenedor.
 * @param memory_limit_bytes  - Límite de RAM asignado (0 = sin límite).
 * @param memory_percent      - % de RAM respecto a su límite.
 * @param uptime_seconds      - Antigüedad en estado "running".
 * @param restart_count       - Veces que Docker lo reinició.
 * @param bound_ports         - Puertos publicados host -> contenedor.
 */
export interface ContainerMetrics {
  id: string
  name: string
  image: string
  status: 'running' | 'exited' | 'restarting' | 'paused' | 'created' | 'dead'
  health: HealthStatus
  cpu_percent: number
  memory_used_bytes: number
  memory_limit_bytes: number
  memory_percent: number
  uptime_seconds: number
  restart_count: number
  bound_ports: ContainerPortBinding[]
}

/* =====================================================================
   ========================== SECURITY METRICS =========================
   ===================================================================== */

/**
 * Regla del cortafuegos UFW.
 *
 * @param port     - Puerto o rango ("22", "8000:9000").
 * @param protocol - Protocolo afectado o "any".
 * @param action   - Acción aplicada por la regla.
 * @param from     - Origen permitido/bloqueado ("Anywhere", "192.168.1.0/24").
 * @param comment  - Etiqueta humana de la regla (opcional).
 */
export interface FirewallRule {
  port: string
  protocol: 'tcp' | 'udp' | 'any'
  action: 'allow' | 'deny' | 'reject' | 'limit'
  from: string
  comment?: string
}

/**
 * Puerto activo detectado a la escucha en el host.
 *
 * @param port               - Número de puerto.
 * @param protocol           - Protocolo de transporte.
 * @param process            - Proceso que lo escucha (ej. "sshd").
 * @param address            - Dirección de escucha (0.0.0.0, 127.0.0.1...).
 * @param exposed_externally - true si es alcanzable desde fuera del host.
 */
export interface ActivePort {
  port: number
  protocol: 'tcp' | 'udp'
  process: string
  address: string
  exposed_externally: boolean
}

/**
 * Agregado de seguridad del host.
 *
 * @param ufw_enabled            - ¿Está activo el cortafuegos UFW?
 * @param ufw_default_incoming   - Política por defecto de entrada.
 * @param ufw_default_outgoing   - Política por defecto de salida.
 * @param rules                  - Reglas configuradas en UFW.
 * @param active_ports           - Puertos a la escucha ahora mismo.
 * @param fail2ban_active        - ¿Está activo fail2ban (anti fuerza bruta)?
 * @param ssh_failed_attempts_24h- Intentos SSH fallidos en 24h.
 */
export interface SecurityMetrics {
  ufw_enabled: boolean
  ufw_default_incoming: 'allow' | 'deny' | 'reject'
  ufw_default_outgoing: 'allow' | 'deny' | 'reject'
  rules: FirewallRule[]
  active_ports: ActivePort[]
  fail2ban_active: boolean
  ssh_failed_attempts_24h: number
}

/* =====================================================================
   ============================ TELEMETRY ==============================
   ===================================================================== */

/**
 * PAYLOAD GLOBAL de telemetría: la raíz de todo el mensaje.
 *
 * Es la unidad que devuelve `TelemetryService.fetchTelemetry()` y la
 * que consume el hook `useTelemetry`.
 *
 * @param schema_version - Versión del contrato (permite evolucionar el
 *                         backend sin romper clientes antiguos).
 * @param timestamp      - Momento de generación del snapshot (ISO 8601).
 * @param source         - Host emisor.
 * @param system         - Métricas del sistema operativo.
 * @param network        - Métricas de red y túneles.
 * @param containers     - Lista de contenedores Docker.
 * @param security       - Estado de seguridad (UFW, puertos...).
 */
export interface TelemetryData {
  schema_version: string
  timestamp: string
  source: SourceInfo
  system: SystemMetrics
  network: NetworkMetrics
  containers: ContainerMetrics[]
  security: SecurityMetrics
}