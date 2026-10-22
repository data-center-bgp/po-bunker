import { useState, useEffect, useCallback } from "react";
import { ordersService, type PurchaseOrder } from "@/services";
import { useAuth } from "@/contexts/useAuth";
import OrdersTable from "@/components/orders/OrdersTable";
import OrderForm from "@/components/orders/OrderForm";
import ViewOrderModal from "@/components/orders/ViewOrderModal";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus } from "lucide-react";

const OrdersPage = () => {
  const { canWrite } = useAuth();
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
      // One query returns each order together with its lines.
      const page = await ordersService.getOrders(currentPage, limit);
      setOrders(page.orders);
      setTotalCount(page.totalCount);
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
      const fullOrder = await ordersService.getOrderById(orderId);
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

  // deleteOrder cancels a confirmed order first when needed.
  const handleDelete = async (orderId: number) => {
    await ordersService.deleteOrder(orderId);
    fetchOrders();
  };

  const handleConfirm = async (orderId: number) => {
    try {
      await ordersService.confirmOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm order");
    }
  };

  const handleCancel = async (orderId: number) => {
    try {
      await ordersService.cancelOrder(orderId);
      fetchOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  const handleSetDraft = async (orderId: number) => {
    try {
      await ordersService.draftOrder(orderId);
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
        {canWrite && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Add New Order
          </Button>
        )}
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
        onConfirm={canWrite ? handleConfirm : undefined}
        onCancel={canWrite ? handleCancel : undefined}
        onSetDraft={canWrite ? handleSetDraft : undefined}
        limit={limit}
        onPageChange={setCurrentPage}
        onEdit={canWrite ? (order) => handleEdit(order.id) : undefined}
        onView={handleView}
        onDelete={canWrite ? handleDelete : undefined}
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
        onConfirm={canWrite ? handleConfirm : undefined}
        onCancel={canWrite ? handleCancel : undefined}
        onDelete={canWrite ? handleDelete : undefined}
        onSetDraft={canWrite ? handleSetDraft : undefined}
        onRefreshList={fetchOrders}
      />
    </div>
  );
};

export default OrdersPage;
