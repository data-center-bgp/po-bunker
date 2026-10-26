import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { useSignedUrl } from "@/lib/useSignedUrl";
import {
  APPROVAL_LEVELS,
  ordersService,
  type ApprovalLevel,
  type PurchaseOrder,
} from "@/services";
import { Button } from "@/components/ui/button";

interface OrderApprovalsProps {
  order: PurchaseOrder;
  onChanged: () => void;
}

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

const Signature = ({ path }: { path: string | null }) => {
  const url = useSignedUrl(path);
  if (!path) return null;
  return url ? (
    <img src={url} alt="Signature" className="h-14 object-contain" />
  ) : (
    <div className="h-14" />
  );
};

const OrderApprovals = ({ order, onChanged }: OrderApprovalsProps) => {
  const { user, canWrite } = useAuth();
  const [busy, setBusy] = useState<ApprovalLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approve = async (level: ApprovalLevel) => {
    setBusy(level);
    setError(null);
    try {
      await ordersService.approveOrder(order.id, level);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setBusy(null);
    }
  };

  const rows = APPROVAL_LEVELS.map(({ level, label }) => ({
    level,
    label,
    approver: order[`${level}_approver`],
    at: order[`${level}_approved_at`],
    signature: order[`${level}_approved_signature_path`],
  }));

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" />
        Approvals
      </h4>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.map(({ level, label, approver, at, signature }) => {
          const eligible =
            canWrite &&
            order.state === "purchase" &&
            !approver &&
            (user?.role === "admin" || !!user?.approval_levels.includes(level));
          return (
            <div key={level} className="rounded-md border p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              {approver ? (
                <>
                  <Signature path={signature} />
                  <p className="text-sm font-medium">{approver.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(at)}
                  </p>
                </>
              ) : eligible ? (
                <>
                  <Button
                    size="sm"
                    disabled={busy !== null || !user?.signature_path}
                    onClick={() => approve(level)}
                  >
                    {busy === level && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Approve
                  </Button>
                  {!user?.signature_path && (
                    <p className="text-xs text-muted-foreground">
                      Upload your signature first (user menu, My signature).
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {order.state === "purchase"
                    ? "Waiting for approval"
                    : "Confirm the order first"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderApprovals;
