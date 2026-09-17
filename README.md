# JAH Engine

Plataforma **open source** de observabilidad, benchmarking y resiliencia de infraestructura bajo arquitectura **DevOps**.

> **Propósito pedagógico:** todo el código está diseñado para aprender a fondo la sintaxis, la lógica de negocio y los patrones de arquitectura moderna en React, TypeScript y desarrollo de infraestructura. Cada archivo contiene comentarios explicativos en **español** que documentan el *qué* y el *por qué* de cada decisión.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript 6 + Vite 8 |
| Estilos | Tailwind CSS v3 + PostCSS + Autoprefixer |
| UI Kit | Shadcn UI (components locales en `src/components/ui`) |
| Graficas | Recharts (graficas en tiempo real del modulo Benchmark) |
| Router | React Router v7 |
| Tiempo real | WebSocket nativo del navegador (cliente hecho a mano) |
| Linter | oxlint (`npm run lint`) |

---

## Arquitectura del sistema

**JAH Engine** es un dashboard central que integra tres módulos más un punto de conexión externo:

1. **Dashboard Central (frontend):** React + TypeScript + Vite, Tailwind + Shadcn UI, WebSockets y visualización en tiempo real.
2. **Módulo 1 – Network & Hosts (widget HomeLab Monitor):**
   - Conexión con el microservicio independiente `HomeLab Monitor` (Astro).
   - Widget interactivo con latencia, disponibilidad y estado de hosts en tiempo real.
   - Navegación fluida hacia la app completa y retorno al dashboard.
   - En esta fase, los datos de telemetría provienen de un **mock local** o de la **API real** mediante `VITE_USE_MOCK_DATA`.
3. **Módulo 2 – Benchmark & Profiling:** formulario + motor de simulación que lanza pruebas de estrés HTTP y mide percentiles p50/p90/p95/p99, throughput, TTFB y tasa de éxito en tiempo real (gráfica Recharts). Incluye **Service Layer conmutable** (mock/API), **estado global** en `BenchmarkProvider` (compartido entre la vista `/benchmark` y el widget del dashboard) e **historial** de pruebas con alerta de error y reintento. *(Implementado en modo mock; listo para enchufar la API con `VITE_USE_MOCK_DATA=false`.)*
4. **Módulo 3 – Storage & Remote Backups:** orquestación de copias de seguridad cifradas en origen (AES-256) con sincronización remota vía Rclone/S3, bajo la **regla 3-2-1**. Incluye **Service Layer conmutable**, panel de KPIs, ejecución manual de jobs (*optimistic update*) y restauración de snapshots. *(Implementado en modo mock; listo para la API real.)*

---

## Estructura de carpetas

```text
src/
├── assets/                  # Recursos estáticos (imágenes, iconos, fuentes)
├── components/
│   ├── ui/                  # Componentes base de Shadcn (Card, Badge, Button)
│   ├── layout/              # DashboardLayout + Sidebar + Navbar + BackToDashboardButton
│   └── widgets/            # HomeLabMonitorWidget.tsx y BenchmarkWidget.tsx (miniaturas)
├── features/                # Arquitectura por características (feature-first)
│   ├── dashboard/           # Página raíz del dashboard + StorageBackupsWidget.tsx
│   ├── network/             # Módulo 1 – red (telemetría de HomeLab Monitor)
│   │   ├── mocks/           # telemetryMock.json (payload simulado)
│   │   ├── services/        # telemetryService.ts (Strategy Pattern)
│   │   ├── hooks/           # useTelemetry.ts (fetch + polling)
│   │   └── NetworkPage.tsx  # Vista completa /network
│   ├── benchmark/           # Módulo 2 – pruebas de estrés
│   │   ├── components/      # BenchmarkForm / BenchmarkChart / BenchmarkMetrics
│   │   ├── context/         # BenchmarkContext.ts + BenchmarkProvider.tsx (estado global)
│   │   ├── hooks/           # useBenchmark.ts (Promise + streaming + error)
│   │   ├── services/        # benchmarkService.ts (fachada) + mockBenchmarkEngine.ts
│   │   ├── types/           # benchmark.ts (contrato interno del módulo)
│   │   ├── utils/           # gradient.ts / latency.ts / progress.ts
│   │   └── BenchmarkPage.tsx
│   └── backups/             # Módulo 3 – respaldos cifrados
│       ├── services/        # backupService.ts (Repository) + mockBackupData.ts
│       ├── types/           # backup.ts
│       └── BackupsPage.tsx
├── hooks/                   # Hooks reutilizables (useWebSocket, useHomeLabWidget)
├── services/                # Cliente WebSocket + simulador de HomeLab
├── types/                   # Contratos de transporte (index.ts, telemetry.ts)
├── utils/                   # cn(), formateadores (ms, %, bytes, uptime, fechas)
├── App.tsx                  # Componente raíz, enrutado y provider global
├── main.tsx                 # Punto de entrada de React
└── index.css                # Tailwind + tokens de tema (light/dark)
```

---

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
Copy-Item .env.example .env     # (Windows PowerShell)
#   cp .env.example .env        # (Linux/macOS)

# 3. Arrancar el entorno de desarrollo
npm run dev                     # http://localhost:5173

# 4. Verificar tipos + bundle de producción
npm run build                   # tsc -b && vite build

# 5. Lint
npm run lint                    # oxlint
```

---

## Variables de entorno (`.env`)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_USE_MOCK_DATA` | `"true"` usa el mock local con latencia simulada; `"false"` llama a la API real. | `true` |
| `VITE_API_URL` | Endpoint REST de telemetría del microservicio HomeLab Monitor. | `https://homelab-monitor.acevedojavier.dev/api/v1/metrics/telemetry` |
| `VITE_API_KEY` | Clave de autenticación enviada en la cabecera `X-API-Key` (solo desarrollo local). | `tu_token_secreto_aqui` |
| `VITE_API_BASE_URL` | URL base de la API REST de Benchmark (Módulo 2) y Backups (Módulo 3); el servicio monta endpoints como `/benchmark/run` o `/backups/jobs` sobre este prefijo. | `http://localhost:3000/api` |
| `VITE_HOMELAB_WS_URL` | Endpoint WebSocket del microservicio (usa el simulador si está ausente). | `ws://localhost:4321/ws` |
| `VITE_HOMELAB_APP_URL` | URL pública de la app externa de HomeLab (activa el botón "App HomeLab"). | `https://homelab-monitor.acevedojavier.dev` |

> **Advertencia de seguridad:** en producción las claves deben gestionarse en el servidor, nunca en el bundle del navegador. Las variables `VITE_*` son visibles para cualquier cliente.

---

## Flujo de datos de telemetría (Módulo 1)

```text
HomeLab Monitor (Astro)  ──HTTP/WS──▶  telemetryService.ts
                                         │
              VITE_USE_MOCK_DATA === 'true'  ──▶ MockTelemetryStrategy (JSON + 400ms)
              VITE_USE_MOCK_DATA === 'false' ──▶ HttpTelemetryStrategy (fetch + X-API-Key)
                                         │
                                         ▼
                                    useTelemetry (hook)
                                         │   data / isLoading / error / refetch / polling
                                         ▼
                              HomeLabMonitorWidget (UI)
```

### Patrones implementados

- **Strategy Pattern** (`telemetryService.ts`): la abstracción `TelemetryStrategy` permite conmutar entre mock y API real sin tocar los hooks ni la UI. Las fuentes nuevas (p. ej. WebSocket) se añaden como otra estrategia. Cumple el **Principio Abierto/Cerrado**.
- **Service Layer / Repository** (`backupService.ts`, `benchmarkService.ts`): una única puerta de entrada que esconde el origen de los datos y devuelve siempre el mismo contrato tipado (`RemoteTarget[]`, `BenchmarkHistoryItem[]`...). Alternar mock/API es cambiar `VITE_USE_MOCK_DATA`, no el código; cada función es un punto de costura para logs, reintentos o auth. La UI **jamás** importa los mocks directamente.
- **Facade** (`benchmarkService.ts`): la página y el hook solo conocen esta fachada; el motor de simulación (`mockBenchmarkEngine`) y el error de cancelación se re-exportan desde aquí, de modo que nadie acopla con los detalles internos.
- **Context + Provider** (`BenchmarkContext` + `BenchmarkProvider`): `useBenchmark` se monta **una sola vez** en la raíz, así una prueba iniciada en `/benchmark` sigue viva y visible en el widget del dashboard.
- **Custom hooks** (`useTelemetry`, `useWebSocket`, `useHomeLabWidget`, `useBenchmark`): encapsulan ciclos de vida de datos (fetch, polling, streaming, reconexión, limpieza con `AbortController`), separando la UI de los efectos secundarios.
- **Contratos de datos** (`src/types/telemetry.ts` y `features/*/types`): tipos estrictos que reflejan el JSON del backend 1:1 (se usa `snake_case` deliberadamente para no añadir capas de traducción). Los contratos internos de cada feature se mantienen junto a su módulo.
- **Servicio de transporte** (`src/services/websocket.ts`): cliente WebSocket con reconexión exponencial + jitter y heartbeat.
- **Optimistic update** (`BackupsPage`): "Ejecutar Ahora" marca el job como `running` de inmediato y lo sustituye al resolver la Promise; si falla, lo revierte a `failed`.

---

## Capa de servicio conmutable (Módulos 2 y 3)

Los módulos de Benchmark y Backups comparten el mismo patrón que el Módulo 1: una bandera de entorno decide entre mocks locales y API real, y la UI ni se enteran.

```text
BenchmarkPage / BenchmarkWidget ──▶ benchmarkService.ts ──┐
BackupsPage  / StorageBackupsWidget ─▶ backupService.ts ──┤
                                                          │  VITE_USE_MOCK_DATA === 'true'
                                            ┌─────────────┴─────────────┐
                                            ▼                           ▼
                             mockBenchmarkEngine.ts            fetch(VITE_API_BASE_URL)
                             mockBenchmarkHistory.ts           /benchmark/run · /benchmark/history
                             mockBackupData.ts                 /backups/targets · /backups/jobs
                                                               /backups/snapshots · ...
```

- **Benchmark:** `runBenchmarkTest(config, onProgress)` simula peticiones HTTP (~2.5 s) y **transmite** el resultado acumulado en cada tick (500 ms) vía callback para pintar la gráfica en vivo; `cancelBenchmark()` permite abortar (`BenchmarkAbortError`). El historial se lee con `getBenchmarkHistory()`.
- **Backups:** `getRemoteTargets()` / `getBackupJobs()` / `getSnapshots()` se piden en paralelo con `Promise.all`; `runBackupJob()` y `restoreSnapshot()` modelan las acciones de escritura.
- **Latencia artificial** (~300 ms, salvo la simulación de carga del benchmark): garantiza que los estados de *loading* sean perceptibles y se prueben de verdad antes de conectar el backend.

---

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Dashboard (rejilla responsiva + widgets + rutas) | ✔ Implementado |
| HomeLab Monitor – widget en vivo | ✔ Implementado (mock + API real conmutables) |
| HomeLab Monitor – vista completa `/network` | ✔ Implementado (esqueleto WebSocket) |
| Benchmark & Profiling – motor, gráfica e historial | ✔ Implementado (mock conmutable; API pendiente) |
| Benchmark & Profiling – estado global compartido | ✔ Implementado (Context + Provider) |
| Storage & Backups – destinos, jobs y snapshots | ✔ Implementado (mock conmutable; API pendiente) |
| Backend real de los Módulos 2 y 3 | 🚧 Pendiente (UI lista tras `VITE_USE_MOCK_DATA=false`) |

---

## Aprendizajes clave incorporados

- **`erasableSyntaxOnly`** (TS 6): no se usan `enum` ni *parameter properties*; se prefieren uniones de strings.
- **`verbatimModuleSyntax`**: los imports de tipos usan `import type`.
- **Patterns de React**: react-compiler-friendly (sin setState síncrono dentro de efectos; refs fuera del render). La excepción documentada es el *fetch on mount*, anotada con `oxlint-disable-next-line react/set-state-in-effect`.
- **Config por entorno**: la app funciona por completo en modo mock sin backend; conmutar a la API real es cambiar `VITE_USE_MOCK_DATA` y reiniciar Vite.
- **CSS Grid en el Dashboard**: `items-stretch` + `h-full flex flex-col` en las tarjetas iguala la altura de las tarjetas hermanas; los *empty states* con "gráfica fantasma" evitan huecos y *layout shift*.
- **Design tokens**: los colores de Shadcn se definen como variables CSS HSL en `index.css` y se consumen desde `tailwind.config.js`.