import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import {
  ORDER_STATE_LABELS,
  ORDER_TYPE_LABELS,
  ordersService,
  type OrderState,
  type PurchaseOrder,
} from "@/services";
import { useAuth } from "@/contexts/useAuth";
import OrderDocuments from "@/components/orders/OrderDocuments";
import OrderRemarks from "@/components/orders/OrderRemarks";
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
  AlertCircle,
  Calendar,
  CheckCircle,
  Copy,
  Eye,
  FileText,
  Hash,
  Loader2,
  Package,
  Paperclip,
  Ship,
  User,
  XCircle,
} from "lucide-react";

interface ViewOrderModalProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (orderId: number) => void;
  onCancel?: (orderId: number) => void;
  onCopy?: (order: PurchaseOrder) => void;
  /** Called after something inside the dialog changed the order. */
  onRefreshList?: () => void;
}

const STATE_VARIANT: Record<
  OrderState,
  "info" | "success" | "destructive"
> = {
  submitted: "info",
  completed: "success",
  cancelled: "destructive",
};

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(
    amount,
  );

const formatQty = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(n);

const ViewOrderModal = ({
  orderId,
  open,
  onOpenChange,
  onComplete,
  onCancel,
  onCopy,
  onRefreshList,
}: ViewOrderModalProps) => {
  const { canWrite } = useAuth();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      setOrder(await ordersService.getOrderById(id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat detail PO",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && orderId) {
      fetchOrder(orderId);
    } else if (!open) {
      setOrder(null);
      setError(null);
    }
  }, [open, orderId]);

  const reload = async () => {
    if (!order) return;
    await fetchOrder(order.id);
    onRefreshList?.();
  };

  const isSubmitted = order?.state === "submitted";
  const isCompleted = order?.state === "completed";
  const isCancelled = order?.state === "cancelled";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Detail Purchase Order (PO)
          </DialogTitle>
          <DialogDescription>
            Lihat detail lengkap PO ini.
          </DialogDescription>
        </DialogHeader>

        <Separator />

        {loading && !order && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">
              Memuat detail PO...
            </span>
          </div>
        )}

        {error && (
          <div className="mx-6 my-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {order && (
          <ScrollArea className="max-h-[calc(90vh-200px)]">
            <div className="space-y-6 px-6 py-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-muted-foreground">Nomor PO</Label>
                  </div>
                  <p className="text-lg font-semibold">{order.name}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-muted-foreground">Status</Label>
                  </div>
                  <Badge variant={STATE_VARIANT[order.state]}>
                    {ORDER_STATE_LABELS[order.state]}
                  </Badge>
                </div>
              </div>

              {isCancelled && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
                  <p className="font-semibold text-destructive">
                    Dibatalkan {formatDate(order.cancelled_at)}
                    {order.canceller ? ` oleh ${order.canceller.name}` : ""}
                  </p>
                  <p className="mt-1">Alasan: {order.cancel_reason}</p>
                </div>
              )}

              <Separator />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4" />
                  Customer & Perusahaan
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Customer</Label>
                    <Input
                      value={order.partner?.name || "-"}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Perusahaan</Label>
                    <Input
                      value={order.company?.name || "-"}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Jenis PO</Label>
                    <Input
                      value={ORDER_TYPE_LABELS[order.order_type] || order.order_type}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Calendar className="h-4 w-4" />
                  Tanggal
                </h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Tanggal PO</Label>
                    <Input
                      value={formatDate(order.date_order)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      Diajukan oleh
                    </Label>
                    <Input
                      value={order.creator?.name ?? "-"}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">
                      No.{" "}
                      {order.option_order === "invoice" ? "invoice" : "penawaran"}{" "}
                      vendor
                    </Label>
                    <Input
                      value={
                        [
                          order.partner_ref,
                          order.date_vendor
                            ? `(${new Date(order.date_vendor).toLocaleDateString("id-ID")})`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || "-"
                      }
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Tanggal bunker</Label>
                    <Input
                      value={formatDate(order.date_bunker)}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  {isCompleted && (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-muted-foreground">Diselesaikan</Label>
                      <Input
                        value={`${formatDate(order.completed_at)}${
                          order.completer ? ` oleh ${order.completer.name}` : ""
                        }`}
                        readOnly
                        className="bg-muted"
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Package className="h-4 w-4" />
                  Item PO
                </h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead>Produk</TableHead>
                        <TableHead>Kapal</TableHead>
                        <TableHead className="text-right">Dipesan</TableHead>
                        {isCompleted && (
                          <>
                            <TableHead className="text-right">
                              Kuantitas aktual
                            </TableHead>
                            <TableHead className="text-right">
                              Selisih
                            </TableHead>
                          </>
                        )}
                        <TableHead className="text-right">Harga satuan</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        {isCompleted && (
                          <TableHead className="text-right">
                            Jumlah aktual
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.lines.map((line) => {
                        const diff =
                          line.actual_qty === null
                            ? null
                            : line.actual_qty - line.product_qty;
                        return (
                          <TableRow key={line.id}>
                            <TableCell>{line.product?.name || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Ship className="h-3 w-3 text-muted-foreground" />
                                {line.vessel?.name || "-"}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {formatQty(line.product_qty)} {line.uom?.name}
                            </TableCell>
                            {isCompleted && (
                              <>
                                <TableCell className="text-right">
                                  {line.actual_qty === null
                                    ? "-"
                                    : `${formatQty(line.actual_qty)} ${line.uom?.name ?? ""}`}
                                </TableCell>
                                <TableCell
                                  className={`text-right ${
                                    diff && diff !== 0
                                      ? "font-medium text-orange-600"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {diff === null
                                    ? "-"
                                    : `${diff > 0 ? "+" : ""}${formatQty(diff)}`}
                                </TableCell>
                              </>
                            )}
                            <TableCell className="text-right">
                              {formatCurrency(line.price_unit || 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(line.price_subtotal || 0)}
                            </TableCell>
                            {isCompleted && (
                              <TableCell className="text-right">
                                {line.actual_subtotal === null
                                  ? "-"
                                  : formatCurrency(line.actual_subtotal)}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex flex-col items-end gap-1 text-sm text-muted-foreground">
                  <div>
                    Total baris:{" "}
                    <span className="text-foreground">
                      {formatCurrency(
                        (order.amount_untaxed || 0) + (order.amount_discount || 0),
                      )}
                    </span>
                  </div>
                  <div>
                    Diskon:{" "}
                    <span className="text-foreground">
                      - {formatCurrency(order.amount_discount || 0)}
                    </span>
                  </div>
                  <div>
                    PPN {order.tax_percent || 0}%:{" "}
                    <span className="text-foreground">
                      {formatCurrency(order.amount_tax || 0)}
                    </span>
                  </div>
                  <div>
                    Total (dipesan):{" "}
                    <span className="ml-1 text-base font-semibold text-foreground">
                      {formatCurrency(order.amount_total || 0)}
                    </span>
                  </div>
                  {isCompleted && order.actual_amount !== null && (
                    <div>
                      Jumlah aktual (diterima x harga satuan):{" "}
                      <span className="ml-1 text-base font-semibold text-foreground">
                        {formatCurrency(order.actual_amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Paperclip className="h-4 w-4" />
                  Delivery Order (DO)
                </h4>
                <OrderDocuments
                  orderId={order.id}
                  documents={order.documents}
                  canEdit={canWrite && isSubmitted}
                  onChanged={reload}
                />
              </div>

              <Separator />
              <OrderRemarks order={order} onChanged={reload} />

              {order.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4" />
                      Catatan
                    </h4>
                    <div
                      className="prose prose-sm max-w-none rounded-md border border-border bg-muted p-3 [&>p]:my-1"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(order.notes),
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        )}

        <Separator />

        <DialogFooter className="px-6 pb-6">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              {order && canWrite && isSubmitted && onComplete && (
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => onComplete(order.id)}
                >
                  <CheckCircle className="h-4 w-4" />
                  Selesaikan
                </Button>
              )}
              {order && canWrite && isSubmitted && onCancel && (
                <Button
                  variant="outline"
                  className="border-orange-500 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
                  onClick={() => onCancel(order.id)}
                >
                  <XCircle className="h-4 w-4" />
                  Batalkan PO
                </Button>
              )}
              {order && canWrite && isCancelled && onCopy && (
                <Button variant="outline" onClick={() => onCopy(order)}>
                  <Copy className="h-4 w-4" />
                  Salin sebagai PO baru
                </Button>
              )}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewOrderModal;
