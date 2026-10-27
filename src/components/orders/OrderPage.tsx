import { useState, useEffect, useCallback } from "react";
import { ordersService, type PurchaseOrder } from "@/services";
import { useAuth } from "@/contexts/useAuth";
import OrdersTable from "@/components/orders/OrdersTable";
import OrderForm from "@/components/orders/OrderForm";
import ViewOrderModal from "@/components/orders/ViewOrderModal";
import CompleteOrderDialog from "@/components/orders/CompleteOrderDialog";
import CancelOrderDialog from "@/components/orders/CancelOrderDialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus } from "lucide-react";

const OrdersPage = () => {
  const { canWrite } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [limit] = useState(10);

  // New order form (optionally prefilled from a cancelled order).
  const [showForm, setShowForm] = useState(false);
  const [template, setTemplate] = useState<PurchaseOrder | null>(null);

  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<PurchaseOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const page = await ordersService.getOrders(currentPage, limit);
      setOrders(page.orders);
      setTotalCount(page.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar PO");
    } finally {
      setLoading(false);
    }
  }, [currentPage, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const openForm = (from: PurchaseOrder | null) => {
    setTemplate(from);
    setViewModalOpen(false);
    setShowForm(true);
  };

  const handleView = (orderId: number) => {
    setViewingOrderId(orderId);
    setViewModalOpen(true);
  };

  const askComplete = (orderId: number) => {
    setViewModalOpen(false);
    setCompletingId(orderId);
  };

  const askCancel = async (orderId: number) => {
    const order =
      orders.find((o) => o.id === orderId) ??
      (await ordersService.getOrderById(orderId));
    setViewModalOpen(false);
    setCancelling(order);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Daftar PO</h2>
          <p className="text-muted-foreground">
            Ajukan Purchase Order (PO), lalu selesaikan dengan Delivery Order (DO).
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => openForm(null)}>
            <Plus className="h-4 w-4" />
            Tambah PO Baru
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <OrdersTable
        orders={orders}
        loading={loading}
        currentPage={currentPage}
        totalCount={totalCount}
        limit={limit}
        onPageChange={setCurrentPage}
        onView={handleView}
        onComplete={canWrite ? askComplete : undefined}
        onCancel={canWrite ? askCancel : undefined}
        onCopy={canWrite ? (order) => openForm(order) : undefined}
      />

      <OrderForm
        isOpen={showForm}
        template={template}
        onSuccess={() => {
          setShowForm(false);
          setTemplate(null);
          fetchOrders();
        }}
        onCancel={() => {
          setShowForm(false);
          setTemplate(null);
        }}
      />

      <ViewOrderModal
        orderId={viewingOrderId}
        open={viewModalOpen}
        onOpenChange={(open) => {
          setViewModalOpen(open);
          if (!open) setViewingOrderId(null);
        }}
        onComplete={canWrite ? askComplete : undefined}
        onCancel={canWrite ? askCancel : undefined}
        onCopy={canWrite ? (order) => openForm(order) : undefined}
        onRefreshList={fetchOrders}
      />

      <CompleteOrderDialog
        orderId={completingId}
        open={completingId !== null}
        onOpenChange={(open) => {
          if (!open) setCompletingId(null);
        }}
        onCompleted={fetchOrders}
      />

      <CancelOrderDialog
        order={cancelling}
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        onCancelled={fetchOrders}
      />
    </div>
  );
};

export default OrdersPage;
