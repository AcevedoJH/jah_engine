/**
 * ============================================================
 * JAH ENGINE - App.tsx (componente raiz + enrutado)
 * ============================================================
 * Aqui definimos el MAPA DE RUTAS de la SPA con React Router v7.
 *
 * Estructura de rutas anidadas:
 *   <Route element={<DashboardLayout />}>   <- layout con sidebar
 *     ├── "/"          -> DashboardPage
 *     ├── "/network"   -> NetworkPage
 *     ├── "/benchmark" -> BenchmarkPage
 *     └── "/backups"   -> BackupsPage
 *
 * El layout envuelve a todas las paginas y su <Outlet/> renderiza la
 * hija activa. Nota: la ruta padre NO tiene `path`, es una "layout
 * route" (solo aporta UI, no segmento de URL).
 */

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { NetworkPage } from '@/features/network/NetworkPage'
import { BenchmarkPage } from '@/features/benchmark/BenchmarkPage'
import { BackupsPage } from '@/features/backups/BackupsPage'

/**
 * Componente raiz de JAH Engine.
 * @returns El proveedor de rutas con el arbol de paginas.
 */
function App() {
  return (
    // BrowserRouter usa la History API del navegador (URLs limpias).
    <BrowserRouter>
      <Routes>
        {/* Layout compartido por todas las vistas. */}
        <Route element={<DashboardLayout />}>
          {/* index = ruta "/" exacta. */}
          <Route index element={<DashboardPage />} />
          <Route path="network" element={<NetworkPage />} />
          <Route path="benchmark" element={<BenchmarkPage />} />
          <Route path="backups" element={<BackupsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App