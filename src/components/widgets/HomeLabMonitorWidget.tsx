/**
 * ============================================================
 * JAH ENGINE - Widget HomeLab Monitor
 * (src/components/widgets/HomeLabMonitorWidget.tsx)
 * ============================================================
 * Miniatura interactiva del Modulo 1 (Network & Hosts).
 *
 * Este componente es el ejemplo didactico central del proyecto:
 *  - Consume el hook de dominio `useHomeLabWidget`, que ya resuelve
 *    WebSocket + simulacion (ver src/hooks/useHomeLabWidget.ts).
 *  - Renderiza metricas en vivo: latencia media, disponibilidad,
 *    hosts online y una mini-grafica (sparkline) de latencia.
 *  - Permite navegar "fluida" hacia la app completa de HomeLab y
 *    deja preparado el enlace externo al microservicio Astro.
 *
 * REGLA PEDAGOGICA DE COMPONENTES:
 *  Un componente React debe ser una funcion PURA respecto a sus props
 *  y su estado: mismo estado -> mismo JSX. Los efectos secundarios
 *  (conexiones, timers) viven en hooks, nunca en el cuerpo del render.
 */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowUpRight, Cpu, Gauge, Server, Wifi } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useHomeLabWidget } from '@/hooks/useHomeLabWidget'
import type { ConnectionStatus, HostStatus } from '@/types'
import { formatLatency, formatPercent, formatUptime } from '@/utils/format'

/** Propiedades que acepta el widget (todas opcionales). */
export interface HomeLabMonitorWidgetProps {
  /**
   * URL del WebSocket de HomeLab Monitor. Si no se pasa, el hook
   * intenta leerla de `VITE_HOMELAB_WS_URL`.
   */
  wsUrl?: string
  /**
   * Callback de navegacion. Si no se pasa, el widget navega por si
   * mismo a la ruta interna `/network` usando React Router.
   */
  onOpenFullView?: () => void
}

/**
 * Traduce el estado de conexion a una etiqueta y variante visual.
 * Funcion pura de apoyo: mismas entradas -> misma salida.
 */
function describeConnection(status: ConnectionStatus): {
  label: string
  variant: 'success' | 'warning' | 'destructive' | 'outline'
} {
  switch (status) {
    case 'connected':
      return { label: 'EN VIVO', variant: 'success' }
    case 'connecting':
    case 'reconnecting':
      return { label: 'CONECTANDO', variant: 'warning' }
    case 'waitingForRetry':
      return { label: 'REINTENTANDO', variant: 'warning' }
    default:
      return { label: 'DESCONECTADO', variant: 'destructive' }
  }
}

/** Traduce el estado de un host a color del punto indicador. */
function hostStatusColor(status: HostStatus): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-500'
    case 'degraded':
      return 'bg-amber-500'
    case 'maintenance':
      return 'bg-sky-500'
    default:
      return 'bg-red-500'
  }
}

/**
 * Sparkline: mini-grafica de linea dibujada a mano con SVG.
 *
 * ¿Por qué SVG manual y no Recharts?
 * Un widget de miniatura debe pesar poco. Aprender a construir un
 * sparkline con <polyline> es un gran ejercicio: normalizamos cada
 * valor a coordenadas (x,y) dentro de un viewBox y unimos los puntos.
 *
 * @param values - Serie de latencias (ms) ya ordenada en el tiempo.
 */
function LatencySparkline({ values }: { values: number[] }) {
  // useMemo evita recalcular la geometria si `values` no cambio.
  // Dependencia: la propia serie (comparada por referencia).
  const geometry = useMemo(() => {
    // Sin datos no hay linea que pintar.
    if (values.length < 2) return null

    const width = 100 // ancho logico del viewBox
    const height = 32 // alto logico del viewBox
    const padding = 2 // margen para que la linea no toque los bordes

    // Rango de la serie para normalizar (evitamos min===max -> div/0).
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min === 0 ? 1 : max - min

    // Convertimos cada valor a un punto "x,y" del viewBox.
    const points = values
      .map((value, index) => {
        // x: repartimos el ancho entre los indices (0..n-1).
        const x = (index / (values.length - 1)) * width
        // y: invertimos (0 arriba). Menos latencia => mas arriba.
        const normalized = (value - min) / span
        const y = height - padding - normalized * (height - padding * 2)
        return `${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(' ')

    return { points, min, max }
  }, [values])

  // Placeholder si aun no hay suficiente historico.
  if (!geometry) {
    return (
      <div className="flex h-8 items-center justify-center text-xs text-muted-foreground">
        Recopilando muestras...
      </div>
    )
  }

  return (
    // preserveAspectRatio="none" permite estirar el SVG al 100% del ancho.
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-8 w-full text-emerald-500"
      role="img"
      aria-label="Historial de latencia"
    >
      {/* polyline une los puntos calculados. fill=none: solo linea. */}
      <polyline
        points={geometry.points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * Widget interactivo de HomeLab Monitor.
 *
 * @param props - Ver HomeLabMonitorWidgetProps.
 * @returns Tarjeta con metricas en vivo y accesos a la app completa.
 */
export function HomeLabMonitorWidget({ wsUrl, onOpenFullView }: HomeLabMonitorWidgetProps) {
  // 1) Datos: el hook nos da snapshot + estado de conexion + origen.
  const { snapshot, connection, isSimulated } = useHomeLabWidget(wsUrl)

  // 2) Navegacion interna declarativa (React Router).
  const navigate = useNavigate()

  // 3) URL opcional del microservicio Astro (app externa).
  const homeLabAppUrl = import.meta.env['VITE_HOMELAB_APP_URL'] as string | undefined

  // 4) Metricas derivadas: las calculamos con useMemo para no repetir
  //    el recorrido de arrays en cada render si el snapshot no cambia.
  const metrics = useMemo(() => {
    if (!snapshot) {
      return { avgLatency: null as number | null, onlineHosts: 0, totalHosts: 0, avgUptime: 0 }
    }
    const hosts = snapshot.hosts
    // Latencia media de la ultima muestra del historico.
    const lastSample = snapshot.latencyHistory[snapshot.latencyHistory.length - 1]
    const online = hosts.filter((host) => host.status === 'online').length
    // Media de uptime de los hosts que reportan dato.
    const uptimeValues = hosts
      .map((host) => host.uptime?.uptimePercent)
      .filter((value): value is number => typeof value === 'number')
    const avgUptime =
      uptimeValues.length > 0
        ? uptimeValues.reduce((acc, value) => acc + value, 0) / uptimeValues.length
        : 0

    return {
      avgLatency: lastSample?.latencyMs ?? null,
      onlineHosts: online,
      totalHosts: hosts.length,
      avgUptime,
    }
  }, [snapshot])

  // Serie lista para el sparkline (vacía mientras no haya snapshot).
  const latencySeries = snapshot?.latencyHistory.map((s) => s.latencyMs) ?? []

  // 5) Accion "abrir app completa": callback externo o navegacion interna.
  function handleOpenFullView() {
    if (onOpenFullView) {
      onOpenFullView()
      return
    }
    // Ruta interna del dashboard que muestra el modulo de red al completo.
    navigate('/network')
  }

  // Datos de conexion para el badge de la cabecera.
  const connectionInfo = describeConnection(connection)

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">HomeLab Monitor</CardTitle>
          </div>
          {/* Indicador doble: si simula lo dice; si no, muestra conexion. */}
          {isSimulated ? (
            <Badge variant="outline" title="Datos generados localmente">
              SIMULADO
            </Badge>
          ) : (
            <Badge variant={connectionInfo.variant}>{connectionInfo.label}</Badge>
          )}
        </div>
        <CardDescription className="flex items-center gap-2 text-xs">
          <Activity className="h-3.5 w-3.5" />
          Salud global: {snapshot ? formatPercent(snapshot.overallHealth) : '--%'}
          {/* Ultima actualizacion formateada a hora local. */}
          {snapshot && <span className="ml-auto">Actualizado {new Date(snapshot.generatedAt).toLocaleTimeString('es-ES')}</span>}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* --- Mini-grafica de latencia --- */}
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Gauge className="h-3.5 w-3.5" /> Latencia media
            </span>
            <span className="font-mono text-foreground">{formatLatency(metrics.avgLatency, 1)}</span>
          </div>
          <LatencySparkline values={latencySeries} />
        </div>

        {/* --- Rejilla de KPIs --- */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border p-2">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Server className="h-3 w-3" /> Hosts
            </div>
            <div className="mt-1 font-mono text-sm font-semibold">
              {metrics.onlineHosts}/{metrics.totalHosts}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Activity className="h-3 w-3" /> Uptime
            </div>
            <div className="mt-1 font-mono text-sm font-semibold">
              {formatPercent(metrics.avgUptime, 1)}
            </div>
          </div>
          <div className="rounded-md border p-2">
            <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <Cpu className="h-3 w-3" /> Incidentes
            </div>
            <div className="mt-1 font-mono text-sm font-semibold">
              {snapshot?.hosts.reduce((acc, h) => acc + (h.uptime?.incidentCount30d ?? 0), 0) ?? 0}
            </div>
          </div>
        </div>

        {/* --- Lista compacta de hosts con punto de estado --- */}
        <ul className="space-y-1.5">
          {snapshot?.hosts.slice(0, 4).map((host) => (
            // `key` estable = id del host (requisito de React para listas).
            <li key={host.id} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 shrink-0 rounded-full ${hostStatusColor(host.status)}`} />
              <span className="flex-1 truncate">{host.name}</span>
              <span className="font-mono text-muted-foreground">
                {formatLatency(host.latency?.latencyMs ?? null, 1)}
              </span>
              <span className="w-16 text-right font-mono text-muted-foreground">
                {formatUptime(host.uptime?.uptimeSeconds ?? 0)}
              </span>
            </li>
          ))}
          {/* Estado vacio mientras el primer snapshot carga. */}
          {!snapshot && (
            <li className="py-2 text-center text-xs text-muted-foreground">
              Conectando con HomeLab Monitor...
            </li>
          )}
        </ul>
      </CardContent>

      <CardFooter className="justify-between gap-2 border-t pt-4">
        {/* Navegacion "fluida" hacia la vista completa del modulo. */}
        <Button size="sm" onClick={handleOpenFullView}>
          Ver dashboard completo
          <ArrowUpRight className="h-4 w-4" />
        </Button>

        {/* Enlace externo al microservicio Astro, solo si hay URL. */}
        {homeLabAppUrl && (
          <Button size="sm" variant="outline" onClick={() => window.open(homeLabAppUrl, '_blank', 'noopener')}>
            App HomeLab
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default HomeLabMonitorWidget