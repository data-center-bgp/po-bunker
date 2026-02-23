import { type PurchaseOrder } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Eye,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
} from "lucide-react";
import ExcelPreviewModal from "./ExcelPreviewModal";
import { useState } from "react";

interface OrdersTableProps {
  orders: PurchaseOrder[];
  loading: boolean;
  currentPage: number;
  totalCount: number;
  limit: number;
  onPageChange: (page: number) => void;
  onEdit?: (order: PurchaseOrder) => void;
  onView?: (orderId: number) => void;
}

const OrdersTable = ({
  orders,
  loading,
  currentPage,
  totalCount,
  limit,
  onPageChange,
  onEdit,
  onView,
}: OrdersTableProps) => {
  const [previewOrderId, setPreviewOrderId] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const openPreview = (id: number) => {
    setPreviewOrderId(id);
    setPreviewOpen(true);
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

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startItem = orders.length > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = Math.min(currentPage * limit, totalCount);

  if (loading) {
    return (
      <Card className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Table */}
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>PO Number</TableHead>
                <TableHead>PO Type</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Planned Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vessel Name</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No orders found. Create your first order to get started.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.name}</TableCell>
                    <TableCell>{order.order_type}</TableCell>
                    <TableCell>
                      {new Date(order.date_order).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      {new Date(order.date_planned).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </TableCell>
                    <TableCell>{order.partner_name || "-"}</TableCell>
                    <TableCell>
                      {order.order_lines?.[0]?.vessel_name || "-"}
                    </TableCell>
                    <TableCell>
                      {order.order_lines?.[0]?.product_name || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {order.order_lines?.[0]?.product_qty || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(order.state)}>
                        {getStatusLabel(order.state)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onView?.(order.id)}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>View</TooltipContent>
                        </Tooltip>
                        {onEdit && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onEdit(order)}
                              >
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openPreview(order.id)}
                            >
                              <Download className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Preview / Download Excel
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Pagination */}
        <Card className="flex items-center justify-between p-4">
          <p className="text-sm text-muted-foreground">
            Showing {startItem} to {endItem} of {totalCount} orders
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                className="w-9"
                onClick={() => onPageChange(page)}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onPageChange(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
        <ExcelPreviewModal
          orderId={previewOrderId}
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreviewOrderId(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
};

export default OrdersTable;
