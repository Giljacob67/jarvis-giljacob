import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, MessageCircle, Mail, Calendar, FolderOpen,
  StickyNote, Send, Zap, ClipboardList, Settings, X, CheckSquare, ListChecks
} from "lucide-react";
import JarvisAvatar from "./JarvisAvatar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/chat", icon: MessageCircle, label: "Chat" },
  { to: "/tasks", icon: CheckSquare, label: "Tarefas" },
  { to: "/plans", icon: ListChecks, label: "Planos" },
  { to: "/emails", icon: Mail, label: "E-mails" },
  { to: "/agenda", icon: Calendar, label: "Agenda" },
  { to: "/files", icon: FolderOpen, label: "Arquivos" },
  { to: "/notion", icon: StickyNote, label: "Notion" },
  { to: "/telegram", icon: Send, label: "Telegram" },
  { to: "/automations", icon: Zap, label: "Automações" },
  { to: "/activity", icon: ClipboardList, label: "Log" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

interface AppSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const AppSidebar = ({ open, onClose }: AppSidebarProps) => {
  const location = useLocation();
  const isMobile = useIsMobile();

  // Desktop: always visible
  if (!isMobile) {
    return (
      <aside className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
        <SidebarContent location={location} />
      </aside>
    );
  }

  // Mobile: overlay
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-50 animate-in slide-in-from-left duration-200">
        <div className="absolute top-4 right-4">
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors">
            <X size={20} />
          </button>
        </div>
        <SidebarContent location={location} onNavigate={onClose} />
      </aside>
    </>
  );
};

function SidebarContent({ location, onNavigate }: { location: ReturnType<typeof useLocation>; onNavigate?: () => void }) {
  return (
    <>
      {/* Brand */}
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <JarvisAvatar size="sm" />
        <div>
          <h1 className="font-display text-lg tracking-wider text-gradient-blue">JARVIS</h1>
          <p className="text-[10px] font-body text-muted-foreground tracking-widest uppercase">Assistente IA</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary glow-border-blue"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon size={18} className={isActive ? "text-primary" : ""} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Status */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Online • Pronto</span>
        </div>
      </div>
    </>
  );
}

export default AppSidebar;
