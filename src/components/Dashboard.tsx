import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/useAuth";
import Sidebar, { type TabType } from "@/components/Sidebar";
import OrdersPage from "@/components/orders/OrderPage";
import VesselApiGate from "@/components/api/VesselApiGate";
import RegionPage from "@/components/api/RegionPage";
import { cn } from "@/lib/utils";
import { Construction } from "lucide-react";

const ACTIVE_TAB_STORAGE_KEY = "po-bunker:active-tab";
const VALID_TABS: TabType[] = ["overview", "orders", "vessels", "regions"];

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
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
            <Construction className="h-16 w-16 text-muted-foreground" />
            <h2 className="text-2xl font-bold tracking-tight">Coming Soon</h2>
            <p className="text-muted-foreground max-w-sm">
              The overview dashboard with charts and statistics is currently
              under construction.
            </p>
          </div>
        );

      case "orders":
        return <OrdersPage />;

      case "vessels":
        return <VesselApiGate />;

      case "regions":
        return <RegionPage />;

      default:
        return null;
    }
  };

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
            "flex-1 p-6 transition-all duration-300",
            isSidebarOpen ? "ml-64" : "ml-[68px]",
          )}
        >
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
