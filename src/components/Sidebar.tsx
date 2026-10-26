import { useAuth } from "@/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardList,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Ship,
  MapPin,
  Building2,
  Building,
} from "lucide-react";

export type TabType =
  | "overview"
  | "orders"
  | "vessels"
  | "regions"
  | "partners"
  | "companies";

interface Tab {
  id: TabType;
  name: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  isOpen: boolean;
  activeTab: TabType;
  onToggle: () => void;
  onTabChange: (tab: TabType) => void;
  onLogout: () => void;
}

const TABS: Tab[] = [
  {
    id: "overview",
    name: "Dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    id: "orders",
    name: "Orders",
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    id: "vessels",
    name: "Shipping Vessels",
    icon: <Ship className="h-5 w-5" />,
  },
  {
    id: "regions",
    name: "Regions",
    icon: <MapPin className="h-5 w-5" />,
  },
  {
    id: "partners",
    name: "Vendor/Customer",
    icon: <Building2 className="h-5 w-5" />,
  },
  {
    id: "companies",
    name: "Companies",
    icon: <Building className="h-5 w-5" />,
  },
];

const NAV_SECTIONS: { label: string; tabIds: TabType[] }[] = [
  { label: "General", tabIds: ["overview", "orders"] },
  {
    label: "Master Data",
    tabIds: ["vessels", "regions", "partners", "companies"],
  },
];

const Sidebar = ({
  isOpen,
  activeTab,
  onToggle,
  onTabChange,
  onLogout,
}: SidebarProps) => {
  const { user } = useAuth();

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  const NavButton = ({ tab }: { tab: Tab }) => {
    const isActive = activeTab === tab.id;
    const button = (
      <button
        onClick={() => onTabChange(tab.id)}
        className={cn(
          "group relative w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary-foreground/80" />
        )}
        <span className="shrink-0">{tab.icon}</span>
        {isOpen && <span className="truncate">{tab.name}</span>}
      </button>
    );

    if (!isOpen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">{tab.name}</TooltipContent>
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-20 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
          isOpen ? "w-64" : "w-[68px]",
        )}
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
          {isOpen && (
            <div className="flex min-w-0 items-center gap-2.5 px-1">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <img
                  src="/logo-bpg.png"
                  alt="Logo"
                  className="h-6 w-6 object-contain"
                />
              </div>
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-sm font-bold text-foreground">
                  PO Bunker
                </h1>
                <p className="truncate text-[11px] text-muted-foreground">
                  Barokah Perkasa Group
                </p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className={cn(
              "h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground",
              !isOpen && "mx-auto",
            )}
          >
            {isOpen ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section, index) => (
            <div key={section.label} className="space-y-1">
              {index > 0 && !isOpen && <Separator className="mb-3" />}
              {isOpen && (
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {section.label}
                </p>
              )}
              {section.tabIds.map((tabId) => {
                const tab = TABS.find((t) => t.id === tabId)!;
                return <NavButton key={tab.id} tab={tab} />;
              })}
            </div>
          ))}
        </nav>

        {/* User Section */}
        <div className="border-t border-sidebar-border p-3">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent",
                  !isOpen && "justify-center",
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 bg-primary">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                    {user ? getInitials(user.email) : "U"}
                  </AvatarFallback>
                </Avatar>
                {isOpen && (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user?.email || "user@example.com"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Signed in
                      </p>
                    </div>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side={isOpen ? "top" : "right"} align="start" className="w-64 p-2">
              <div className="px-2 py-1.5">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.email || "user@example.com"}
                </p>
                <p className="text-xs text-muted-foreground">Account</p>
              </div>
              <Separator className="my-1.5" />
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                size="sm"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default Sidebar;
