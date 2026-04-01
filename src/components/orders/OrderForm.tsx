import { useState, useEffect, type FormEvent } from "react";
import {
  ordersApi,
  type Vessel,
  type Company,
  type Partner,
  type Product,
} from "@/services/api";
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
import type { PurchaseOrder } from "@/services/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Loader2, Package } from "lucide-react";

interface OrderFormData {
  companyId: string;
  partnerId: string;
  orderType: string;
  productId: string;
  dateOrder: string;
  vesselId: string;
  quantity: string;
  unitPrice: string;
  project: string;
  notes: string;
  categoryId: string;
  codeBudgetId: string;
  uomId: string;
}

interface OrderFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  order?: PurchaseOrder | null;
}

const initialFormData: OrderFormData = {
  companyId: "",
  partnerId: "",
  orderType: "",
  productId: "",
  dateOrder: "",
  vesselId: "",
  quantity: "",
  unitPrice: "",
  project: "",
  notes: "",
  categoryId: "",
  codeBudgetId: "",
  uomId: "",
};

const OrderForm = ({
  isOpen,
  onSuccess,
  onCancel,
  order = null,
}: OrderFormProps) => {
  const [formData, setFormData] = useState<OrderFormData>(initialFormData);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingPartners, setLoadingPartners] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchVessels();
      fetchCompanies();
      fetchPartners();
      fetchProducts();
    }
  }, [isOpen]);

  // populate when order or products change while form is open
  useEffect(() => {
    if (!isOpen || !order) return;
    const firstLine = order.order_lines?.[0];
    setFormData({
      companyId: order.company_id?.toString?.() || "",
      partnerId: order.partner_id?.toString?.() || "",
      orderType: order.order_type || "",
      productId: firstLine?.product_id?.toString?.() || "",
      dateOrder: order.date_order
        ? order.date_order.replace(" ", "T").slice(0, 16)
        : "",
      vesselId: firstLine?.vessel_id?.toString?.() || "",
      quantity: firstLine?.product_qty?.toString?.() || "",
      unitPrice: firstLine?.price_unit?.toString?.() || "",
      project: firstLine?.project_name || "",
      notes: order.notes || "",
      categoryId: firstLine?.divisi_id?.toString?.() || "",
      codeBudgetId: firstLine?.code_budget_id
        ? firstLine.code_budget_id.toString()
        : "",
      uomId: firstLine?.product_uom?.toString?.() || "",
    });

    if (firstLine && products.length > 0) {
      const prod = products.find((p) => p.id === firstLine?.product_id);
      if (prod) setSelectedProduct(prod);
    }
  }, [isOpen, order, products]);

  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      const response = await ordersApi.getVessels();
      setVessels(response.shipping_vessels || []);
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
      const response = await ordersApi.getCompanies();
      setCompanies(response.companies || []);
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
      const response = await ordersApi.getPartners();
      setPartners(response.partners || []);
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
      const response = await ordersApi.getProducts();
      setProducts(response.products || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch products");
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === parseInt(productId));

    if (product) {
      setSelectedProduct(product);
      setFormData((prev) => ({
        ...prev,
        productId: productId,
        categoryId: product.categ_id.toString(),
        codeBudgetId: product.code_budget_id?.toString() || "",
        uomId: product.uom_id.toString(),
      }));
    } else {
      setSelectedProduct(null);
      setFormData((prev) => ({
        ...prev,
        productId: "",
        categoryId: "",
        codeBudgetId: "",
        uomId: "",
      }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate required fields
    if (
      !formData.companyId ||
      !formData.partnerId ||
      !formData.orderType ||
      !formData.productId ||
      !formData.dateOrder ||
      !formData.vesselId ||
      !formData.quantity ||
      !formData.unitPrice ||
      !formData.uomId
    ) {
      setError("Please fill in all required fields.");
      setLoading(false);
      return;
    }

    try {
      const orderLine = {
        ...(isEditing && order?.order_lines?.[0]?.id
          ? { id: order.order_lines[0].id }
          : {}),
        product_id: parseInt(formData.productId),
        product_qty: parseFloat(formData.quantity),
        price_unit: parseFloat(formData.unitPrice),
        total_price:
          parseFloat(formData.quantity) * parseFloat(formData.unitPrice),
        vessel_id: parseInt(formData.vesselId),
        category_id: parseInt(formData.categoryId),
        code_budget_id: formData.codeBudgetId
          ? parseInt(formData.codeBudgetId)
          : null,
        uom_id: parseInt(formData.uomId),
        project: formData.project,
      };

      const orderData = {
        company_id: parseInt(formData.companyId),
        partner_id: parseInt(formData.partnerId),
        order_type: formData.orderType,
        date_order: formData.dateOrder.replace("T", " ") + ":00",
        notes: formData.notes,
        picking_type_id: 1,
        order_lines: [orderLine],
      };
      console.log("Submitting order data:", JSON.stringify(orderData, null, 2));

      if (order && order.id) {
        await ordersApi.updateOrder(order.id, orderData);
      } else {
        await ordersApi.createOrder(orderData);
      }
      setFormData(initialFormData);
      setSelectedProduct(null);
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : order
            ? "Failed to update order"
            : "Failed to create order",
      );
      console.error(
        order ? "Error updating order:" : "Error creating order:",
        err,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(initialFormData);
    setSelectedProduct(null);
    setError(null);
    onCancel();
  };

  const isEditing = !!order && !!order.id;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {isEditing ? "Edit Order" : "Create New Order"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details below to modify this purchase order."
              : "Fill in the details below to create a new purchase order."}
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
                  {/* Customer */}
                  <div className="space-y-2">
                    <Label>
                      Customer <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.partnerId}
                      onValueChange={(val) =>
                        handleSelectChange("partnerId", val)
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
                        {partners.map((partner) => (
                          <SelectItem
                            key={partner.id}
                            value={partner.id.toString()}
                          >
                            {partner.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Company */}
                  <div className="space-y-2">
                    <Label>
                      Company <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.companyId}
                      onValueChange={(val) =>
                        handleSelectChange("companyId", val)
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
                            {company.code_company} - {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Order Type */}
                  <div className="space-y-2">
                    <Label>
                      Order Type <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.orderType}
                      onValueChange={(val) =>
                        handleSelectChange("orderType", val)
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

                  {/* Order Date */}
                  <div className="space-y-2">
                    <Label htmlFor="dateOrder">
                      Order Date & Time{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="datetime-local"
                      id="dateOrder"
                      name="dateOrder"
                      value={formData.dateOrder}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Product Details Section */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Product Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product */}
                  <div className="space-y-2">
                    <Label>
                      Product <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.productId}
                      onValueChange={handleProductChange}
                      disabled={loadingProducts}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingProducts ? "Loading..." : "Select product"
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

                  {/* Vessel */}
                  <div className="space-y-2">
                    <Label>
                      Vessel <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={formData.vesselId}
                      onValueChange={(val) =>
                        handleSelectChange("vesselId", val)
                      }
                      disabled={loadingVessels}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            loadingVessels ? "Loading..." : "Select vessel"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {vessels.map((vessel) => (
                          <SelectItem
                            key={vessel.id}
                            value={vessel.id.toString()}
                          >
                            {vessel.type_name} - {vessel.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category (auto) */}
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={selectedProduct?.categ_name || ""}
                      readOnly
                      placeholder="Auto-populated from product"
                      className="bg-muted"
                    />
                  </div>

                  {/* Unit (auto) */}
                  <div className="space-y-2">
                    <Label>Unit</Label>
                    <Input
                      value={selectedProduct?.uom_name || ""}
                      readOnly
                      placeholder="Auto-populated from product"
                      className="bg-muted"
                    />
                  </div>

                  {/* Code Budget (auto) */}
                  <div className="space-y-2">
                    <Label>Code Budget</Label>
                    <Input
                      value={selectedProduct?.code_budget_name || "N/A"}
                      readOnly
                      placeholder="Auto-populated from product"
                      className="bg-muted"
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-2">
                    <Label htmlFor="quantity">
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      id="quantity"
                      name="quantity"
                      value={formData.quantity}
                      onChange={handleInputChange}
                      placeholder="Enter quantity"
                      required
                    />
                  </div>

                  {/* Project */}
                  <div className="space-y-2">
                    <Label htmlFor="project">Project</Label>
                    <Input
                      type="text"
                      id="project"
                      name="project"
                      value={formData.project}
                      onChange={handleInputChange}
                      placeholder="Enter project name"
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="space-y-2">
                    <Label htmlFor="unitPrice">
                      Unit Price <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      id="unitPrice"
                      name="unitPrice"
                      value={formData.unitPrice}
                      onChange={handleInputChange}
                      placeholder="Enter unit price"
                      required
                    />
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
                    value={formData.notes}
                    onChange={(value) =>
                      setFormData((prev) => ({ ...prev, notes: value }))
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
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : isEditing ? (
              "Update Order"
            ) : (
              "Create Order"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrderForm;
