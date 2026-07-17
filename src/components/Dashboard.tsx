import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/useAuth";
import Sidebar, { type TabType } from "@/components/Sidebar";
import OrdersPage from "@/components/orders/OrderPage";
import VesselApiGate from "@/components/api/VesselApiGate";
import RegionPage from "@/components/api/RegionPage";
import PartnerPage from "@/components/api/PartnerPage";
import CompanyPage from "@/components/api/CompanyPage";
import OverviewPage from "@/components/overview/OverviewPage";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ClipboardList,
  Ship,
  MapPin,
  Building2,
  Building,
  type LucideIcon,
} from "lucide-react";

const ACTIVE_TAB_STORAGE_KEY = "po-bunker:active-tab";
const VALID_TABS: TabType[] = ["overview", "orders", "vessels", "regions", "partners", "companies"];

const PAGE_META: Record<
  TabType,
  { title: string; description: string; icon: LucideIcon }
> = {
  overview: {
    title: "Dashboard",
    description: "A snapshot of purchase order activity across the fleet.",
    icon: LayoutDashboard,
  },
  orders: {
    title: "Orders",
    description: "Create, track, and approve purchase orders.",
    icon: ClipboardList,
  },
  vessels: {
    title: "Shipping Vessels",
    description: "Browse the fleet registered for bunkering.",
    icon: Ship,
  },
  regions: {
    title: "Regions",
    description: "Manage the operational regions used across orders.",
    icon: MapPin,
  },
  partners: {
    title: "Vendor/Customer",
    description: "Manage vendor and customer partners.",
    icon: Building2,
  },
  companies: {
    title: "Companies",
    description: "Manage the internal companies issuing orders.",
    icon: Building,
  },
};

const getInitialTab = (): TabType => {
  try {
    const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (stored && VALID_TABS.includes(stored as TabType)) {
      return stored as TabType;
    }
  } catch {
    // localStorage unavailable
  }
  return "overview";
};

const Dashboard = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // localStorage unavailable
    }
  }, [activeTab]);

  const handleLogout = () => {
    logout();
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewPage />;

      case "orders":
        return <OrdersPage />;

      case "vessels":
        return <VesselApiGate />;

      case "regions":
        return <RegionPage />;

      case "partners":
        return <PartnerPage />;

      case "companies":
        return <CompanyPage />;

      default:
        return null;
    }
  };

  const activeMeta = PAGE_META[activeTab];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar
          isOpen={isSidebarOpen}
          activeTab={activeTab}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onTabChange={setActiveTab}
          onLogout={handleLogout}
        />

        {/* Main Content */}
        <main
          className={cn(
            "flex min-h-screen flex-1 flex-col transition-all duration-300",
            isSidebarOpen ? "ml-64" : "ml-[68px]",
          )}
        >
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-6 py-5 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ActiveIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {activeMeta.title}
              </h2>
              <p className="truncate text-sm text-muted-foreground">
                {activeMeta.description}
              </p>
            </div>
          </header>

          <div key={activeTab} className="flex-1 animate-in fade-in duration-300 p-6">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
