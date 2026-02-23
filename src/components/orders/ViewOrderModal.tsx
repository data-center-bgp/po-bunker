import { useEffect, useState } from "react";
import { ordersApi, type PurchaseOrder } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Eye,
  Loader2,
  Package,
  User,
  Ship,
  Calendar,
  FileText,
  Hash,
} from "lucide-react";

interface ViewOrderModalProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ViewOrderModal = ({
  orderId,
  open,
  onOpenChange,
}: ViewOrderModalProps) => {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && orderId) {
      fetchOrder(orderId);
    } else if (!open) {
      setOrder(null);
      setError(null);
    }
  }, [open, orderId]);

  const fetchOrder = async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      const response = await ordersApi.getOrderById(id);
      setOrder(response);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch order details",
      );
      console.error("Error fetching order:", err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusVariant = (
    state: string,
  ): "success" | "warning" | "info" | "destructive" | "secondary" => {
    switch (state) {
      case "purchase":
      case "done":
        return "success";
      case "to approve":
        return "warning";
      case "draft":
        return "info";
      case "cancel":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (state: string) => {
    const statusMap: Record<string, string> = {
      draft: "Draft",
      "to approve": "Pending",
      purchase: "Approved",
      done: "Completed",
      cancel: "Cancelled",
    };
    return statusMap[state] || state;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Order Details
          </DialogTitle>
          <DialogDescription>
            View the complete details of this purchase order.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              Loading order details...
            </span>
          </div>
        )}

        {error && (
          <div className="mx-6 my-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <Loader2 className="h-4 w-4" />
            {error}
          </div>
        )}

        {order && !loading && (
          <ScrollArea className="max-h-[calc(90vh-200px)]">
            <div className="px-6 py-4 space-y-6">
              {/* Order Header Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-muted-foreground">PO Number</Label>
                  </div>
                  <p className="text-lg font-semibold">{order.name}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-muted-foreground">Status</Label>
                  </div>
                  <Badge variant={getStatusVariant(order.state)}>
                    {getStatusLabel(order.state)}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Customer & Company Info */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer & Company
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Customer</Label>
                    <Input
                      value={order.partner_name || "-"}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Order Type</Label>
                    <Input
                      value={order.order_type || "-"}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Dates */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Dates
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Order Date</Label>
                    <Input
                      value={formatDate(order.date_order)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      Planned Date
                    </Label>
                    <Input
                      value={formatDate(order.date_planned)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Order Lines */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Order Items
                </h4>
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Product</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">
                          Total Price
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.order_lines && order.order_lines.length > 0 ? (
                        order.order_lines.map((line, index) => (
                          <TableRow key={index}>
                            <TableCell>{line.product_name || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Ship className="h-3 w-3 text-muted-foreground" />
                                {line.vessel_name || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {line.product_qty || "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(line.price_unit || 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(
                                (line.product_qty || 0) *
                                  (line.price_unit || 0),
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-24 text-center text-muted-foreground"
                          >
                            No order items found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <Separator />

        <DialogFooter className="px-6 pb-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewOrderModal;
