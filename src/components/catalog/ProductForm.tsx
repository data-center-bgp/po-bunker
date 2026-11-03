import { useEffect, useState, type FormEvent } from "react";
import {
  catalogService,
  type CodeBudget,
  type Product,
  type ProductCategory,
  type ProductInput,
  type Uom,
} from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Package } from "lucide-react";

const NONE_VALUE = "__none__";

interface ProductFormProps {
  isOpen: boolean;
  product: Product | null;
  categories: ProductCategory[];
  units: Uom[];
  codeBudgets: CodeBudget[];
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  default_code: string;
  category_id: string;
  uom_id: string;
  code_budget_id: string;
  standard_price: string;
  list_price: string;
  merk: string;
  model: string;
  serial_number: string;
  specs: string;
  description: string;
  active: boolean;
}

const emptyForm: FormData = {
  name: "",
  default_code: "",
  category_id: "",
  uom_id: "",
  code_budget_id: NONE_VALUE,
  standard_price: "0",
  list_price: "0",
  merk: "",
  model: "",
  serial_number: "",
  specs: "",
  description: "",
  active: true,
};

const toForm = (p: Product): FormData => ({
  name: p.name,
  default_code: p.default_code ?? "",
  category_id: String(p.category_id),
  uom_id: String(p.uom_id),
  code_budget_id: p.code_budget_id ? String(p.code_budget_id) : NONE_VALUE,
  standard_price: String(p.standard_price ?? 0),
  list_price: String(p.list_price ?? 0),
  merk: p.merk ?? "",
  model: p.model ?? "",
  serial_number: p.serial_number ?? "",
  specs: p.specs ?? "",
  description: p.description ?? "",
  active: p.active,
});

const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim());

const ProductForm = ({
  isOpen,
  product,
  categories,
  units,
  codeBudgets,
  onSuccess,
  onCancel,
}: ProductFormProps) => {
  const isEditing = !!product;
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setForm(product ? toForm(product) : emptyForm);
  }, [isOpen, product]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const standard = Number(form.standard_price);
    const list = Number(form.list_price);
    if (!form.name.trim()) return setError("Nama produk wajib diisi");
    if (!form.category_id) return setError("Kategori wajib dipilih");
    if (!form.uom_id) return setError("Satuan wajib dipilih");
    if (!Number.isFinite(standard) || standard < 0 || !Number.isFinite(list) || list < 0) {
      return setError("Harga tidak boleh negatif");
    }

    const input: ProductInput = {
      name: form.name.trim(),
      default_code: blankToNull(form.default_code),
      category_id: Number(form.category_id),
      uom_id: Number(form.uom_id),
      code_budget_id:
        form.code_budget_id === NONE_VALUE ? null : Number(form.code_budget_id),
      standard_price: standard,
      list_price: list,
      merk: blankToNull(form.merk),
      model: blankToNull(form.model),
      serial_number: blankToNull(form.serial_number),
      specs: blankToNull(form.specs),
      description: blankToNull(form.description),
      active: form.active,
    };

    setSaving(true);
    try {
      if (product) await catalogService.updateProduct(product.id, input);
      else await catalogService.createProduct(input);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan produk");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !saving && onCancel()}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {isEditing ? "Ubah Produk" : "Tambah Produk"}
          </DialogTitle>
          <DialogDescription>
            Satuan dan kode budget produk menjadi isian awal saat produk dipilih
            di baris PO. PO yang sudah dibuat tidak ikut berubah.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col">
          <div className="max-h-[calc(90vh-200px)] space-y-4 overflow-auto px-6 py-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="product-name">
                  Nama <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="product-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="mis. Solar (HSD)"
                  disabled={saving}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-code">Kode</Label>
                <Input
                  id="product-code"
                  value={form.default_code}
                  onChange={(e) => set("default_code", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>
                  Kategori <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => set("category_id", v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  Satuan <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.uom_id}
                  onValueChange={(v) => set("uom_id", v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kode Budget</Label>
                <Select
                  value={form.code_budget_id}
                  onValueChange={(v) => set("code_budget_id", v)}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>Tidak ada</SelectItem>
                    {codeBudgets
                      .filter(
                        (b) => b.active || String(b.id) === form.code_budget_id,
                      )
                      .map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          {b.code ? `${b.code} - ${b.name}` : b.name}
                          {!b.active && " (nonaktif)"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="product-standard">Harga standar (Rp)</Label>
                <Input
                  id="product-standard"
                  type="number"
                  min="0"
                  step="any"
                  value={form.standard_price}
                  onChange={(e) => set("standard_price", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-list">Harga jual (Rp)</Label>
                <Input
                  id="product-list"
                  type="number"
                  min="0"
                  step="any"
                  value={form.list_price}
                  onChange={(e) => set("list_price", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="product-merk">Merk</Label>
                <Input
                  id="product-merk"
                  value={form.merk}
                  onChange={(e) => set("merk", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-model">Model</Label>
                <Input
                  id="product-model"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-serial">No. seri</Label>
                <Input
                  id="product-serial"
                  value={form.serial_number}
                  onChange={(e) => set("serial_number", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-specs">
                Spesifikasi{" "}
                <span className="font-normal text-muted-foreground">
                  (dicetak di kolom Jenis pada PO)
                </span>
              </Label>
              <Input
                id="product-specs"
                value={form.specs}
                onChange={(e) => set("specs", e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-description">Deskripsi</Label>
              <Textarea
                id="product-description"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                disabled={saving}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                checked={form.active}
                onChange={(e) => set("active", e.target.checked)}
                disabled={saving}
              />
              Aktif (produk nonaktif tidak muncul saat membuat PO)
            </label>
          </div>

          <DialogFooter className="px-6 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={saving}
            >
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : isEditing ? (
                "Simpan"
              ) : (
                "Tambah"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductForm;
