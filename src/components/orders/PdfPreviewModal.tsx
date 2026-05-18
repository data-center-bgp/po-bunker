import React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

interface PdfPreviewModalProps {
  pdfUrl: string | null;
  open: boolean;
  onClose: () => void;
}

const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  pdfUrl,
  open,
  onClose,
}) => {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-full h-[92vh] flex flex-col gap-0 p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40 shrink-0">
          <span className="text-sm font-medium">PDF Preview</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <XCircle className="h-4 w-4 mr-1" /> Close
          </Button>
        </div>
        {pdfUrl && (
          <iframe
            src={pdfUrl}
            className="w-full flex-1 border-0"
            title="PDF Preview"
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewModal;
