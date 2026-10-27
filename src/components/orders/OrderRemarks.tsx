import { useState, type FormEvent } from "react";
import { Loader2, MessageSquare, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import {
  ordersService,
  type PurchaseOrder,
  type RemarkColor,
} from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrderRemarksProps {
  order: PurchaseOrder;
  onChanged: () => void;
}

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local

const OrderRemarks = ({ order, onChanged }: OrderRemarksProps) => {
  const { canWrite } = useAuth();
  const [text, setText] = useState("");
  const [color, setColor] = useState<RemarkColor>("merah");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    run(async () => {
      await ordersService.addRemark(order.id, text.trim(), color, date);
      setText("");
    });
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4" />
        Remark
      </h4>
      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {order.remarks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada remark.</p>
      ) : (
        <ul className="space-y-1.5">
          {order.remarks.map((r) => (
            <li
              key={r.id}
              className={`flex items-start justify-between gap-2 text-sm font-medium italic ${
                r.color === "biru" ? "text-blue-600" : "text-red-600"
              }`}
            >
              <span>
                Catatan: {new Date(r.remark_date).toLocaleDateString("id-ID")}{" "}
                {r.remark}
              </span>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive"
                  disabled={busy}
                  title="Hapus remark"
                  onClick={() => run(() => ordersService.deleteRemark(r.id))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <form onSubmit={handleAdd} className="mt-3 flex flex-wrap gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <Select
            value={color}
            onValueChange={(v) => setColor(v as RemarkColor)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="merah">Merah</SelectItem>
              <SelectItem value="biru">Biru</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tambah remark..."
            className="min-w-[200px] flex-1"
          />
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Tambah
          </Button>
        </form>
      )}
    </div>
  );
};

export default OrderRemarks;
