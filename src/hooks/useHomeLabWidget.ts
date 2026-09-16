/**
 * ============================================================
 * JAH ENGINE - Hook useHomeLabWidget (src/hooks/useHomeLabWidget.ts)
 * ============================================================
 * Hook de dominio (no generico) que alimenta el widget del Modulo 1.
 *
 * Estrategia de datos "hybrid fallback":
 *  1. Intenta conectar al WebSocket real de HomeLab Monitor (Astro).
 *  2. En paralelo arranca un SIMULADOR local con la misma forma de datos.
 *  3. Si llega un snapshot REAL, el simulador deja de publicar y el
 *     widget marca `isSimulated = false`.
 *  4. Si nunca llega (microservicio apagado), seguimos con simulacion.
 *
 * Esta tecnica permite que el dashboard SIEMPRE tenga datos (resiliencia
 * de demo) y a la vez ejercite el camino real de produccion.
 */

import { useEffect, useRef, useState } from 'react'
import type { ConnectionStatus, HomeLabSnapshot } from '@/types'
import { HomeLabSimulator } from '@/services/homeLabSimulator'
import { isEnvelopeOfType } from '@/services/websocket'
import { useWebSocket } from '@/hooks/useWebSocket'

/** Estado que expone el hook al componente del widget. */
export interface HomeLabWidgetState {
  /** Ultimo snapshot de HomeLab (real o simulado). */
  snapshot: HomeLabSnapshot | null
  /** Estado de la conexion WebSocket real. */
  connection: ConnectionStatus
  /** true si los datos provienen del simulador local. */
  isSimulated: boolean
}

/**
 * @param wsUrl - URL del WebSocket. Si se omite, se lee de la variable
 *                de entorno `VITE_HOMELAB_WS_URL` (definida en .env).
 * @returns Estado consolidado para pintar el widget.
 */
export function useHomeLabWidget(wsUrl?: string): HomeLabWidgetState {
  // Prioridad: argumento explicito > variable de entorno > undefined.
  const resolvedUrl =
    wsUrl ?? (import.meta.env['VITE_HOMELAB_WS_URL'] as string | undefined)

  const [snapshot, setSnapshot] = useState<HomeLabSnapshot | null>(null)

  // Estado que indica si seguimos con datos simulados. Empieza en true
  // y SOLO pasa a false cuando llega el primer snapshot real.
  const [isSimulated, setIsSimulated] = useState(true)

  // Bandera (ref) para saber si ya recibimos datos reales. Usamos useRef
  // porque se consulta dentro de callbacks (simulador) y NO debe, por si
  // misma, provocar un render.
  const hasRealDataRef = useRef(false)

  // Reutilizamos el hook generico para toda la logica de conexion.
  // Le pasamos `onMessage`: reaccionamos a los mensajes reales DESDE el
  // callback del socket (patron recomendado para eventos externos).
  const { status } = useWebSocket(resolvedUrl, {
    onMessage: (message) => {
      // Envolvemos el mensaje y comprobamos el tipo en runtime.
      // El type guard "estrecha" el tipo: `message` pasa a ser
      // RealtimeEnvelope<HomeLabSnapshot> y su payload queda tipado.
      if (isEnvelopeOfType<HomeLabSnapshot>(message, 'homeLab.snapshot')) {
        hasRealDataRef.current = true
        setIsSimulated(false)
        setSnapshot(message.payload)
      }
    },
  })

  // --- Efecto: simulador local ----------------------------------
  // Arranca al montar. Su callback SOLO publica mientras no haya datos
  // reales; asi, si el WebSocket real conecta, el simulador "cede" el rol.
  useEffect(() => {
    const simulator = new HomeLabSimulator((simulatedSnapshot) => {
      if (!hasRealDataRef.current) {
        setSnapshot(simulatedSnapshot)
      }
    })
    simulator.start()

    // Cleanup: detenemos el intervalo al desmontar.
    return () => simulator.stop()
  }, [])

  return { snapshot, connection: status, isSimulated }
}