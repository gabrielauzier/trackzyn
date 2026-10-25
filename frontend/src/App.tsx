import { lazy, Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/contexts/auth-provider'
import { WorkspaceProvider } from '@/contexts/workspace-provider'
import { SidebarStateProvider } from '@/contexts/sidebar-state-provider'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminRoute } from '@/components/admin-route'
import { AppLayout } from '@/components/app-layout'
import { DesktopGate } from '@/components/desktop-gate'

const SetupPage = lazy(() => import('@/pages/setup'))
const LoginPage = lazy(() => import('@/pages/login'))
const RegisterPage = lazy(() => import('@/pages/register'))
const OIDCCallbackPage = lazy(() => import('@/pages/oidc-callback'))
const HomePage = lazy(() => import('@/pages/home'))
const ArchivedListsPage = lazy(() => import('@/pages/archived-lists'))
const ListBoardPage = lazy(() => import('@/pages/list-board'))
const FocusPage = lazy(() => import('@/pages/focus'))
const FocusWidgetPage = lazy(() => import('@/pages/focus-widget'))
const ReportsPage = lazy(() => import('@/pages/reports'))
const FilesPage = lazy(() => import('@/pages/files'))
const ComponentsShowcasePage = lazy(() => import('@/pages/showcase'))
const WorkspaceSettingsPage = lazy(() => import('@/pages/workspace-settings'))
const AdminSettingsPage = lazy(() => import('@/pages/admin/settings'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <DesktopGate>
              <AuthProvider>
                <WorkspaceProvider>
                  <Suspense fallback={<LoadingFallback />}>
                    <Routes>
                      <Route path="/setup" element={<SetupPage />} />
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/auth/oidc/callback" element={<OIDCCallbackPage />} />
                      <Route path="/register" element={<RegisterPage />} />
                      {/* The desktop focus widget: its own window, without the sidebar. */}
                      <Route
                        path="/widget"
                        element={
                          <ProtectedRoute>
                            <FocusWidgetPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        element={
                          <ProtectedRoute>
                            <SidebarStateProvider>
                              <AppLayout />
                            </SidebarStateProvider>
                          </ProtectedRoute>
                        }
                      >
                        <Route path="/" element={<HomePage />} />
                        <Route path="/lists/archived" element={<ArchivedListsPage />} />
                        <Route path="/lists/:listId" element={<ListBoardPage />} />
                        <Route path="/focus/:listId" element={<FocusPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/files" element={<FilesPage />} />
                        <Route path="/components" element={<ComponentsShowcasePage />} />
                        <Route path="/workspace/settings" element={<WorkspaceSettingsPage />} />
                        <Route path="/admin" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />
                      </Route>
                    </Routes>
                  </Suspense>
                  <Toaster />
                </WorkspaceProvider>
              </AuthProvider>
            </DesktopGate>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
