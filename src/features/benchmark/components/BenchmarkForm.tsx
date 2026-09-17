/**
 * ============================================================
 * JAH ENGINE - BenchmarkForm (src/features/benchmark/components/BenchmarkForm.tsx)
 * ============================================================
 * Componente FORMULARIO del Módulo Benchmark: permite al usuario
 * configurar los parámetros de una prueba de carga HTTP antes de
 * lanzarla.
 *
 * ¿Qué responsabilidad tiene (y cuál NO)?
 * Este componente es "de presentación pura". Su ÚNICA misión es:
 *   1. Capturar las preferencias del usuario en un estado local.
 *   2. Validarlas mínimamente.
 *   3. Emitir la configuración validada hacia ARRIBA mediante el
 *      callback `onSubmit`.
 *
 * NO conoce al servicio de simulación ni al hook useBenchmark:
 * esa orquestación la decide el padre (BenchmarkPage). Esta
 * separación (componente "tonto" vs. contenedor) mantiene el
 * formulario reutilizable y fácil de testear.
 *
 * PALETA DE COLOR (importante):
 * El proyecto NO usa colores fijos tipo `slate-*`: usa DESIGN TOKENS
 * de Shadcn UI (variables CSS definidas en src/index.css y mapeadas
 * en tailwind.config.js). Clases como `bg-background`, `border-input`,
 * `text-foreground` o `text-muted-foreground` cambian automáticamente
 * entre tema claro y oscuro. Usarlas garantiza que el formulario se
 * vea coherente con el resto del dashboard.
 */

import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import type { BenchmarkConfig, BenchmarkHttpMethod } from '../types/benchmark'

/* =====================================================================
   ============================ PROPS ===================================
   ===================================================================== */

/**
 * Contrato de props que el componente padre debe proveer.
 *
 * @param onSubmit - Callback invocado ÚNICAMENTE cuando el formulario
 *                   pasa la validación. Recibe la configuración ya
 *                   tipada: el padre decide qué hacer con ella (p. ej.
 *                   pasársela a `useBenchmark().startTest(config)`).
 * @param isRunning- Indica si hay una prueba en curso. No es un estado
 *                   interno: lo decide el padre (source of truth única),
 *                   así el formulario se sincroniza con el motor aunque
 *                   el cambio venga de otro componente.
 * @param onCancel - Callback opcional para DETENER una prueba activa.
 *                   Solo tiene sentido cuando isRunning === true; por
 *                   eso el botón principal cambia de rol según estado.
 */
export interface BenchmarkFormProps {
  onSubmit: (config: BenchmarkConfig) => void
  isRunning: boolean
  onCancel?: () => void
}

/* =====================================================================
   ======================= ESTADO INICIAL ==============================
   ===================================================================== */

/**
 * Configuración por defecto del formulario.
 *
 * ¿Por qué el componente tiene su PROPIO estado si el padre también
 * maneja la configuración? Porque son dos flujos distintos:
 *   - Aquí el usuario EDITA un borrador (lo que ve en los inputs).
 *   - El padre guarda la configuración EFECTIVA (la que se ejecuta).
 * Estos valores por defecto son "razonables": una URL de ejemplo de
 * health-check, GET, 10 peticiones concurrentes, 100 en total y un
 * timeout de 5 segundos.
 */
const DEFAULT_FORM_CONFIG: BenchmarkConfig = {
  targetUrl: 'https://api.example.com/v1/health',
  method: 'GET',
  concurrency: 10,
  totalRequests: 100,
  timeoutMs: 5000,
}

/**
 * Lista tipada de métodos HTTP para el <select>.
 * Se declara como `readonly` para evitar mutaciones accidentales y
 * con tipo `BenchmarkHttpMethod[]` para que el .map() sea seguro:
 * si mañana añadimos PATCH, TypeScript nos obligará a decidir si es
 * un método válido de BenchmarkConfig o no.
 */
const HTTP_METHODS: readonly BenchmarkHttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE']

/* =====================================================================
   ========================= COMPONENTE =================================
   ===================================================================== */

/**
 * Formulario de configuración de una prueba de estrés.
 *
 * @param props - Ver BenchmarkFormProps.
 *               - onSubmit : entrega la config validada al padre.
 *               - isRunning: desactiva los controles y cambia el botón.
 *               - onCancel : detiene la prueba cuando está activa.
 */
export function BenchmarkForm({ onSubmit, isRunning, onCancel }: BenchmarkFormProps) {
  /* --------------------------------------------------------------------
     ESTADO LOCAL (useState)
     --------------------------------------------------------------------
     Un único objeto `config` tipado como BenchmarkConfig agrupa las
     cinco preferencias del usuario. Ventajas frente a cinco useStates
     separados:
       1. Una sola fuente de verdad para el formulario.
       2. Es la MISMA forma que recibe `onSubmit`, así no hay que
          ensamblar el objeto al enviar.
       3. Cada update crea una copia nueva del objeto (los objetos de
          estado son inmutables en React): nunca mutamos el anterior,
          siempre reemplazamos con uno nuevo.
  */
  const [config, setConfig] = useState<BenchmarkConfig>(DEFAULT_FORM_CONFIG)

  /* --------------------------------------------------------------------
     Campo de error de VALIDACIÓN de negocio (no de HTML)
     --------------------------------------------------------------------
     El navegador ya valida el formato URL (input type="url") y el
     mínimo (input type="number" min). Pero hay UNA regla de negocio
     que el HTML no conoce: la concurrencia no puede superar el total
     de peticiones. La mostramos aquí como texto de ayuda en rojo
     usando el token `--destructive` del tema.
  */
  const [validationError, setValidationError] = useState<string | null>(null)

  /**
   * Actualiza UN campo del objeto config manteniendo el resto intactos.
   *
   * ¿Por qué la firma usa un parámetro genérico `K`?
   * `K extends keyof BenchmarkConfig` garantiza en tiempo de compilación
   * que solo podamos actualizar claves que REALMENTE existen en la
   * config, y que el nuevo valor tenga el tipo correcto de esa clave.
   * Por ejemplo: updateConfig('method', 'GET') compila, pero
   * updateConfig('concurrency', 'diez') daría error de tipos.
   *
   * `setConfig(prev => ({...prev, [key]: value}))` crea un NUEVO objeto
   * (spread) con la clave modificada. Como creamos copia, React detecta
   * el cambio de referencia y re-renderiza.
   *
   * @param key  - Cuál de las 5 claves de BenchmarkConfig actualizar.
   * @param value- Nuevo valor, tipado según la clave objetivo.
   */
  function updateConfig<K extends keyof BenchmarkConfig>(key: K, value: BenchmarkConfig[K]): void {
    setConfig((prev) => ({ ...prev, [key]: value }))

    // Al modificar valores, un posible error de validación anterior
    // queda obsoleto: lo limpiamos para no mostrar mensajes fantasma.
    setValidationError(null)
  }

  /**
   * Handler del evento de ENVÍO del formulario.
   *
   * ¿Por qué tipar el evento como `FormEvent<HTMLFormElement>`?
   * En React, el evento está "sintetizado" (SyntheticEvent) y se
   * tipa por el elemento que lo dispara. Al tipar el evento, TypeScript
   * nos autocompleta `.preventDefault()` y `.currentTarget` con
   * seguridad; además, asignar un handler mal tipado a <form onSubmit>
   * produciría error de compilación.
   *
   * `e.preventDefault()` es IMPRESCINDIBLE: sin él, al pulsar el botón
   * "submit" el navegador recargaría la página (comportamiento HTML
   * nativo), perdiendo el estado de la SPA.
   *
   * @param event - Evento de submit tipado del elemento form.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    // --- Validación de negocio del formulario ---
    // Regla del Módulo Benchmark: no se puede simular más concurrencia
    // que peticiones totales (no tendría sentido lanzar 50 peticiones
    // simultáneas si solo hay 10 en total). La validamos ANTES de
    // notificar al padre.
    if (config.concurrency > config.totalRequests) {
      setValidationError(
        'La concurrencia (' + config.concurrency + ') no puede superar el total de peticiones (' + config.totalRequests + ').',
      )
      // Abortamos: NO se emite onSubmit con datos inválidos.
      return
    }

    // Datos válidos: dejamos constancia de que no hay error y emitimos
    // la configuración hacia el padre, que decidirá qué hacer.
    setValidationError(null)
    onSubmit(config)
  }

  /* --------------------------------------------------------------------
     Classes CSS de los inputs (tokens del tema, NO colores fijos)
     --------------------------------------------------------------------
     - `border-input` / `bg-background`: fondo y borde del tema actual.
     - `text-foreground` / `placeholder:text-muted-foreground`: texto y
       placeholder con los tokens semánticos.
     - `focus:ring-ring`: el anillo de foco usa el color primario del
       motor (índigo), coherente con el resto de componentes.
     - `disabled:*`: refuerza que el control no es interactivo durante
       la prueba.
  */
  const inputClasses = [
    'w-full rounded-md border border-input bg-background px-3 py-2',
    'text-sm text-foreground placeholder:text-muted-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring',
    'disabled:cursor-not-allowed disabled:opacity-50',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* ======================================================
          1) MÉTODO HTTP + URL OBJETIVO
         ======================================================
         Ambos campos describen "a QUIÉN y CON QUÉ verbo" atacamos.
         El select limita los verbos a los 4 permitidos por el tipo
         BenchmarkHttpMethod; el input de tipo url activa la
         validación nativa de formato URL del navegador. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1.5">
          <label htmlFor="benchmark-method" className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Método HTTP
          </label>
          <select
            id="benchmark-method"
            value={config.method}
            disabled={isRunning}
            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
              updateConfig('method', event.target.value as BenchmarkHttpMethod)
            }
            className={inputClasses}
          >
            {HTTP_METHODS.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="benchmark-url" className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            URL Objetivo
          </label>
          <input
            id="benchmark-url"
            type="url"
            placeholder="https://api.example.com/v1/health"
            value={config.targetUrl}
            disabled={isRunning}
            onChange={(event: ChangeEvent<HTMLInputElement>) => updateConfig('targetUrl', event.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      {/* ======================================================
          2) CONTROL DESLIZANTE DE CONCURRENCIA
         ======================================================
         Un range (1 a 100) es el control ideal para una magnitud
         con rango "visual". `value` muestra el número en vivo; el
         atributo `min`/`max` garantiza que el motor nunca reciba
         valores fuera de ese intervalo. */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="benchmark-concurrency" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Concurrencia
          </label>
          {/* El valor dinámico: cambia en cada arrastre del slider.
              `bg-muted` es el token de fondo secundario del tema. */}
          <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold text-foreground">
            {config.concurrency}
          </span>
        </div>
        <input
          id="benchmark-concurrency"
          type="range"
          min={1}
          max={100}
          value={config.concurrency}
          disabled={isRunning}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateConfig('concurrency', Number(event.target.value))
          }
          // accent del tema: usamos el token primario del motor.
          className="w-full accent-primary"
        />
        <div className="flex justify-between pl-1 text-[10px] text-muted-foreground">
          <span>1</span>
          <span>100</span>
        </div>
      </div>

      {/* ======================================================
          3) TOTAL DE PETICIONES
         ======================================================
         Input numérico con mínimo 10. Convertimos el string del
         evento a number con Number() porque HTMLInputElement.value
         SIEMPRE es string, aunque el input sea type="number". */}
      <div className="space-y-1.5">
        <label htmlFor="benchmark-total" className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Total de Peticiones
        </label>
        <input
          id="benchmark-total"
          type="number"
          min={10}
          value={config.totalRequests}
          disabled={isRunning}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateConfig('totalRequests', Number(event.target.value))
          }
          className={inputClasses}
        />
        <p className="pl-1 text-[11px] text-muted-foreground">Mínimo 10 peticiones por prueba.</p>
      </div>

      {/* ======================================================
          4) TIMEOUT POR PETICIÓN
         ======================================================
         Tiempo máximo de espera en ms. Guardamos un valor numérico
         (milisegundos) pero lo mostramos en ms con una etiqueta
         aclaratoria. */}
      <div className="space-y-1.5">
        <label htmlFor="benchmark-timeout" className="pl-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Timeout por Petición (ms)
        </label>
        <input
          id="benchmark-timeout"
          type="number"
          min={100}
          step={100}
          value={config.timeoutMs}
          disabled={isRunning}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            updateConfig('timeoutMs', Number(event.target.value))
          }
          className={inputClasses}
        />
      </div>

      {/* ======================================================
          VALIDACIÓN DE NEGOCIO (mensaje en rojo destructivo)
         ======================================================
         Solo se pinta si existe un error de validación. En React
         "todo es condicional": <p> solo monta si la condición es
         verdadera, evitando retoques de display:none.
         Usamos `border-destructive` / `bg-destructive/10` /
         `text-destructive`: los tokens semánticos de error, igual
         que el widget de HomeLab. */}
      {validationError !== null && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError}
        </p>
      )}

      {/* ======================================================
          BOTÓN PRINCIPAL: DOBLE ROL según isRunning
         ======================================================
         Este es el corazón del comportamiento condicional:
           - isRunning === false -> "Iniciar Benchmark" (emerald,
             color de acción positiva del proyecto: Badge success usa
             bg-emerald-500), submit normal -> handleSubmit -> onSubmit.
           - isRunning === true  -> "Detener Prueba" (rose/destructive),
             y el clic se conecta a onCancel en lugar del submit.
         ¿Por qué convertir en DETENER en lugar de dejar el botón
         deshabilitado? Porque detener a mitad de test es una acción
         válida que el usuario debe poder ejecutar. Además, al cambiar
         el texto y color, el estado de ejecución se comunica de forma
         inequívoca. */}
      {isRunning ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-md bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-500"
        >
          Detener Prueba
        </button>
      ) : (
        <button
          type="submit"
          className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          Iniciar Benchmark
        </button>
      )}
    </form>
  )
}

export default BenchmarkForm