import { useState } from "react";
import Sidebar, { type TabType } from "./Sidebar";
import OrdersPage from "./orders/OrderPage";

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const handleLogout = () => {
    // Handle logout logic here
    console.log("Logging out...");
    alert("Logged out successfully!");
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Stat Cards */}
              <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Total Orders
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      1,234
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full">
                    <svg
                      className="h-8 w-8 text-amber-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-4">
                  ↑ 12% from last month
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Revenue</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      $45.2K
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full">
                    <svg
                      className="h-8 w-8 text-amber-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-4">
                  ↑ 8% from last month
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Active Users
                    </p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">892</p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-full">
                    <svg
                      className="h-8 w-8 text-amber-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-green-600 mt-4">
                  ↑ 5% from last month
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Recent Activity
              </h3>
              <p className="text-gray-600">
                Activity data will be displayed here...
              </p>
            </div>
          </div>
        );

      case "orders":
        return <OrdersPage />;

      case "settings":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                General Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    placeholder="Enter company name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Notifications
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded"
                      defaultChecked
                    />
                    <span className="ml-2 text-gray-600">
                      Receive email notifications
                    </span>
                  </label>
                </div>
                <button className="px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-amber-50 to-yellow-100">
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
          className={`flex-1 p-8 transition-all duration-300 ${
            isSidebarOpen ? "ml-64" : "ml-20"
          }`}
        >
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
