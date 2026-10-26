import { useEffect, useState } from "react";
import { AlertCircle, Loader2, XCircle } from "lucide-react";
import { ordersService } from "@/services";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CancelOrderDialogProps {
  order: { id: number; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

const MIN_REASON = 3;

const CancelOrderDialog = ({
  order,
  open,
  onOpenChange,
  onCancelled,
}: CancelOrderDialogProps) => {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  const handleCancel = async () => {
    if (!order) return;
    setSaving(true);
    setError(null);
    try {
      await ordersService.cancelOrder(order.id, reason.trim());
      onCancelled();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Cancel order {order?.name}
          </DialogTitle>
          <DialogDescription>
            Use this when the order was made wrongly or is really cancelled. A
            cancelled order cannot be reopened; create a new order (you can
            copy this one afterwards).
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="cancel-reason">
            Cancellation reason <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong vessel selected / PO cancelled by the vendor"
            disabled={saving}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Keep order
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancel}
            disabled={saving || reason.trim().length < MIN_REASON}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CancelOrderDialog;
