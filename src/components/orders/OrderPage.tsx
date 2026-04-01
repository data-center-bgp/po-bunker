import { useState, useEffect, useCallback } from "react";
import { ordersApi, type PurchaseOrder } from "@/services/api";
import OrdersTable from "@/components/orders/OrdersTable";
import OrderForm from "@/components/orders/OrderForm";
import ViewOrderModal from "@/components/orders/ViewOrderModal";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus } from "lucide-react";

const OrdersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
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
  }, [currentPage, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingOrder(null);
    fetchOrders();
  };

  const handleEdit = async (orderId: number) => {
    try {
      // Fetch full order with order_lines (list endpoint doesn't include them)
      const fullOrder = await ordersApi.getOrderById(orderId);
      setEditingOrder(fullOrder);
      setShowForm(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load order for editing",
      );
    }
  };

  const handleView = (orderId: number) => {
    setViewingOrderId(orderId);
    setViewModalOpen(true);
  };

  const handleDelete = async (
    orderId: number,
    cancelFirst: boolean = false,
  ) => {
    if (cancelFirst) {
      await ordersApi.cancelOrder(orderId);
    }
    await ordersApi.deleteOrder(orderId);
    fetchOrders();
  };

  const handleConfirm = async (orderId: number) => {
    try {
      await ordersApi.confirmOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm order");
    }
  };

  const handleCancel = async (orderId: number) => {
    try {
      await ordersApi.cancelOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  const handleDeleteSingle = async (orderId: number) => {
    await ordersApi.deleteOrder(orderId);
    fetchOrders();
  };

  const handleSetDraft = async (orderId: number) => {
    try {
      await ordersApi.draftOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to set order to draft",
      );
    }
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
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onSetDraft={handleSetDraft}
        limit={limit}
        onPageChange={setCurrentPage}
        onEdit={(order) => handleEdit(order.id)}
        onView={handleView}
        onDelete={handleDelete}
      />

      {/* Modal Form */}
      <OrderForm
        isOpen={showForm}
        onSuccess={handleFormSuccess}
        onCancel={() => {
          setShowForm(false);
          setEditingOrder(null);
        }}
        order={editingOrder}
      />

      {/* View Order Modal */}
      <ViewOrderModal
        orderId={viewingOrderId}
        open={viewModalOpen}
        onOpenChange={(open) => {
          setViewModalOpen(open);
          if (!open) setViewingOrderId(null);
        }}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onDelete={handleDeleteSingle}
        onSetDraft={handleSetDraft}
        onRefreshList={fetchOrders}
      />
    </div>
  );
};

export default OrdersPage;
