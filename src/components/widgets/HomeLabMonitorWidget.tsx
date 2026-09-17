/**
 * ============================================================
 * JAH ENGINE - Widget HomeLab Monitor
 * (src/components/widgets/HomeLabMonitorWidget.tsx)
 * ============================================================
 * Miniatura interactiva del Modulo 1 (Network & Hosts).
 *
 * Este componente es el ejemplo didactico central del proyecto:
 *  - Consume el hook `useTelemetry`, que resuelve automaticamente
 *    la fuente de datos (mock o API real) segun la variable de
 *    entorno `VITE_USE_MOCK_DATA`.
 *  - Renderiza metricas clave en vivo: uso de CPU/RAM, estado de
 *    contenedores Docker y estado de los tuneles de red.
 *  - Permite navegacion fluida hacia la app completa de HomeLab
 *    y deja preparado el enlace externo al microservicio Astro.
 *
 * REGLA PEDAGOGICA DE COMPONENTES:
 *  Un componente React debe ser una funcion PURA respecto a sus props
 *  y su estado: mismo estado -> mismo JSX. Los efectos secundarios
 *  (conexiones, timers) viven en hooks, nunca en el cuerpo del render.
 */

import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  Box,
  Cpu,
  Globe,
  HardDrive,
  RefreshCw,
  Server,
  Thermometer,
  Wifi,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useTelemetry } from '@/features/network/hooks/useTelemetry'
import { summarizeContainerHealth } from '@/features/network/services/telemetryService'
import { cn } from '@/utils/cn'
import { formatBytes, formatPercent, formatUptime } from '@/utils/format'

/* =====================================================================
   ======================== PROPS DEL COMPONENTE =======================
   ===================================================================== */

/** Propiedades que acepta el widget. */
export interface HomeLabMonitorWidgetProps {
  /**
   * Callback de navegacion. Si no se pasa, el widget navega por si
   * mismo a la ruta interna `/network` usando React Router.
   */
  onOpenFullView?: () => void
  /**
   * Intervalo de refresco automatico en ms. Si se pasa, el widget
   * actua como un panel de monitoreo en vivo con polling. Si no se
   * pasa (undefined/null), el widget carga una sola vez al montarse.
   */
  pollingIntervalMs?: number | null
}

/* =====================================================================
   ===================== COMPONENTES AUXILIARES ========================
   ===================================================================== */

/**
 * Barra de progreso animada para metricas con porcentaje.
 * Funcion pura: solo renderiza un div con un ancho proporcional.
 *
 * @param percent   - Valor [0-100] a representar.
 * @param label     - Texto superpuesto (ej. "57.0%").
 * @param color     - Clase de Tailwind para el color de relleno.
 */
function ProgressBar({
  percent,
  label,
  color,
}: {
  percent: number
  label: string
  color: string
}) {
  return (
    <div className="relative h-5 w-full overflow-hidden rounded bg-muted">
      <div
        className={cn('h-full rounded transition-all duration-500', color)}
        style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-foreground mix-blend-difference">
        {label}
      </span>
    </div>
  )
}

/**
 * Skeleton de carga: muestra bloques pulsantes (Tailwind animate-pulse)
 * con la misma estructura visual que el contenido real. Esto evita
 * "layout shift" (desplazamiento brusco de elementos) al cambiar
 * de estado de carga a contenido.
 */
function LoadingSkeleton() {
  return (
    <Card className="w-full max-w-md animate-pulse">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-muted" />
            <div className="h-5 w-40 rounded bg-muted" />
          </div>
          <div className="h-6 w-16 rounded-full bg-muted" />
        </div>
        <div className="mt-2 h-3 w-full rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Simula las barras de CPU/RAM */}
        <div className="space-y-2">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
        </div>
        {/* Simula la lista de contenedores */}
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-muted" />
              <div className="h-3 flex-1 rounded bg-muted" />
              <div className="h-3 w-12 rounded bg-muted" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Tarjeta de error con boton de reintento.
 * Muestra un AlertTriangle y el mensaje del error.
 */
function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card className="w-full max-w-md border-destructive/50">
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <div className="rounded-full bg-destructive/10 p-3">
          <Thermometer className="h-6 w-6 text-destructive" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground">Error de Telemetria</h3>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">{error}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}

/* =====================================================================
   ================== COMPONENTE PRINCIPAL ============================
   ===================================================================== */

/**
 * Widget interactivo de HomeLab Monitor.
 *
 * @param props - Ver HomeLabMonitorWidgetProps.
 * @returns Tarjeta con metricas en vivo y accesos a la app completa.
 */
export function HomeLabMonitorWidget({
  onOpenFullView,
  pollingIntervalMs,
}: HomeLabMonitorWidgetProps) {
  // 1) Datos: el hook resuelve automaticamente mock vs API real.
  const { data, isLoading, error, refetch, lastUpdatedAt, isMock } =
    useTelemetry({
      pollingIntervalMs: pollingIntervalMs ?? null,
      enabled: true,
    })

  // 2) Navegacion interna declarativa (React Router).
  const navigate = useNavigate()

  // 3) URL opcional del microservicio Astro (app externa).
  const homeLabAppUrl = import.meta.env['VITE_HOMELAB_APP_URL'] as string | undefined

  // 4) Metricas derivadas precomputadas.
  const containerSummary = summarizeContainerHealth(data?.containers ?? [])
  const activeTunnels = data?.network.tunnels ?? []

  // 5) Accion "abrir app completa": callback externo o navegacion interna.
  function handleOpenFullView() {
    if (onOpenFullView) {
      onOpenFullView()
      return
    }
    navigate('/network')
  }

  // --- ESTADO DE CARGA INICIAL ---
  // Solo mostramos skeleton si NO tenemos datos previos.
  // Si hay datos y se está refrescando, mostramos los datos viejos
  // con un indicador sutil (evita el "flash" de carga molesto).
  if (isLoading && !data) {
    return <LoadingSkeleton />
  }

  // --- ESTADO DE ERROR (sin datos previos) ---
  if (error && !data) {
    return <ErrorState error={error} onRetry={refetch} />
  }

  // Si tras todo no hay datos, no renderizamos nada.
  if (!data) return null

  // --- CALCULOS DERIVADOS DEL PAYLOAD ---
  const cpuPercent = data.system.cpu.usage_percent
  const ramPercent = data.system.memory.usage_percent
  const tempColor =
    data.system.temperature_celsius !== null && data.system.temperature_celsius > 70
      ? 'text-destructive'
      : data.system.temperature_celsius !== null && data.system.temperature_celsius > 55
        ? 'text-amber-500'
        : 'text-emerald-500'

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">HomeLab Monitor</CardTitle>
          </div>
          {/* Indicador dual: MOCK vs LIVE segun estrategia activa. */}
          {isMock ? (
            <Badge variant="outline" title="Datos generados localmente">
              SIMULADO
            </Badge>
          ) : (
            <Badge variant="success">EN VIVO</Badge>
          )}
        </div>
        <CardDescription className="flex items-center gap-2 text-xs">
          <Server className="h-3.5 w-3.5" />
          <span className="truncate">{data.source.hostname}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {lastUpdatedAt
              ? `Actualizado ${new Date(lastUpdatedAt).toLocaleTimeString('es-ES')}`
              : '--:--:--'}
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* --- ERROR INFERIOR (si hay datos pero fallo el refresco) --- */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            Fallo al refrescar: {error}
            <Button variant="ghost" size="sm" className="ml-2 h-6 p-0" onClick={refetch}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* --- BARRAS DE CPU / RAM --- */}
        <div className="space-y-2">
          <div>
            <div className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" /> CPU
              </span>
              <span className="font-mono text-foreground">
                {formatPercent(cpuPercent, 1)}
              </span>
            </div>
            <ProgressBar
              percent={cpuPercent}
              label=""
              color={cpuPercent > 80 ? 'bg-destructive' : cpuPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}
            />
          </div>

          <div>
            <div className="mb-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <HardDrive className="h-3 w-3" /> RAM
              </span>
              <span className="font-mono text-foreground">
                {formatBytes(data.system.memory.used_bytes, 1)} /
                {formatBytes(data.system.memory.total_bytes, 1)}
              </span>
            </div>
            <ProgressBar
              percent={ramPercent}
              label=""
              color={ramPercent > 85 ? 'bg-destructive' : ramPercent > 70 ? 'bg-amber-500' : 'bg-primary'}
            />
          </div>
        </div>

        {/* --- KPIs RAPIDOS --- */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded border p-1.5">
            <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
              <Thermometer className="h-2.5 w-2.5" />
              Temp
            </div>
            <div className={cn('mt-0.5 font-mono text-xs font-semibold', tempColor)}>
              {data.system.temperature_celsius !== null
                ? `${data.system.temperature_celsius.toFixed(1)}°`
                : '--'}
            </div>
          </div>
          <div className="rounded border p-1.5">
            <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
              <Activity className="h-2.5 w-2.5" />
              Proc
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold">
              {data.system.process_count}
            </div>
          </div>
          <div className="rounded border p-1.5">
            <div className="flex items-center justify-center gap-0.5 text-[10px] text-muted-foreground">
              <Box className="h-2.5 w-2.5" />
              Docker
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold">
              {containerSummary.running}/{containerSummary.total}
            </div>
          </div>
          <div className="rounded border p-1.5">
            <div className="flex items-center justify-center text-[10px] text-muted-foreground">
              Uptime
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold">
              {formatUptime(data.system.uptime_seconds)}
            </div>
          </div>
        </div>

        {/* --- CONTENEDORES DOCKER (compacto) --- */}
        {containerSummary.total > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Box className="h-3 w-3" /> Contenedores
            </div>
            <ul className="space-y-1">
              {data.containers.slice(0, 4).map((container) => {
                // Color del indicador de salud: semaforo para healthy/unhealthy.
                const healthColor =
                  container.health === 'healthy'
                    ? 'bg-emerald-500'
                    : container.health === 'unhealthy'
                      ? 'bg-red-500'
                      : container.status === 'running'
                        ? 'bg-amber-500'
                        : 'bg-gray-400'
                return (
                  <li key={container.id} className="flex items-center gap-2 text-xs">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', healthColor)} />
                    <span className="flex-1 truncate font-medium">{container.name}</span>
                    <span className="w-10 text-right font-mono text-muted-foreground">
                      {container.cpu_percent.toFixed(1)}%
                    </span>
                    <span className="w-16 text-right font-mono text-muted-foreground">
                      {container.bound_ports
                        .map((p) => p.host_port)
                        .slice(0, 2)
                        .join(', ')}
                    </span>
                  </li>
                )
              })}
              {containerSummary.total > 4 && (
                <li className="pl-4 text-[11px] text-muted-foreground">
                  +{containerSummary.total - 4} mas
                </li>
              )}
            </ul>
          </div>
        )}

        {/* --- TUNNELS DE RED --- */}
        {activeTunnels.length > 0 && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Globe className="h-3 w-3" /> Tuneles
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeTunnels.map((tunnel) => (
                <Badge
                  key={tunnel.name}
                  variant={tunnel.status === 'connected' ? 'success' : 'destructive'}
                  className="text-[10px]"
                >
                  {tunnel.name}: {tunnel.status}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-between gap-2 border-t pt-4">
        {/* Navegacion "fluida" hacia la vista completa del modulo. */}
        <Button size="sm" onClick={handleOpenFullView}>
          Ver dashboard completo
          <ArrowUpRight className="h-4 w-4" />
        </Button>

        {/* Enlace externo al microservicio Astro, solo si hay URL. */}
        {homeLabAppUrl && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(homeLabAppUrl, '_blank', 'noopener')}
          >
            App HomeLab
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export default HomeLabMonitorWidget