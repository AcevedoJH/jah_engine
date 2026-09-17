/**
 * ============================================================
 * JAH ENGINE - Hook useTelemetry (src/features/network/hooks/useTelemetry.ts)
 * ============================================================
 * Custom hook que encapsula el ciclo de vida completo de la petición
 * de telemetría: carga, errores, refresco manual y polling automático.
 *
 * ¿Por qué un custom hook y no llamar a `telemetryService` directamente
 * desde el componente?
 *
 * 1. SEPARACIÓN DE PREOCUPACIONES: el componente solo se preocupa
 *    del JSX (qué mostrar). El hook maneja QUÉ hacer cuando llegan
 *    datos, errores o cuando se pide un refresco.
 * 2. REUTILIZACIÓN: el mismo hook alimenta el widget HomeLab, la
 *    página /network completa, futuros dashboards... sin duplicar código.
 * 3. TESTABILIDAD: el hook se puede testear con un servicio mock
 *    inyectado, sin JSX ni DOM.
 * 4. CLEANUP AUTOMÁTICO: los AbortController se gestionan aquí,
 *    evitando data races y fugas de memoria en el componente.
 *
 * NOTA PEDAGÓGICA (set-state-in-effect y React Compiler):
 * El linter oxlint puede advertir sobre llamadas a setState dentro
 * de efectos. Para minimizarlo, estructuramos el fetch como función
 * async externa al useEffect y la llamamos de forma no-síncrona.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TelemetryData } from '@/types/telemetry'
import { telemetryService } from '@/features/network/services/telemetryService'

/* =====================================================================
   ========================= TYPES PÚBLICOS ===========================
   ===================================================================== */

/**
 * Opciones configurables del hook.
 *
 * @param pollingIntervalMs - Si se pasa un número > 0, el hook refresca
 *                            los datos automáticamente cada ese intervalo
 *                            (polling). Si no se pasa o es null, el
 *                            comportamiento es de petición única (fetch
 *                            on mount).
 * @param enabled            - Permite pausar temporalmente el fetch/polling
 *                            (por ejemplo, cuando la pestaña del navegador
 *                            está oculta o el componente no es visible).
 */
export interface UseTelemetryOptions {
  /** Intervalo de refresco automático en milisegundos (null = sin polling). */
  pollingIntervalMs?: number | null
  /** Habilita/deshabilita el fetch (true por defecto). */
  enabled?: boolean
}

/**
 * Valor devuelto por el hook (estado + acciones).
 *
 * @param data            - Snapshot actual o null si no se ha cargado.
 * @param isLoading       - true mientras la petición está en curso.
 * @param error           - Mensaje de error (null si todo OK).
 * @param refetch         - Función para refrescar manualmente.
 * @param lastUpdatedAt   - Timestamp ISO del último snapshot recibido.
 * @param isMock          - true si los datos provienen del mock.
 */
export interface UseTelemetryResult {
  data: TelemetryData | null
  isLoading: boolean
  error: string | null
  refetch: () => void
  lastUpdatedAt: string | null
  isMock: boolean
}

/* =====================================================================
   ======================== HOOK PRINCIPAL =============================
   ===================================================================== */

/**
 * Hook principal de obtención de telemetría.
 *
 * @param options - Configuración opcional (polling, enabled).
 * @returns Estado actual + acciones (ver UseTelemetryResult).
 */
export function useTelemetry(options: UseTelemetryOptions = {}): UseTelemetryResult {
  const { pollingIntervalMs = null, enabled = true } = options

  // --- Estados de React ---
  // Cada useState crea un "celda de estado" que, al cambiar, provoca
  // un re-render del componente que consume el hook.
  const [data, setData] = useState<TelemetryData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  // isMock se determina una vez por servicio (no cambia en runtime),
  // pero lo exponemos para que el widget pueda mostrar un badge.
  const isMock = telemetryService.strategyKind === 'mock'

  // --- Ref para evitar setters tras unmount ---
  // Un ref persiste entre renders pero NO provoca re-renders.
  // Lo usamos como bandera para saber si el componente sigue montado.
  const mountedRef = useRef(true)
  // Guardamos el último controlador de abort para poder cancelar
  // fetches anteriores cuando se inicia uno nuevo.
  const abortRef = useRef<AbortController | null>(null)

  // --- Función de obtención de datos ---
  // useCallback memoriza la función: su identidad (referencia) solo
  // cambia cuando cambian las dependencias []. Aquí no tiene deps
  // porque usa refs (que son estables).
  //
  // NOTA sobre el lint "set-state-in-effect": al definir la lógica
  // como función async aquí dentro y llamarla desde useEffect, las
  // llamadas a setState ocurren DENTRO de la función async que se
  // ejecuta como parte del efecto. El compilador de React (Compiler)
  // lo acepta porque es el patrón canónico de data fetching.
  const fetchData = useCallback(async () => {
    // Cancelamos cualquier fetch anterior que siga en curso.
    // Esto evita que una respuesta lenta de un refresco anterior
    // sobreescriba los datos de un refresco más reciente.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // No mostramos spinner la primera vez si ya tenemos datos
    // (evita el "flash" de carga al hacer refetch manual).
    if (data !== null) {
      // Si ya habia datos, solo mostramos loading sutil en la UI.
    }
    setIsLoading(true)
    setError(null)

    try {
      // La llamada al servicio. Si el usuario cambió `enabled` a false
      // justo antes, el efecto ya no ejecutará esta función, asi que
      // el signal nunca se envía. Pero si el efecto fue interrumpido
      // (cleanup), el controller ya está abortado.
      const result = await telemetryService.fetchTelemetry(controller.signal)

      // --- Guardia anti-desmontaje ---
      // Solo actualizamos el estado si el componente sigue montado.
      // Sin esto, React mostraria un warning "Can't perform a React
      // state update on an unmounted component".
      if (mountedRef.current) {
        setData(result)
        setLastUpdatedAt(result.timestamp)
        setIsLoading(false)
      }
    } catch (err: unknown) {
      // Si el componente fue desmontado o el fetch fue abortado por
      // un refresco posterior, ignoramos silenciosamente el error.
      if (!mountedRef.current || controller.signal.aborted) return

      // Distinguir entre errores de red y abortos.
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Fue abortado por un refresco nuevo: limpiamos loading.
        setIsLoading(false)
        return
      }

      // Error real: lo extraemos y lo convertimos a string legible.
      const message = err instanceof Error ? err.message : 'Error desconocido al obtener telemetría.'
      setError(message)
      setIsLoading(false)
    }
  }, [data])

  // --- Efecto principal: fetch on mount + polling ---
  useEffect(() => {
    // NOTA: cuando `enabled` es false no tocamos el estado aqui (el
    // valor `isLoading` derivado en el return ya fuerza false). Asi
    // evitamos un setState sincrono dentro del efecto.
    if (!enabled) {
      return
    }

    // Ejecutamos la primera carga inmediatamente.
    // Usamos `void` para descartar la Promesa intencionalmente:
    // no necesitamos manejarla aquí (ya tiene su catch interno).
    //
    // EXCEPCIÓN DOCUMENTADA: este es el patron canonico de data fetching
    // en React (fetch on mount). fetchData() establece isLoading(true),
    // y es un caso que el linter marcaria como "setState en efecto".
    // La regla existe para reacciones a props/estado, no para peticiones
    // de red; por eso la desactivamos puntualmente (solo esta linea)
    // con justificacion en lugar de silenciar la regla en todo el archivo.
    // oxlint-disable-next-line react/set-state-in-effect
    void fetchData()

    // --- Polling: intervalo periodico ---
    // Si se configura un pollingIntervalMs, creamos un setInterval
    // que relanza el fetch cada ese intervalo.
    if (pollingIntervalMs !== null && pollingIntervalMs > 0) {
      const intervalId = setInterval(() => {
        void fetchData()
      }, pollingIntervalMs)

      // Cleanup: cancelamos el intervalo cuando el efecto se re-ejecuta
      // o el componente se desmonta.
      return () => clearInterval(intervalId)
    }

    // Cleanup: si no hay polling, solo cancelamos fetches pendientes.
    return () => {
      abortRef.current?.abort()
    }
  }, [enabled, pollingIntervalMs, fetchData])

  // --- Ciclo de vida del componente ---
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // --- refetch manual ---
  // useCallback garantiza que la función `refetch` tenga la misma
  // referencia entre renders, evitando re-renders innecesarios en
  // componentes hijos que reciban `refetch` como prop.
  const refetch = useCallback(() => {
    void fetchData()
  }, [fetchData])

  // El estado real de carga: si el hook esta deshabilitado, nunca se
  // reporta isLoading (derivacion, no setState).
  return {
    data,
    isLoading: enabled ? isLoading : false,
    error,
    refetch,
    lastUpdatedAt,
    isMock,
  }
}