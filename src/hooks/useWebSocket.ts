/**
 * ============================================================
 * JAH ENGINE - Hook useWebSocket (src/hooks/useWebSocket.ts)
 * ============================================================
 * Puente entre la clase imperativa RealtimeSocket y el mundo
 * DECLARATIVO de React.
 *
 * ¿Por qué necesitamos un hook?
 * React no entiende de "objetos con estado interno cambiando por
 * detras"; solo re-renderiza cuando cambia un ESTADO de React.
 * Este hook:
 *   1. Crea UNA instancia de RealtimeSocket por URL (no en cada render).
 *   2. Se suscribe a sus eventos y los deposita en useState -> provoca renders.
 *   3. Conecta al montar y desconecta al desmontar (evita fugas).
 *   4. Expone `send` estable (useCallback) para enviar mensajes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectionStatus, RealtimeEnvelope } from '@/types'
import { RealtimeSocket } from '@/services/websocket'

/** Opciones de configuracion del hook. */
export interface UseWebSocketOptions {
  /** Si es false, el hook queda inerte (util en tests o feature flags). */
  enabled?: boolean
  /**
   * Callback invocado con CADA mensaje recibido.
   *
   * Es el patron recomendado para REACCIONAR a eventos externos:
   * actualizar estado dentro de un callback de evento (no dentro de
   * un useEffect) evita renders en cascada y es mas predecible.
   */
  onMessage?: (message: unknown) => void
}

/** Valor devuelto por el hook, listo para la UI. */
export interface UseWebSocketResult {
  /** Estado de la conexion (para indicadores "EN VIVO"). */
  status: ConnectionStatus
  /** Ultimo mensaje recibido (sin tipar; filtrar con type guards). */
  lastMessage: unknown | null
  /** Envia un envelope tipado. Devuelve false si el canal no esta abierto. */
  send: <T>(envelope: RealtimeEnvelope<T>) => boolean
}

/**
 * Hook de conexion WebSocket con reconexion automatica.
 *
 * @param url     - Endpoint WebSocket; si es undefined/vacio no conecta.
 * @param options - Configuracion extra (habilitado + callback de mensajes).
 * @returns Estado de conexion, ultimo mensaje y funcion send.
 */
export function useWebSocket(
  url: string | undefined,
  options: UseWebSocketOptions = {},
): UseWebSocketResult {
  const { enabled = true } = options

  // Estado de React: al cambiar disparan re-render del componente.
  const [status, setStatus] = useState<ConnectionStatus>(
    url && enabled ? 'connecting' : 'disconnected',
  )
  const [lastMessage, setLastMessage] = useState<unknown | null>(null)

  // useRef: referencia mutable que NO provoca renders. Aqui guardamos
  // la instancia del socket para poder enviar mensajes fuera del efecto.
  const socketRef = useRef<RealtimeSocket | null>(null)

  // Guardamos el ultimo callback en una ref. ¿Por qué? Porque el efecto
  // de conexion no debe re-ejecutarse cuando el consumidor crea una
  // funcion nueva en cada render; con la ref siempre invocamos el ultimo.
  const onMessageRef = useRef(options.onMessage)
  useEffect(() => {
    onMessageRef.current = options.onMessage
  }, [options.onMessage])

  // --- Efecto de ciclo de vida de la conexion -------------------
  // Se re-ejecuta si cambia `url` o `enabled`.
  useEffect(() => {
    // Sin URL o deshabilitado: no creamos nada. (El estado 'disconnected'
    // se DERIVA en el return, no se asigna aqui, para evitar renders en
    // cascada dentro del efecto.)
    if (!url || !enabled) {
      return
    }

    const socket = new RealtimeSocket(url, {
      autoReconnect: true,
      // Reintento agresivo al principio: la red local se recupera rapido.
      reconnectBaseMs: 1_000,
      reconnectMaxMs: 20_000,
    })
    socketRef.current = socket

    // Suscribimos los eventos y guardamos las funciones de baja
    // (unsubscribe) para invocarlas en el cleanup.
    const unsubscribeStatus = socket.onStatusChange(setStatus)
    const unsubscribeMessage = socket.onMessage((message) => {
      // setState dentro del callback del socket: es un evento externo,
      // no un setState sincrono dentro del efecto.
      setLastMessage(message)
      // Avisamos al consumidor (si definio onMessage).
      onMessageRef.current?.(message)
    })

    // Abrimos el canal.
    socket.connect()

    // CLEANUP: React lo llama al desmontar o antes de re-ejecutar el
    // efecto. Garantiza que no dejamos conexiones ni listeners "colgando".
    return () => {
      unsubscribeStatus()
      unsubscribeMessage()
      socket.disconnect()
      socketRef.current = null
    }
  }, [url, enabled])

  // --- Funcion de envio estable --------------------------------
  // useCallback memoriza la funcion: su identidad no cambia entre
  // renders (si no fuera asi, los hijos que la reciban se re-renderizarian
  // innecesariamente). Dependencias [] = se crea una sola vez.
  const send = useCallback(<T,>(envelope: RealtimeEnvelope<T>) => {
    // Optional chaining: si no hay socket, devolvemos false.
    return socketRef.current?.send(envelope) ?? false
  }, [])

  // Deriva el estado a mostrar: si no hay conexion habilitada, siempre
  // 'disconnected' (evita depender de un setState dentro del efecto).
  const effectiveStatus: ConnectionStatus = !url || !enabled ? 'disconnected' : status

  return { status: effectiveStatus, lastMessage, send }
}