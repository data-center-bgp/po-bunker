import { useState, useEffect } from "react";
import { ordersApi, type PurchaseOrder } from "../../services/api";
import OrdersTable from "./OrdersTable";
import OrderForm from "./OrderForm";

const OrdersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

  // Fetch orders on component mount and when page changes
  useEffect(() => {
    fetchOrders();
  }, [currentPage]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ordersApi.getOrders(currentPage, limit);
      console.log("API Response:", response);
      setOrders(response.purchase_orders || []);
      setTotalCount(
        response.total_count || response.purchase_orders?.length || 0
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch orders");
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    fetchOrders(); // Refresh the orders list
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors flex items-center"
        >
          <svg
            className="h-5 w-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add New Order
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Table */}
      <OrdersTable
        orders={orders}
        loading={loading}
        currentPage={currentPage}
        totalCount={totalCount}
        limit={limit}
        onPageChange={setCurrentPage}
      />

      {/* Modal Form */}
      <OrderForm
        isOpen={showForm}
        onSuccess={handleFormSuccess}
        onCancel={() => setShowForm(false)}
      />
    </div>
  );
};

export default OrdersPage;