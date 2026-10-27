import {
  ORDER_STATE_LABELS,
  type OrderState,
  type PurchaseOrder,
} from "@/services";
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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Printer,
  Download,
  CheckCircle,
  Copy,
  XCircle,
} from "lucide-react";
import PdfPreviewModal from "./PdfPreviewModal";
import { useState, Fragment, type ReactNode } from "react";

interface OrdersTableProps {
  orders: PurchaseOrder[];
  loading: boolean;
  currentPage: number;
  totalCount: number;
  limit: number;
  onPageChange: (page: number) => void;
  onView?: (orderId: number) => void;
  onComplete?: (orderId: number) => void;
  onCancel?: (orderId: number) => void;
  onCopy?: (order: PurchaseOrder) => void;
}

const STATE_VARIANT: Record<OrderState, "info" | "success" | "destructive"> = {
  submitted: "info",
  completed: "success",
  cancelled: "destructive",
};

type Filter = "all" | OrderState;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "submitted", label: "Diajukan" },
  { key: "completed", label: "Selesai" },
  { key: "cancelled", label: "Dibatalkan" },
];

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

const IconAction = ({
  tip,
  onClick,
  disabled,
  className,
  children,
}: {
  tip: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        className={`h-8 w-8 ${className ?? ""}`}
        onClick={onClick}
        disabled={disabled}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{tip}</TooltipContent>
  </Tooltip>
);

const OrdersTable = ({
  orders,
  loading,
  currentPage,
  totalCount,
  limit,
  onPageChange,
  onView,
  onComplete,
  onCancel,
  onCopy,
}: OrdersTableProps) => {
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const [excelLoadingId, setExcelLoadingId] = useState<number | null>(null);
  const [pdfModalUrl, setPdfModalUrl] = useState<string | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [filter, setFilter] = useState<Filter>("all");

  const toggleExpanded = (id: number) =>
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleOpenPdf = async (order: PurchaseOrder) => {
    setPdfLoadingId(order.id);
    try {
      // Loaded on demand: jspdf and exceljs are large.
      const { generateOrderPdf } = await import("@/lib/exportOrderPdf");
      const buffer = await generateOrderPdf(order);
      const blob = new Blob([buffer], { type: "application/pdf" });
      setPdfModalUrl(URL.createObjectURL(blob));
      setPdfModalOpen(true);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleClosePdfModal = () => {
    setPdfModalOpen(false);
    if (pdfModalUrl) {
      URL.revokeObjectURL(pdfModalUrl);
      setPdfModalUrl(null);
    }
  };

  const handleDownloadExcel = async (order: PurchaseOrder) => {
    setExcelLoadingId(order.id);
    try {
      const { generateOrderExcel } = await import("@/lib/exportOrderExcel");
      const buffer = await generateOrderExcel(order);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${order.name.replace(/[\\/:*?"<>|]+/g, "-")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Excel download failed:", err);
    } finally {
      setExcelLoadingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const startItem = orders.length > 0 ? (currentPage - 1) * limit + 1 : 0;
  const endItem = Math.min(currentPage * limit, totalCount);

  const filteredOrders = orders.filter(
    (o) => filter === "all" || o.state === filter,
  );
  const countOf = (f: Filter) =>
    f === "all" ? orders.length : orders.filter((o) => o.state === f).length;

  if (loading) {
    return (
      <Card className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  const renderOrderRow = (order: PurchaseOrder) => {
    const lines = order.lines || [];
    const line = lines[0];
    const extraCount = Math.max(0, lines.length - 1);
    const isExpanded = !!expandedRows[order.id];
    const submitted = order.state === "submitted";
    return (
      <Fragment key={order.id}>
        <TableRow>
          <TableCell className="w-8 p-2">
            {lines.length > 1 ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => toggleExpanded(order.id)}
                title={isExpanded ? "Sembunyikan baris" : "Tampilkan semua baris"}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            ) : null}
          </TableCell>
          <TableCell>
            {new Date(order.date_order).toLocaleDateString("id-ID", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </TableCell>
          <TableCell>{order.company?.name || "-"}</TableCell>
          <TableCell className="font-medium">{order.name}</TableCell>
          <TableCell>
            <Badge variant={STATE_VARIANT[order.state]}>
              {ORDER_STATE_LABELS[order.state]}
            </Badge>
          </TableCell>
          <TableCell>{line?.vessel?.name || "-"}</TableCell>
          <TableCell>
            {line?.product?.name || "-"}
            {extraCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                +{extraCount} lainnya
              </Badge>
            )}
          </TableCell>
          <TableCell>
            {line ? `${line.product_qty} ${line.uom?.name ?? ""}` : "-"}
            {order.state === "completed" && line?.actual_qty != null && (
              <span className="block text-xs text-muted-foreground">
                aktual {line.actual_qty}
              </span>
            )}
          </TableCell>
          <TableCell className="max-w-[200px] truncate">
            {order.state === "cancelled" && order.cancel_reason
              ? `Dibatalkan: ${order.cancel_reason}`
              : order.notes
                ? stripHtml(order.notes)
                : "-"}
          </TableCell>
          <TableCell>
            <div className="flex items-center justify-center gap-1">
              <IconAction tip="Lihat"onClick={() => onView?.(order.id)}>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </IconAction>
              {onComplete && submitted && (
                <IconAction
                  tip="Selesaikan (unggah DO, kuantitas aktual)"
                  className="text-green-600 hover:text-green-700"
                  onClick={() => onComplete(order.id)}
                >
                  <CheckCircle className="h-4 w-4" />
                </IconAction>
              )}
              {onCancel && submitted && (
                <IconAction
                  tip="Batalkan PO"
                  className="text-orange-600 hover:text-orange-700"
                  onClick={() => onCancel(order.id)}
                >
                  <XCircle className="h-4 w-4" />
                </IconAction>
              )}
              {onCopy && order.state === "cancelled" && (
                <IconAction tip="Salin sebagai PO baru" onClick={() => onCopy(order)}>
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </IconAction>
              )}
              <IconAction
                tip="Pratinjau PDF"
                onClick={() => handleOpenPdf(order)}
                disabled={pdfLoadingId === order.id}
              >
                {pdfLoadingId === order.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Printer className="h-4 w-4 text-muted-foreground" />
                )}
              </IconAction>
              <IconAction
                tip="Unduh Excel"
                onClick={() => handleDownloadExcel(order)}
                disabled={excelLoadingId === order.id}
              >
                {excelLoadingId === order.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Download className="h-4 w-4 text-muted-foreground" />
                )}
              </IconAction>
            </div>
          </TableCell>
        </TableRow>
        {isExpanded &&
          lines.slice(1).map((extra, i) => (
            <TableRow key={`${order.id}-line-${extra.id}`} className="bg-muted/30">
              <TableCell />
              <TableCell colSpan={4} className="text-xs text-muted-foreground">
                Baris {i + 2}
              </TableCell>
              <TableCell>{extra.vessel?.name || "-"}</TableCell>
              <TableCell>{extra.product?.name || "-"}</TableCell>
              <TableCell>
                {`${extra.product_qty} ${extra.uom?.name ?? ""}`}
                {order.state === "completed" && extra.actual_qty != null && (
                  <span className="block text-xs text-muted-foreground">
                    aktual {extra.actual_qty}
                  </span>
                )}
              </TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          ))}
      </Fragment>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              variant={filter === key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(key)}
            >
              {label}
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {countOf(key)}
              </Badge>
            </Button>
          ))}
        </div>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-8" />
                <TableHead>Tanggal PO</TableHead>
                <TableHead>Perusahaan</TableHead>
                <TableHead>Nomor PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Kapal</TableHead>
                <TableHead>Produk</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {orders.length === 0
                      ? "Tidak ada PO. Buat PO pertama Anda untuk memulai."
                      : "Tidak ada PO yang sesuai dengan filter."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map(renderOrderRow)
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="flex items-center justify-between p-4">
          <p className="text-sm text-muted-foreground">
            Menampilkan {startItem} sampai {endItem} dari {totalCount} PO
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            {(() => {
              const pages: (number | string)[] = [];
              if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (currentPage > 3) pages.push("...");
                const start = Math.max(2, currentPage - 1);
                const end = Math.min(totalPages - 1, currentPage + 1);
                for (let i = start; i <= end; i++) pages.push(i);
                if (currentPage < totalPages - 2) pages.push("...");
                pages.push(totalPages);
              }
              return pages.map((page, idx) =>
                typeof page === "string" ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-2 text-muted-foreground"
                  >
                    ...
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    className="w-9"
                    onClick={() => onPageChange(page)}
                  >
                    {page}
                  </Button>
                ),
              );
            })()}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onPageChange(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <PdfPreviewModal
          pdfUrl={pdfModalUrl}
          open={pdfModalOpen}
          onClose={handleClosePdfModal}
        />
      </div>
    </TooltipProvider>
  );
};

export default OrdersTable;
