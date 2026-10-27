import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { ordersService, type PurchaseOrder } from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import OrderDocuments from "@/components/orders/OrderDocuments";

interface CompleteOrderDialogProps {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

const money = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

const number = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(n);

// Completing = upload the Delivery Order (DO) and record what was really
// delivered per line (e.g. ordered 1000 L, DO says 900 L).
const CompleteOrderDialog = ({
  orderId,
  open,
  onOpenChange,
  onCompleted,
}: CompleteOrderDialogProps) => {
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number) => {
    try {
      setOrder(await ordersService.getOrderById(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat PO");
    }
  }, []);

  useEffect(() => {
    if (!open || orderId === null) {
      setOrder(null);
      setQuantities({});
      setError(null);
      return;
    }
    setLoading(true);
    load(orderId).finally(() => setLoading(false));
  }, [open, orderId, load]);

  const parsed = (order?.lines ?? []).map((l) => {
    const raw = quantities[l.id];
    const value = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    return { line: l, value, valid: Number.isFinite(value) && value >= 0 };
  });
  const allQuantities = parsed.length > 0 && parsed.every((p) => p.valid);
  const hasDocument = (order?.documents.length ?? 0) > 0;
  const actualAmount = parsed.reduce(
    (sum, p) => sum + (p.valid ? p.value * p.line.price_unit : 0),
    0,
  );

  const handleComplete = async () => {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      await ordersService.completeOrder(
        order.id,
        parsed.map((p) => ({ line_id: p.line.id, actual_qty: p.value })),
      );
      onCompleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyelesaikan PO");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Selesaikan PO {order?.name}
          </DialogTitle>
          <DialogDescription>
            Unggah Delivery Order (DO) dan isi kuantitas aktual yang diterima
            untuk setiap baris. PO yang sudah selesai tidak dapat diubah atau
            dibatalkan.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading || !order ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-sm font-semibold">
                1. Delivery Order (DO)
              </h4>
              <OrderDocuments
                orderId={order.id}
                documents={order.documents}
                canEdit
                onChanged={() => load(order.id)}
              />
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">
                2. Kuantitas aktual per baris
              </h4>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead>Produk</TableHead>
                      <TableHead>Kapal</TableHead>
                      <TableHead className="text-right">Dipesan</TableHead>
                      <TableHead className="w-36 text-right">Aktual</TableHead>
                      <TableHead className="text-right">Selisih</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map(({ line, value, valid }) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.product?.name ?? "-"}</TableCell>
                        <TableCell>{line.vessel?.name ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          {number(line.product_qty)} {line.uom?.name}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="text-right"
                            value={quantities[line.id] ?? ""}
                            onChange={(e) =>
                              setQuantities((q) => ({
                                ...q,
                                [line.id]: e.target.value,
                              }))
                            }
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell
                          className={`text-right ${
                            valid && value !== line.product_qty
                              ? "font-medium text-orange-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          {valid
                            ? `${value - line.product_qty > 0 ? "+" : ""}${number(value - line.product_qty)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-right text-sm text-muted-foreground">
                Jumlah aktual (kuantitas x harga satuan):{" "}
                <span className="font-semibold text-foreground">
                  {money(actualAmount)}
                </span>
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Tutup
          </Button>
          <Button
            onClick={handleComplete}
            disabled={saving || !order || !hasDocument || !allQuantities}
            title={
              !hasDocument
                ? "Unggah Delivery Order (DO) terlebih dahulu"
                : !allQuantities
                  ? "Isi kuantitas aktual untuk setiap baris"
                  : undefined
            }
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Selesaikan PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteOrderDialog;
