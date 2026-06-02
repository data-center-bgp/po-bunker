import { useState } from "react";
import { useAuth } from "@/contexts/useAuth";
import Sidebar, { type TabType } from "@/components/Sidebar";
import OrdersPage from "@/components/orders/OrderPage";
import { cn } from "@/lib/utils";
import { Construction } from "lucide-react";

const Dashboard = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
