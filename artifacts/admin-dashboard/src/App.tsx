import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminLayout } from './components/layout/AdminLayout';

import Login from './pages/login';
import Dashboard from './pages/dashboard';
import Keys from './pages/keys';
import Orders from './pages/orders';
import Users from './pages/users';
import Logs from './pages/logs';
import Settings from './pages/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminLayout>
        {children}
      </AdminLayout>
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        <ProtectedLayout>
          <Dashboard />
        </ProtectedLayout>
      </Route>
      
      <Route path="/keys">
        <ProtectedLayout>
          <Keys />
        </ProtectedLayout>
      </Route>

      <Route path="/orders">
        <ProtectedLayout>
          <Orders />
        </ProtectedLayout>
      </Route>
      
      <Route path="/users">
        <ProtectedLayout>
          <Users />
        </ProtectedLayout>
      </Route>
      
      <Route path="/logs">
        <ProtectedLayout>
          <Logs />
        </ProtectedLayout>
      </Route>
      
      <Route path="/settings">
        <ProtectedLayout>
          <Settings />
        </ProtectedLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
