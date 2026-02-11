import { useState, useEffect } from "react";
import { ordersApi, type PurchaseOrder } from "@/services/api";
import OrdersTable from "@/components/orders/OrdersTable";
import OrderForm from "@/components/orders/OrderForm";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus } from "lucide-react";

const OrdersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

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
        response.total_count || response.purchase_orders?.length || 0,
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
    fetchOrders();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">
            Manage your purchase orders here.
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Add New Order
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
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
