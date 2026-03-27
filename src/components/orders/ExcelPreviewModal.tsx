import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { ordersApi } from "@/services/api/ordersApi";
import * as XLSX from "xlsx";

interface Props {
  orderId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExcelPreviewModal: React.FC<Props> = ({
  orderId,
  open,
  onOpenChange,
}) => {
  const [loading, setLoading] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setHtmlPreview(null);
      setFileBuffer(null);
      setErrorMessage(null);
      try {
        const buffer = await ordersApi.generateExcel(orderId);
        if (cancelled) return;
        setFileBuffer(buffer);

        try {
          const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
          const firstSheetName = wb.SheetNames[0];
          const sheet = wb.Sheets[firstSheetName];
          const html = XLSX.utils.sheet_to_html(sheet);
          setHtmlPreview(html);
        } catch {
          // If parsing fails, we still keep the fileBuffer so user can download
          setHtmlPreview("<p>Preview not available for this file.</p>");
        }
      } catch (err) {
        setHtmlPreview(null);
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const handleDownload = () => {
    if (!fileBuffer) return;
    const blob = new Blob([fileBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-order-${orderId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excel Preview</DialogTitle>
          <DialogDescription>
            Preview the generated Excel file for this purchase order.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 max-h-[60vh] overflow-auto border rounded-md p-3 bg-white">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : errorMessage ? (
            <p className="text-sm text-destructive">Error: {errorMessage}</p>
          ) : htmlPreview ? (
            <div dangerouslySetInnerHTML={{ __html: htmlPreview }} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No preview available.
            </p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={handleDownload} disabled={!fileBuffer}>
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelPreviewModal;
