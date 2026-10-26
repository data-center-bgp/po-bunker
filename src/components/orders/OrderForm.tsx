import { useState, useEffect, useMemo, type FormEvent } from "react";
import {
  companiesService,
  lookupsService,
  ordersService,
  partnersService,
  regionsService,
  type CodeBudget,
  type Company,
  type OptionOrder,
  type OrderLineInput,
  type OrderType,
  type Partner,
  type Priority,
  type Product,
  type Region,
  type Vessel,
} from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PurchaseOrder } from "@/services";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

interface LineFormData {
  id?: number; // existing line id when editing
  productId: string;
  vesselId: string;
  regionId: string;
  quantity: string;
  unitPrice: string;
  project: string;
  requestedById: string;
  priority: string;
  // auto-populated from product
  categoryId: string;
  codeBudgetId: string;
  uomId: string;
}

interface OrderHeaderData {
  companyId: string;
  partnerId: string;
  orderType: string;
  dateOrder: string;
  notes: string;
  optionOrder: string;
  partnerRef: string;
  dateVendor: string;
  dateBunker: string;
  discount: string;
  taxPercent: string;
}

interface OrderFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  /** Prefills the form ("Copy as new PO"); the result is always a new order. */
  template?: PurchaseOrder | null;
}

const emptyLine: LineFormData = {
  productId: "",
  vesselId: "",
  regionId: "",
  quantity: "",
  unitPrice: "",
  project: "",
  requestedById: "",
  priority: "",
  categoryId: "",
  codeBudgetId: "",
  uomId: "",
};

const initialHeader: OrderHeaderData = {
  companyId: "",
  partnerId: "",
  orderType: "",
  dateOrder: "",
  notes: "",
  optionOrder: "quotation",
  partnerRef: "",
  dateVendor: "",
  dateBunker: "",
  discount: "0",
  taxPercent: "0",
};

interface Requester {
  id: string;
  name: string;
}

// ISO timestamp -> value for <input type="datetime-local"> in local time.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const vesselLabel = (v: Vessel) =>
  v.type ? `${v.type.name} - ${v.name}` : v.name;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

const OrderForm = ({
  isOpen,
  onSuccess,
  onCancel,
  template = null,
}: OrderFormProps) => {
  const order = template;
  const [header, setHeader] = useState<OrderHeaderData>(initialHeader);
  const [lines, setLines] = useState<LineFormData[]>([{ ...emptyLine }]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<Requester[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [codeBudgets, setCodeBudgets] = useState<CodeBudget[]>([]);
  const [loadingCodeBudgets, setLoadingCodeBudgets] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regionOpenIdx, setRegionOpenIdx] = useState<number | null>(null);
  const [vesselOpenIdx, setVesselOpenIdx] = useState<number | null>(null);
  const [codeBudgetOpenIdx, setCodeBudgetOpenIdx] = useState<number | null>(
    null,
  );
  const [requestedByOpenIdx, setRequestedByOpenIdx] = useState<number | null>(
    null,
  );

  const isCopy = !!order;

  // Only company suppliers can be selected as the customer on a PO. If an
  // existing order's partner no longer matches (e.g. legacy data), keep it
  // selectable so editing doesn't silently blank out the current value.
  const vendorPartners = useMemo(() => {
    const filtered = partners.filter(
      (p) => p.active && p.is_company && p.is_supplier,
    );
    if (
      order?.partner_id != null &&
      !filtered.some((p) => p.id === order.partner_id)
    ) {
      const current = partners.find((p) => p.id === order.partner_id);
      if (current) return [current, ...filtered];
    }
    return filtered;
  }, [partners, order]);

  useEffect(() => {
    if (isOpen) {
      fetchVessels();
      fetchRegions();
      fetchCompanies();
      fetchPartners();
      fetchProducts();
      fetchCodeBudgets();
      fetchUsers();
    }
  }, [isOpen]);

  // Populate when editing
  useEffect(() => {
    if (!isOpen) return;
    if (!order) {
      setHeader(initialHeader);
      setLines([{ ...emptyLine }]);
      return;
    }
    setHeader({
      companyId: order.company_id?.toString?.() || "",
      partnerId: order.partner_id?.toString?.() || "",
      orderType: order.order_type || "",
      dateOrder: toLocalInput(new Date().toISOString()),
      notes: order.notes || "",
      optionOrder: order.option_order || "quotation",
      partnerRef: order.partner_ref || "",
      dateVendor: order.date_vendor ? toLocalInput(order.date_vendor).slice(0, 10) : "",
      dateBunker: order.date_bunker ? toLocalInput(order.date_bunker) : "",
      discount: String(order.amount_discount ?? 0),
      taxPercent: String(order.tax_percent ?? 0),
    });

    const orderLines = order.lines || [];
    if (orderLines.length === 0) {
      setLines([{ ...emptyLine }]);
    } else {
      setLines(
        orderLines.map((l) => ({
          id: l.id,
          productId: l.product_id?.toString() || "",
          vesselId: l.vessel_id?.toString() || "",
          regionId: l.region_id ? l.region_id.toString() : "",
          quantity: l.product_qty?.toString() || "",
          unitPrice: l.price_unit?.toString() || "",
          project: l.project || "",
          requestedById: l.requested_by || "",
          priority: l.priority || "",
          categoryId: l.category_id ? l.category_id.toString() : "",
          codeBudgetId: l.code_budget_id ? l.code_budget_id.toString() : "",
          uomId: l.uom_id?.toString() || "",
        })),
      );
    }
  }, [isOpen, order]);

  const fetchRegions = async () => {
    try {
      setLoadingRegions(true);
      setRegions(await regionsService.getRegions());
    } catch (err) {
      console.error("Error fetching regions:", err);
    } finally {
      setLoadingRegions(false);
    }
  };

  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      setVessels(await lookupsService.getVessels());
    } catch (err) {
      console.error("Error fetching vessels:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch vessels");
    } finally {
      setLoadingVessels(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      setCompanies(await companiesService.getCompanies());
    } catch (err) {
      console.error("Error fetching companies:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch companies",
      );
    } finally {
      setLoadingCompanies(false);
    }
  };

  const fetchPartners = async () => {
    try {
      setLoadingPartners(true);
      setPartners(await partnersService.getPartners());
    } catch (err) {
      console.error("Error fetching partners:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch partners");
    } finally {
      setLoadingPartners(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoadingProducts(true);
      setProducts(await lookupsService.getProducts());
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchCodeBudgets = async () => {
    try {
      setLoadingCodeBudgets(true);
      setCodeBudgets(await lookupsService.getCodeBudgets());
    } catch (err) {
      console.error("Error fetching code budgets:", err);
    } finally {
      setLoadingCodeBudgets(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setUsers(await lookupsService.getRequesters());
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const updateLine = (idx: number, patch: Partial<LineFormData>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    );
  };

  const handleProductChange = (idx: number, productId: string) => {
    const product = products.find((p) => p.id === parseInt(productId));
    if (product) {
      updateLine(idx, {
        productId,
        categoryId: product.category_id.toString(),
        codeBudgetId: product.code_budget_id?.toString() || "",
        uomId: product.uom_id.toString(),
      });
    } else {
      updateLine(idx, {
        productId: "",
        categoryId: "",
        codeBudgetId: "",
        uomId: "",
      });
    }
  };

  const addLine = () => {
    setLines((prev) => [...prev, { ...emptyLine }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );
  };

  const subtotal = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity);
    const p = parseFloat(l.unitPrice);
    if (Number.isNaN(q) || Number.isNaN(p)) return sum;
    return sum + q * p;
  }, 0);
  const discountValue = Math.max(parseFloat(header.discount) || 0, 0);
  const untaxed = Math.max(subtotal - discountValue, 0);
  const taxValue =
    Math.round(untaxed * (parseFloat(header.taxPercent) || 0)) / 100;
  const grandTotal = untaxed + taxValue;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (
      !header.companyId ||
      !header.partnerId ||
      !header.orderType ||
      !header.dateOrder
    ) {
      setError("Please fill in all required header fields.");
      setLoading(false);
      return;
    }

    const discountInput = parseFloat(header.discount || "0");
    const taxInput = parseFloat(header.taxPercent || "0");
    if (Number.isNaN(discountInput) || discountInput < 0) {
      setError("Discount must be zero or more.");
      setLoading(false);
      return;
    }
    if (Number.isNaN(taxInput) || taxInput < 0 || taxInput > 100) {
      setError("VAT % must be between 0 and 100.");
      setLoading(false);
      return;
    }
    if (discountInput > subtotal) {
      setError("The discount is larger than the order total.");
      setLoading(false);
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (
        !l.productId ||
        !l.vesselId ||
        !l.quantity ||
        !l.unitPrice ||
        !l.uomId
      ) {
        setError(
          `Line ${i + 1}: Please fill in product, vessel, quantity, and unit price.`,
        );
        setLoading(false);
        return;
      }
    }

    try {
      const orderLines: OrderLineInput[] = lines.map((l) => ({
        product_id: parseInt(l.productId),
        vessel_id: parseInt(l.vesselId),
        uom_id: parseInt(l.uomId),
        product_qty: parseFloat(l.quantity),
        price_unit: parseFloat(l.unitPrice),
        region_id: l.regionId ? parseInt(l.regionId) : null,
        code_budget_id: l.codeBudgetId ? parseInt(l.codeBudgetId) : null,
        category_id: l.categoryId ? parseInt(l.categoryId) : null,
        project: l.project,
        requested_by: l.requestedById || null,
        priority: (l.priority as Priority) || null,
      }));

      await ordersService.createOrder(
        {
          company_id: parseInt(header.companyId),
          partner_id: parseInt(header.partnerId),
          order_type: header.orderType as OrderType,
          date_order: new Date(header.dateOrder).toISOString(),
          notes: header.notes,
          option_order: header.optionOrder as OptionOrder,
          partner_ref: header.partnerRef.trim() || null,
          date_vendor: header.dateVendor
            ? new Date(`${header.dateVendor}T00:00:00`).toISOString()
            : null,
          date_bunker: header.dateBunker
            ? new Date(header.dateBunker).toISOString()
            : null,
          amount_discount: discountInput,
          tax_percent: taxInput,
        },
        orderLines,
      );
      setHeader(initialHeader);
      setLines([{ ...emptyLine }]);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create order",
      );
      console.error(
        "Error creating order:",
        err,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setHeader(initialHeader);
    setLines([{ ...emptyLine }]);
    setError(null);
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isCopy ? "Copy as New Order" : "Create New Order"}
          </DialogTitle>
          <DialogDescription>
            {isCopy
              ? "A copy of the cancelled order. Check the details, then submit it as a new order."
              : "Fill in the details below to submit a new purchase order. A submitted order cannot be edited: cancel it and create a new one to fix a mistake."}
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <ScrollArea className="max-h-[calc(90vh-200px)]">
          <div className="px-6 py-4">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <form id="order-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Order Details Section */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Order Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Customer <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={header.partnerId}
                      onValueChange={(val) =>
                        setHeader((h) => ({ ...h, partnerId: val }))
                      }
                      disabled={loadingPartners}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingPartners ? "Loading..." : "Select customer"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorPartners.map((partner) => (
                          <SelectItem
                            key={partner.id}
                            value={partner.id.toString()}
                          >
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Company <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={header.companyId}
                      onValueChange={(val) =>
                        setHeader((h) => ({ ...h, companyId: val }))
                      }
                      disabled={loadingCompanies}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingCompanies ? "Loading..." : "Select company"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem
                            key={company.id}
                            value={company.id.toString()}
                          >
                            {company.code_company
                              ? `${company.code_company} - ${company.name}`
                              : company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Order Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={header.orderType}
                      onValueChange={(val) =>
                        setHeader((h) => ({ ...h, orderType: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select order type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bunker_fuel">Bunker Fuel</SelectItem>
                        <SelectItem value="bunker_water">
                          Bunker Fresh Water
                        </SelectItem>
                        <SelectItem value="logistic">Logistic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateOrder">
                      Order Date & Time{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="datetime-local"
                      id="dateOrder"
                      name="dateOrder"
                      value={header.dateOrder}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, dateOrder: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Vendor reference & pricing */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Vendor Reference & Pricing
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vendor Document</Label>
                    <Select
                      value={header.optionOrder}
                      onValueChange={(val) =>
                        setHeader((h) => ({ ...h, optionOrder: val }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quotation">Quotation</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="partnerRef">Vendor Document No.</Label>
                    <Input
                      id="partnerRef"
                      value={header.partnerRef}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, partnerRef: e.target.value }))
                      }
                      placeholder="Number on the vendor's quotation/invoice"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateVendor">Vendor Document Date</Label>
                    <Input
                      type="date"
                      id="dateVendor"
                      value={header.dateVendor}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, dateVendor: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateBunker">Bunker Date & Time</Label>
                    <Input
                      type="datetime-local"
                      id="dateBunker"
                      value={header.dateBunker}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, dateBunker: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="discount">Discount (Rp)</Label>
                    <Input
                      type="number"
                      id="discount"
                      min="0"
                      step="0.01"
                      value={header.discount}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, discount: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="taxPercent">VAT (%)</Label>
                    <Input
                      type="number"
                      id="taxPercent"
                      min="0"
                      max="100"
                      step="0.01"
                      value={header.taxPercent}
                      onChange={(e) =>
                        setHeader((h) => ({ ...h, taxPercent: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Product Lines Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-foreground">
                    Product Lines{" "}
                    <span className="text-muted-foreground font-normal">
                      ({lines.length})
                    </span>
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                </div>

                <div className="space-y-4">
                  {lines.map((line, idx) => {
                    const selectedProduct = products.find(
                      (p) => p.id.toString() === line.productId,
                    );
                    const lineSubtotal =
                      parseFloat(line.quantity || "0") *
                      parseFloat(line.unitPrice || "0");

                    return (
                      <div
                        key={idx}
                        className="rounded-lg border bg-muted/20 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Line {idx + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              Subtotal:{" "}
                              <span className="font-semibold text-foreground">
                                {formatCurrency(
                                  Number.isNaN(lineSubtotal) ? 0 : lineSubtotal,
                                )}
                              </span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeLine(idx)}
                              disabled={lines.length === 1}
                              title={
                                lines.length === 1
                                  ? "At least one line is required"
                                  : "Remove line"
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Row 1 */}
                          <div className="space-y-2">
                            <Label>
                              Product{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Select
                              value={line.productId}
                              onValueChange={(val) =>
                                handleProductChange(idx, val)
                              }
                              disabled={loadingProducts}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    loadingProducts
                                      ? "Loading..."
                                      : "Select product"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((product) => (
                                  <SelectItem
                                    key={product.id}
                                    value={product.id.toString()}
                                  >
                                    {product.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Requested By</Label>
                            <Popover
                              open={requestedByOpenIdx === idx}
                              onOpenChange={(open) =>
                                setRequestedByOpenIdx(open ? idx : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  disabled={loadingUsers}
                                  className="w-full justify-between font-normal"
                                >
                                  <span className="truncate">
                                    {loadingUsers
                                      ? "Loading..."
                                      : line.requestedById
                                        ? (users.find(
                                            (u) =>
                                              u.id.toString() ===
                                              line.requestedById,
                                          )?.name ?? "Select person")
                                        : "Select person"}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                  <CommandInput placeholder="Search person..." />
                                  <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandEmpty>
                                      No person found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {users.map((u) => (
                                        <CommandItem
                                          key={u.id}
                                          value={u.name}
                                          onSelect={() => {
                                            updateLine(idx, {
                                              requestedById:
                                                line.requestedById ===
                                                u.id.toString()
                                                  ? ""
                                                  : u.id.toString(),
                                            });
                                            setRequestedByOpenIdx(null);
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              line.requestedById ===
                                              u.id.toString()
                                                ? "opacity-100"
                                                : "opacity-0"
                                            }`}
                                          />
                                          {u.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Row 2 */}
                          <div className="space-y-2">
                            <Label>
                              Vessel <span className="text-destructive">*</span>
                            </Label>
                            <Popover
                              open={vesselOpenIdx === idx}
                              onOpenChange={(open) =>
                                setVesselOpenIdx(open ? idx : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  disabled={loadingVessels}
                                  className="w-full justify-between font-normal"
                                >
                                  <span className="truncate">
                                    {loadingVessels
                                      ? "Loading..."
                                      : line.vesselId
                                        ? (() => {
                                            const v = vessels.find(
                                              (v) =>
                                                v.id.toString() ===
                                                line.vesselId,
                                            );
                                            return v
                                              ? vesselLabel(v)
                                              : "Select vessel";
                                          })()
                                        : "Select vessel"}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                  <CommandInput placeholder="Search vessel..." />
                                  <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandEmpty>
                                      No vessel found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {vessels
                                        .filter(
                                          (vessel) =>
                                            vessel.active ||
                                            lines.some(
                                              (l) => l.vesselId === vessel.id.toString(),
                                            ),
                                        )
                                        .map((vessel) => (
                                        <CommandItem
                                          key={vessel.id}
                                          value={`${vesselLabel(vessel)} ${vessel.code ?? ""}`}
                                          onSelect={() => {
                                            updateLine(idx, {
                                              vesselId:
                                                line.vesselId ===
                                                vessel.id.toString()
                                                  ? ""
                                                  : vessel.id.toString(),
                                            });
                                            setVesselOpenIdx(null);
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              line.vesselId ===
                                              vessel.id.toString()
                                                ? "opacity-100"
                                                : "opacity-0"
                                            }`}
                                          />
                                          {vesselLabel(vessel)}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="space-y-2">
                            <Label>Region</Label>
                            <Popover
                              open={regionOpenIdx === idx}
                              onOpenChange={(open) =>
                                setRegionOpenIdx(open ? idx : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  disabled={loadingRegions}
                                  className="w-full justify-between font-normal"
                                >
                                  <span className="truncate">
                                    {loadingRegions
                                      ? "Loading..."
                                      : line.regionId
                                        ? (regions.find(
                                            (r) =>
                                              r.id.toString() === line.regionId,
                                          )?.name ?? "Select region")
                                        : "Select region"}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                  <CommandInput placeholder="Search region..." />
                                  <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandEmpty>
                                      No region found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {regions.map((region) => (
                                        <CommandItem
                                          key={region.id}
                                          value={region.name}
                                          onSelect={() => {
                                            updateLine(idx, {
                                              regionId:
                                                line.regionId ===
                                                region.id.toString()
                                                  ? ""
                                                  : region.id.toString(),
                                            });
                                            setRegionOpenIdx(null);
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              line.regionId ===
                                              region.id.toString()
                                                ? "opacity-100"
                                                : "opacity-0"
                                            }`}
                                          />
                                          {region.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Row 3 */}
                          <div className="space-y-2">
                            <Label>Project</Label>
                            <Input
                              type="text"
                              value={line.project}
                              onChange={(e) =>
                                updateLine(idx, { project: e.target.value })
                              }
                              placeholder="Enter project name"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Code Budget</Label>
                            <Popover
                              open={codeBudgetOpenIdx === idx}
                              onOpenChange={(open) =>
                                setCodeBudgetOpenIdx(open ? idx : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  role="combobox"
                                  disabled={loadingCodeBudgets}
                                  className="w-full justify-between font-normal"
                                >
                                  <span className="truncate">
                                    {loadingCodeBudgets
                                      ? "Loading..."
                                      : line.codeBudgetId
                                        ? (codeBudgets.find(
                                            (cb) =>
                                              cb.id.toString() ===
                                              line.codeBudgetId,
                                          )?.name ?? "Select code budget")
                                        : "Select code budget"}
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <Command>
                                  <CommandInput placeholder="Search code budget..." />
                                  <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandEmpty>
                                      No code budget found.
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {codeBudgets.map((cb) => (
                                        <CommandItem
                                          key={cb.id}
                                          value={cb.name}
                                          onSelect={() => {
                                            updateLine(idx, {
                                              codeBudgetId:
                                                line.codeBudgetId ===
                                                cb.id.toString()
                                                  ? ""
                                                  : cb.id.toString(),
                                            });
                                            setCodeBudgetOpenIdx(null);
                                          }}
                                        >
                                          <Check
                                            className={`mr-2 h-4 w-4 ${
                                              line.codeBudgetId ===
                                              cb.id.toString()
                                                ? "opacity-100"
                                                : "opacity-0"
                                            }`}
                                          />
                                          {cb.name}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>

                          {/* Row 4 */}
                          <div className="space-y-2">
                            <Label>Priority</Label>
                            <Select
                              value={line.priority}
                              onValueChange={(val) =>
                                updateLine(idx, { priority: val })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="low">L — Low</SelectItem>
                                <SelectItem value="medium">
                                  M — Medium
                                </SelectItem>
                                <SelectItem value="high">H — High</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>
                              Volume / Quantity{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(idx, { quantity: e.target.value })
                              }
                              placeholder="Enter quantity"
                              required
                            />
                          </div>

                          {/* Row 5 */}
                          <div className="space-y-2">
                            <Label>Unit of Measure</Label>
                            <Input
                              value={selectedProduct?.uom?.name || ""}
                              readOnly
                              placeholder="Auto-populated"
                              className="bg-muted"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>
                              Price{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(idx, { unitPrice: e.target.value })
                              }
                              placeholder="Enter unit price"
                              required
                            />
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-col items-end gap-1 text-sm text-muted-foreground">
                  <div>
                    Lines total (active lines):{" "}
                    <span className="text-foreground">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div>
                    Discount:{" "}
                    <span className="text-foreground">
                      - {formatCurrency(discountValue)}
                    </span>
                  </div>
                  <div>
                    VAT {parseFloat(header.taxPercent) || 0}%:{" "}
                    <span className="text-foreground">
                      {formatCurrency(taxValue)}
                    </span>
                  </div>
                  <div>
                    Grand total:{" "}
                    <span className="font-semibold text-foreground text-base">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">
                  Notes <span className="text-destructive">*</span>
                </Label>
                <div className="[&_.ql-toolbar]:rounded-t-md [&_.ql-container]:rounded-b-md [&_.ql-toolbar]:border-border [&_.ql-container]:border-border [&_.ql-editor]:min-h-[100px]">
                  <ReactQuill
                    theme="snow"
                    value={header.notes}
                    onChange={(value) =>
                      setHeader((h) => ({ ...h, notes: value }))
                    }
                    placeholder="Enter order notes"
                    modules={{
                      toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ["bold", "italic", "underline", "strike"],
                        [{ list: "ordered" }, { list: "bullet" }],
                        ["clean"],
                      ],
                    }}
                  />
                </div>
              </div>
            </form>
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter className="px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" form="order-form" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderForm;
