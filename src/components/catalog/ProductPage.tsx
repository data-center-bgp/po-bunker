import { useCallback, useEffect, useMemo, useState } from "react";
import {
  catalogService,
  type CodeBudget,
  type Product,
  type ProductCategory,
  type Uom,
} from "@/services";
import { useAuth } from "@/contexts/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
} from "lucide-react";
import ProductForm from "./ProductForm";

const PAGE_SIZE = 20;

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const ProductPage = () => {
  const { canWrite } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [units, setUnits] = useState<Uom[]>([]);
  const [codeBudgets, setCodeBudgets] = useState<CodeBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [p, c, u, b] = await Promise.all([
        catalogService.getProducts(),
        catalogService.getCategories(),
        catalogService.getUnits(),
        catalogService.getCodeBudgets(),
      ]);
      setProducts(p);
      setCategories(c);
      setUnits(u);
      setCodeBudgets(b);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data produk");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.default_code ?? "").toLowerCase().includes(q),
    );
  }, [products, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const start = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, filtered.length);

  const openForm = (p: Product | null) => {
    setEditing(p);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };
  const handleSuccess = () => {
    closeForm();
    void fetchAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Produk</h2>
          <p className="text-muted-foreground">
            Produk yang dapat dipilih pada baris PO, beserta satuan dan kode
            budget bawaannya.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => openForm(null)}>
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cari berdasarkan nama atau kode produk..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCurrentPage(1);
          }}
          className="pl-9"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Hasil</h3>
          {!loading && (
            <Badge variant="secondary">{filtered.length} produk</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat data produk...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {products.length === 0
              ? "Belum ada produk. Tambahkan produk agar bisa dipilih pada PO."
              : "Tidak ada produk yang sesuai dengan pencarian."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead>Kode Budget</TableHead>
                    <TableHead className="text-right">Harga standar</TableHead>
                    <TableHead>Status</TableHead>
                    {canWrite && (
                      <TableHead className="text-right">Aksi</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((p) => (
                    <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.default_code || "-"}</TableCell>
                      <TableCell>{p.category?.name || "-"}</TableCell>
                      <TableCell>{p.uom?.name || "-"}</TableCell>
                      <TableCell>{p.code_budget?.name || "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {money.format(p.standard_price)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.active ? "success" : "secondary"}>
                          {p.active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openForm(p)}
                            title="Ubah"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Menampilkan {start}–{end} dari {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <span className="text-muted-foreground">
                  Halaman {safePage} dari {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <ProductForm
        isOpen={showForm}
        product={editing}
        categories={categories}
        units={units}
        codeBudgets={codeBudgets}
        onSuccess={handleSuccess}
        onCancel={closeForm}
      />
    </div>
  );
};

export default ProductPage;
