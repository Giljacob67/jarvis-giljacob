import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Chat from "./pages/Chat";
import Emails from "./pages/Emails";
import Agenda from "./pages/Agenda";
import Files from "./pages/Files";
import NotionPage from "./pages/NotionPage";
import Telegram from "./pages/Telegram";
import Automations from "./pages/Automations";
import ActivityLog from "./pages/ActivityLog";
import SettingsPage from "./pages/SettingsPage";
import Tasks from "./pages/Tasks";
import Plans from "./pages/Plans";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";


const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/emails" element={<Emails />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/files" element={<Files />} />
        <Route path="/notion" element={<NotionPage />} />
        <Route path="/telegram" element={<Telegram />} />
        <Route path="/automations" element={<Automations />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
