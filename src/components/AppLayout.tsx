import { ReactNode, useState } from "react";
import AppSidebar from "./AppSidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";
import JarvisAvatar from "./JarvisAvatar";
import NotificationBell from "./NotificationBell";

const AppLayout = ({ children }: { children: ReactNode }) => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile header */}
      {isMobile && (
        <header className="fixed top-0 left-0 right-0 z-30 bg-sidebar border-b border-sidebar-border flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Menu size={22} />
          </button>
          <JarvisAvatar size="sm" />
          <h1 className="font-display text-base tracking-wider text-gradient-blue flex-1">JARVIS</h1>
          <NotificationBell />
        </header>
      )}

      <main className={isMobile ? "pt-14 min-h-screen" : "ml-64 min-h-screen"}>
        {children}
      </main>
    </div>
  );
};

export default AppLayout;
