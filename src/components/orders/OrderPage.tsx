import { useState, type FormEvent } from "react";

type POType = "BBM" | "Fresh Water";
type OrderStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";

interface Order {
  id: string;
  poType: POType;
  bunkerDate: string;
  customerName: string;
  purchaseOrderNumber: string;
  vesselName: string;
  position: string;
  quantity: string;
  status: OrderStatus;
}

interface OrderFormData {
  poType: POType;
  bunkerDate: string;
  customerName: string;
  vesselName: string;
  position: string;
  quantity: string;
}

const OrdersPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<OrderFormData>({
    poType: "BBM",
    bunkerDate: "",
    customerName: "",
    vesselName: "",
    position: "",
    quantity: "",
  });

  // Placeholder orders data
  const [orders, setOrders] = useState<Order[]>([
    {
      id: "1",
      poType: "BBM",
      bunkerDate: "2025-11-10",
      customerName: "ABC Shipping Co.",
      purchaseOrderNumber: "2 AC/BGP.OPS/I-2025",
      vesselName: "MV Ocean Star",
      position: "Port of Singapore",
      quantity: "500 MT",
      status: "Completed",
    },
    {
      id: "2",
      poType: "Fresh Water",
      bunkerDate: "2025-11-11",
      customerName: "Global Marine Ltd.",
      purchaseOrderNumber: "3 FW/BGP.OPS/I-2025",
      vesselName: "SS Pacific Pearl",
      position: "Tanjung Priok",
      quantity: "200 CBM",
      status: "In Progress",
    },
    {
      id: "3",
      poType: "BBM",
      bunkerDate: "2025-11-09",
      customerName: "Eastern Logistics",
      purchaseOrderNumber: "1 AC/BGP.OPS/I-2025",
      vesselName: "MV Harmony",
      position: "Surabaya Port",
      quantity: "750 MT",
      status: "Pending",
    },
  ]);

  const generatePONumber = (poType: POType): string => {
    const prefix = poType === "BBM" ? "AC" : "FW";
    const count = orders.length + 1;
    const year = new Date().getFullYear();
    return `${count} ${prefix}/BGP.OPS/I-${year}`;
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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const newOrder: Order = {
      id: String(orders.length + 1),
      ...formData,
      purchaseOrderNumber: generatePONumber(formData.poType),
      status: "Pending",
    };

    setOrders([newOrder, ...orders]);
    setShowForm(false);
    setFormData({
      poType: "BBM",
      bunkerDate: "",
      customerName: "",
      vesselName: "",
      position: "",
      quantity: "",
    });
  };

  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case "Completed":
        return "bg-green-100 text-green-700";
      case "In Progress":
        return "bg-blue-100 text-blue-700";
      case "Pending":
        return "bg-amber-100 text-amber-700";
      case "Cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors flex items-center"
        >
          <svg
            className="h-5 w-5 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          {showForm ? "Cancel" : "Add New Order"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-amber-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            New Order
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* PO Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PO Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="poType"
                  value={formData.poType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                >
                  <option value="BBM">BBM</option>
                  <option value="Fresh Water">Fresh Water</option>
                </select>
              </div>

              {/* Bunker Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bunker Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="bunkerDate"
                  value={formData.bunkerDate}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Customer Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="customerName"
                  value={formData.customerName}
                  onChange={handleInputChange}
                  placeholder="Enter company name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Vessel Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vessel Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="vesselName"
                  value={formData.vesselName}
                  onChange={handleInputChange}
                  placeholder="Enter vessel name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="position"
                  value={formData.position}
                  onChange={handleInputChange}
                  placeholder="Enter port/location"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleInputChange}
                  placeholder="e.g., 500 MT or 200 CBM"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
              >
                Create Order
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-md border border-amber-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-amber-50 border-b border-amber-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  PO Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  PO Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Bunker Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Vessel Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No orders found. Create your first order to get started.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-amber-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.purchaseOrderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {order.poType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(order.bunkerDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {order.customerName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {order.vesselName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {order.position}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {order.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex space-x-2">
                        <button
                          className="text-amber-600 hover:text-amber-700 transition-colors"
                          title="View"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                        <button
                          className="text-blue-600 hover:text-blue-700 transition-colors"
                          title="Edit"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          className="text-red-600 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination placeholder */}
      <div className="flex justify-between items-center bg-white rounded-lg shadow-md p-4 border border-amber-100">
        <p className="text-sm text-gray-600">
          Showing {orders.length} of {orders.length} orders
        </p>
        <div className="flex space-x-2">
          <button className="px-3 py-1 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Previous
          </button>
          <button className="px-3 py-1 bg-amber-500 text-white rounded-lg text-sm font-medium">
            1
          </button>
          <button className="px-3 py-1 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;
