import { useState, useEffect, type FormEvent } from "react";
import { ordersApi, type Vessel } from "../../services/api";

interface OrderFormData {
  partnerId: string;
  orderType: string;
  dateOrder: string;
  datePlanned: string;
  productId: string;
  vesselId: string;
  quantity: string;
  unitPrice: string;
}

interface OrderFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

const OrderForm = ({ isOpen, onSuccess, onCancel }: OrderFormProps) => {
  const [formData, setFormData] = useState<OrderFormData>({
    partnerId: "",
    orderType: "",
    dateOrder: "",
    datePlanned: "",
    productId: "",
    vesselId: "",
    quantity: "",
    unitPrice: "",
  });

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVessels, setLoadingVessels] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch vessels when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchVessels();
    }
  }, [isOpen]);

  const fetchVessels = async () => {
    try {
      setLoadingVessels(true);
      const response = await ordersApi.getVessels();
      console.log("Vessels response:", response);
      setVessels(response.shipping_vessels || []);
    } catch (err) {
      console.error("Error fetching vessels:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch vessels");
    } finally {
      setLoadingVessels(false);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const orderData = {
        partner_id: parseInt(formData.partnerId),
        order_type: formData.orderType,
        date_order: new Date(formData.dateOrder).toISOString(),
        date_planned: new Date(formData.datePlanned).toISOString(),
        order_lines: [
          {
            product_id: parseInt(formData.productId),
            product_qty: parseFloat(formData.quantity),
            price_unit: parseFloat(formData.unitPrice),
            vessel_id: parseInt(formData.vesselId),
          },
        ],
      };

      await ordersApi.createOrder(orderData);
      // Reset form
      setFormData({
        partnerId: "",
        orderType: "",
        dateOrder: "",
        datePlanned: "",
        productId: "",
        vesselId: "",
        quantity: "",
        unitPrice: "",
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
      console.error("Error creating order:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset form and error when closing
    setFormData({
      partnerId: "",
      orderType: "",
      dateOrder: "",
      datePlanned: "",
      productId: "",
      vesselId: "",
      quantity: "",
      unitPrice: "",
    });
    setError(null);
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleCancel}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-amber-100 px-6 py-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-900">
              Create New Order
            </h3>
            <button
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer/Partner ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="partnerId"
                    value={formData.partnerId}
                    onChange={handleInputChange}
                    placeholder="Enter customer ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Temporary: Enter customer ID (will be dropdown later)
                  </p>
                </div>

                {/* Order Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="orderType"
                    value={formData.orderType}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select order type</option>
                    <option value="logistic">Logistic</option>
                    <option value="bbm">BBM</option>
                    <option value="fresh_water">Fresh Water</option>
                  </select>
                </div>

                {/* Order Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Order Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="dateOrder"
                    value={formData.dateOrder}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Planned Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Planned Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="datePlanned"
                    value={formData.datePlanned}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Product ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="productId"
                    value={formData.productId}
                    onChange={handleInputChange}
                    placeholder="Enter product ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Temporary: Enter product ID (will be dropdown later)
                  </p>
                </div>

                {/* Vessel */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vessel <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="vesselId"
                    value={formData.vesselId}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                    disabled={loadingVessels}
                  >
                    <option value="">
                      {loadingVessels ? "Loading vessels..." : "Select vessel"}
                    </option>
                    {vessels.map((vessel) => (
                      <option key={vessel.id} value={vessel.id}>
                        {vessel.type_name} - {vessel.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleInputChange}
                    placeholder="Enter quantity"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Unit Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unit Price <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="unitPrice"
                    value={formData.unitPrice}
                    onChange={handleInputChange}
                    placeholder="Enter unit price"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 mt-6">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center"
                >
                  {loading && (
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  )}
                  {loading ? "Creating..." : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderForm;