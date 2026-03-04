import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
