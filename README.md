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
| Graficas | Recharts (instalado, listo para módulos 2 y 3) |
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
3. **Módulo 2 – Benchmark & Profiling:** motor para lanzar pruebas de estrés HTTP/código, midiendo percentiles p95/p99, throughput y uso de recursos (CPU, RAM). *(En construcción – página esqueleto ya enrutada.)*
4. **Módulo 3 – Storage & Remote Backups:** orquestación de copias de seguridad cifradas en origen (AES-256) con sincronización remota mediante Rclone/S3. *(En construcción – página esqueleto ya enrutada.)*

---

## Estructura de carpetas

```text
src/
├── assets/                  # Recursos estáticos (imágenes, iconos, fuentes)
├── components/
│   ├── ui/                  # Componentes base de Shadcn (Card, Badge, Button)
│   ├── layout/              # Sidebar + DashboardLayout (Outlet del router)
│   └── widgets/             # HomeLabMonitorWidget.tsx (miniatura interactiva)
├── features/                # Arquitectura por características
│   ├── dashboard/           # Página raíz del dashboard
│   ├── network/             # Módulo de red (telemetría)
│   │   ├── mocks/           # telemetryMock.json (payload simulado)
│   │   ├── services/        # telemetryService.ts (Strategy Pattern)
│   │   └── hooks/           # useTelemetry.ts (fetch + polling)
│   ├── benchmark/           # Módulo de pruebas de estrés (esqueleto)
│   └── backups/             # Módulo de respaldos cifrados (esqueleto)
├── hooks/                   # Hooks reutilizables (useWebSocket, useHomeLabWidget)
├── services/                # Cliente WebSocket + simulador de HomeLab
├── types/                   # Contratos de datos (index.ts, telemetry.ts)
├── utils/                   # cn(), formateadores (ms, %, bytes, uptime)
├── App.tsx                  # Componente raíz y enrutado
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
| `VITE_HOMELAB_WS_URL` | Endpoint WebSocket del microservicio (usa el simulador si está ausente). | `ws://localhost:4321/ws` |
| `VITE_HOMELAB_APP_URL` | URL pública de la app externa de HomeLab (activa el botón "App HomeLab"). | `http://localhost:4321` |

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
- **Custom hooks** (`useTelemetry`, `useWebSocket`, `useHomeLabWidget`): encapsulan ciclos de vida de datos (fetch, polling, reconexión, limpieza con `AbortController`), separando la UI de los efectos secundarios.
- **Contratos de datos** (`src/types/telemetry.ts`): tipos estrictos que reflejan el JSON del backend 1:1 (se usa `snake_case` deliberadamente para no añadir capas de traducción).
- **Servicio de transporte** (`src/services/websocket.ts`): cliente WebSocket con reconexión exponencial + jitter y heartbeat.

---

## Estado del proyecto

| Módulo | Estado |
|---|---|
| Dashboard (URLs + layout + rutas) | ✔ Implementado |
| HomeLab Monitor – widget en vivo | ✔ Implementado (mock + API real conmutables) |
| HomeLab Monitor – vista completa `/network` | ✔ Implementado (esqueleto WebSocket) |
| Benchmark & Profiling | 🚧 Esqueleto con ruta |
| Storage & Backups | 🚧 Esqueleto con ruta |

---

## Aprendizajes clave incorporados

- **`erasableSyntaxOnly`** (TS 6): no se usan `enum` ni *parameter properties*; se prefieren uniones de strings.
- **`verbatimModuleSyntax`**: los imports de tipos usan `import type`.
- **Patterns de React**: react-compiler-friendly (sin setState síncrono dentro de efectos; refs fuera del render).
- **Design tokens**: los colores de Shadcn se definen como variables CSS HSL en `index.css` y se consumen desde `tailwind.config.js`.