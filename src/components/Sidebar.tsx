import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
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
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Anchor,
} from "lucide-react";

export type TabType = "overview" | "orders" | "settings";

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

const Sidebar = ({
  isOpen,
  activeTab,
  onToggle,
  onTabChange,
  onLogout,
}: SidebarProps) => {
  const { user } = useAuth();

  const tabs: Tab[] = [
    {
      id: "overview",
      name: "Overview",
      icon: <LayoutDashboard className="h-5 w-5" />,
    },
    {
      id: "orders",
      name: "Orders",
      icon: <ClipboardList className="h-5 w-5" />,
    },
    {
      id: "settings",
      name: "Settings",
      icon: <Settings className="h-5 w-5" />,
    },
  ];

  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  const NavButton = ({ tab }: { tab: Tab }) => {
    const button = (
      <button
        onClick={() => onTabChange(tab.id)}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
          activeTab === tab.id
            ? "bg-primary text-primary-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <span className="shrink-0">{tab.icon}</span>
        {isOpen && <span>{tab.name}</span>}
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
          "fixed left-0 top-0 z-20 flex h-screen flex-col border-r bg-sidebar transition-all duration-300",
          isOpen ? "w-64" : "w-[68px]",
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          {isOpen && (
            <div className="flex items-center gap-2">
              <Anchor className="h-6 w-6 text-primary" />
              <h1 className="text-lg font-bold text-foreground">PO Bunker</h1>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {isOpen ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {tabs.map((tab) => (
            <NavButton key={tab.id} tab={tab} />
          ))}
        </nav>

        {/* User Section */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-9 w-9 bg-primary">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                {user ? getInitials(user.email) : "U"}
              </AvatarFallback>
            </Avatar>
            {isOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  User
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || "user@example.com"}
                </p>
              </div>
            )}
          </div>
          <Separator className="mb-3" />
          {isOpen ? (
            <Button
              variant="destructive"
              className="w-full"
              size="sm"
              onClick={onLogout}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default Sidebar;
