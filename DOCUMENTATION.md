# PO Bunker — Project Documentation

> Purchase Order Management System for PT Barokah Gemilang Perkasa

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [Getting Started](#4-getting-started)
5. [How to Use the Application](#5-how-to-use-the-application)
   - 5.1 [Login](#51-login)
   - 5.2 [Dashboard & Navigation](#52-dashboard--navigation)
   - 5.3 [Orders Page](#53-orders-page)
   - 5.4 [Creating a New Purchase Order](#54-creating-a-new-purchase-order)
   - 5.5 [Viewing an Order](#55-viewing-an-order)
   - 5.6 [Editing an Order](#56-editing-an-order)
   - 5.7 [Order Status Management](#57-order-status-management)
   - 5.8 [Exporting Orders](#58-exporting-orders)
   - 5.9 [Deleting an Order](#59-deleting-an-order)
6. [Order States & Workflow](#6-order-states--workflow)
7. [Data Model](#7-data-model)
8. [API Integration](#8-api-integration)
9. [Security](#9-security)
10. [Project Structure](#10-project-structure)

---

## 1. Project Overview

**PO Bunker** is a web-based Purchase Order (PO) management application built for **PT Barokah Gemilang Perkasa**. It provides a centralised interface for creating, tracking, managing, and exporting purchase orders across the company's shipping vessels and operational regions.

### Key Capabilities

| Capability                | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| Authentication            | Secure email/password login with JWT tokens           |
| Purchase Order Management | Full CRUD — create, view, edit, and delete POs        |
| Status Workflow           | Draft → Confirmed → Cancelled lifecycle               |
| Multi-line Orders         | Each PO supports multiple product line items          |
| PDF Export                | Generate and preview a formatted PDF for any order    |
| Excel Export              | Download order data as a `.xlsx` spreadsheet          |
| Pagination                | Orders list with server-side pagination (10 per page) |
| Inline Row Expansion      | Expand any order row to see its line items inline     |

---

## 2. Technology Stack

| Layer                 | Technology                                                   |
| --------------------- | ------------------------------------------------------------ |
| **Framework**         | React 19 + TypeScript                                        |
| **Build Tool**        | Vite                                                         |
| **Styling**           | Tailwind CSS v4                                              |
| **UI Components**     | Radix UI primitives (Dialog, Select, Popover, Tooltip, etc.) |
| **Icons**             | Lucide React                                                 |
| **Rich Text Editor**  | React Quill (for order notes)                                |
| **HTML Sanitization** | DOMPurify (prevents XSS)                                     |
| **Excel Generation**  | xlsx (SheetJS)                                               |
| **State Management**  | React Context API + `useState` / `useEffect`                 |
| **HTTP Client**       | Native `fetch` API                                           |
| **Auth Storage**      | Browser `localStorage`                                       |

---

## 3. Architecture Overview

```
Browser (React SPA)
       │
       ├── AuthContext  ──── tokenManager (localStorage)
       │
       ├── Login Page
       │
       └── Dashboard
             ├── Sidebar (navigation)
             └── Main Content
                   ├── Overview  (coming soon)
                   └── Orders
                         ├── OrdersTable  (list + actions)
                         ├── OrderForm    (create / edit modal)
                         ├── ViewOrderModal (detail modal)
                         └── PdfPreviewModal

API Layer (src/services/api/)
       │
       └── Proxy  →  https://order.barokahperkasagroup.com
             ├── /api/login2
             ├── /api/purchase-orders
             ├── /api/companies
             ├── /api/partners
             ├── /api/shipping_vessels
             ├── /api/regions
             ├── /api/products
             └── /api/reports/...  (PDF / Excel)
```

The frontend is a **Single Page Application (SPA)**. In development, Vite proxies all `/api` requests to the backend to avoid CORS issues. In production, an Nginx reverse-proxy handles the same routing.

---

## 4. Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd po-bunker

# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

Output is placed in the `dist/` folder. Deploy behind an Nginx server that reverse-proxies `/api` to `https://order.barokahperkasagroup.com`.

---

## 5. How to Use the Application

### 5.1 Login

1. Open the application in your browser.
2. You will be presented with the **Login** screen (the app redirects all unauthenticated users here automatically).
3. Enter your registered **Email Address** and **Password**.
4. Click **Sign In**.

**Validation rules:**

- Email must be a valid email format.
- Password must be at least 6 characters.

On success, an access token is stored in the browser and you are redirected to the **Dashboard**. Your session persists across page refreshes until you explicitly log out.

> If login fails, an error message is displayed below the email field.

---

### 5.2 Dashboard & Navigation

After logging in, you see the main **Dashboard** with a collapsible **Sidebar** on the left.

| Sidebar Item | Description                                                |
| ------------ | ---------------------------------------------------------- |
| **Overview** | Summary dashboard with charts/stats _(under construction)_ |
| **Orders**   | Purchase Order management — the primary working area       |

- Click the **chevron arrow** (`«` / `»`) at the top of the sidebar to collapse or expand it.
- When collapsed, icon tooltips appear on hover.
- Your active tab is remembered between sessions (stored in `localStorage`).
- Click your avatar initials at the bottom of the sidebar, then **Log Out** to sign out.

---

### 5.3 Orders Page

The **Orders** page lists all purchase orders in a paginated table.

**Table columns:**

| Column     | Description                                                |
| ---------- | ---------------------------------------------------------- |
| #          | Row number                                                 |
| Order Name | The system-generated PO reference number                   |
| Vendor     | Supplier/partner name                                      |
| Company    | The issuing company                                        |
| Order Type | Type of purchase order                                     |
| Date       | Order creation date                                        |
| Total      | Total amount (IDR)                                         |
| Status     | Current order state (badge: Draft / Confirmed / Cancelled) |
| Actions    | Buttons for View, Edit, Print, Download, Delete            |

**Pagination** controls appear below the table. Navigate between pages using the **Previous** / **Next** buttons or the page number display.

**Expanding a row:** Click the **chevron** (`▼`) on the left of any row to expand it and see all **order line items** inline without opening a modal.

---

### 5.4 Creating a New Purchase Order

1. On the **Orders** page, click the **"Add New Order"** button (top-right).
2. The **Order Form** dialog opens.

#### Step A — Fill in the Order Header

| Field                | Description                                       | Required |
| -------------------- | ------------------------------------------------- | -------- |
| **Company**          | Select the issuing company                        | Yes      |
| **Vendor / Partner** | Select the supplier                               | Yes      |
| **Order Type**       | Type/category of the PO                           | Yes      |
| **Order Date**       | Date and time of the order                        | Yes      |
| **Notes**            | Internal notes (rich text editor with formatting) | No       |

#### Step B — Add Order Line Items

Each order must have at least one line item. Click **"Add Line"** to add more rows.

| Field           | Description                                 | Auto-filled             |
| --------------- | ------------------------------------------- | ----------------------- |
| **Product**     | Search and select a product by name or code | —                       |
| **Vessel**      | The shipping vessel this item is for        | —                       |
| **Region**      | Operational region (searchable)             | —                       |
| **Quantity**    | Number of units                             | —                       |
| **Unit Price**  | Price per unit (IDR)                        | From product list price |
| **Project**     | Project name or reference                   | —                       |
| **Category**    | Product division/category                   | ✓ from product          |
| **Budget Code** | Budget allocation code                      | ✓ from product          |
| **UoM**         | Unit of Measure                             | ✓ from product          |

- The **subtotal** per line and the **grand total** are calculated and displayed automatically.
- To remove a line, click the **trash icon** on that row.

3. Click **"Create Order"** to submit. The new order appears in the table with **Draft** status.

---

### 5.5 Viewing an Order

Click the **Eye icon** (`👁`) on any order row to open the **View Order** modal.

The modal displays:

- **Order header** — reference number, vendor, company, order type, date, status badge, creation date, approval chain (first/second/third approver with dates)
- **Financial summary** — subtotal, tax, discount, and total amount
- **Order lines table** — product name, code, vessel, region, quantity, UoM, unit price, subtotal
- **Notes** — rendered rich-text notes (sanitized against XSS)
- **Action buttons** — Confirm, Cancel, Set to Draft, Delete (depending on current state)

---

### 5.6 Editing an Order

> **Note:** Only orders in **Draft** status can be edited.

1. Click the **Pencil icon** on the desired order row (only active for Draft orders).
2. The **Order Form** dialog opens pre-populated with the existing data.
3. Modify any header fields or line items as needed.
   - To add a line: click **"Add Line"**.
   - To remove a line: click the trash icon on that row.
4. Click **"Update Order"** to save.

---

### 5.7 Order Status Management

Orders follow a defined lifecycle. Status transitions are triggered via the action buttons in the table row or inside the **View Order** modal.

| Action           | Button        | From State             | To State               |
| ---------------- | ------------- | ---------------------- | ---------------------- |
| **Confirm**      | ✅ Check icon | Draft                  | Confirmed (`purchase`) |
| **Cancel**       | ✕ icon        | Draft or Confirmed     | Cancelled              |
| **Set to Draft** | ↩ Reset icon  | Confirmed or Cancelled | Draft                  |

Status badges in the table are color-coded:

| Status    | Badge Color |
| --------- | ----------- |
| Draft     | Gray        |
| Confirmed | Green       |
| Cancelled | Red         |

---

### 5.8 Exporting Orders

Two export formats are available per order from the **action buttons** in the table:

#### PDF Preview

1. Click the **Printer icon** on the order row.
2. A loading spinner appears while the PDF is generated server-side.
3. The **PDF Preview** modal opens with the document rendered inside the browser.
4. Use your browser's built-in PDF toolbar to **save or print** the document.
5. Click **Close** to dismiss the modal.

#### Excel Download

1. Click the **Download icon** on the order row.
2. The `.xlsx` file is generated and **automatically downloaded** to your device.
3. The filename follows the pattern: `<OrderName>.xlsx`.

---

### 5.9 Deleting an Order

1. Click the **Trash icon** on the order row.
2. A **confirmation dialog** appears showing the order name.
3. If the order is in **Confirmed** state, you are warned that it will be cancelled first before deletion.
4. Click **Confirm Delete** to permanently remove the order.
5. Click **Cancel** to abort.

> Deletion is irreversible. Always verify the correct order before confirming.

---

## 6. Order States & Workflow

```
                ┌─────────────────────────────────────┐
                │                                     │
          ┌─────▼──────┐   Confirm    ┌─────────────┐ │
  New ──► │   DRAFT    ├────────────► │  CONFIRMED  │ │
          │  (draft)   │◄────────────┤  (purchase) │ │
          └─────┬──────┘  Set Draft  └──────┬──────┘ │
                │                           │         │
                │ Cancel                    │ Cancel  │
                ▼                           ▼         │
          ┌───────────┐              ┌────────────┐   │
          │ CANCELLED │              │ CANCELLED  │   │
          │ (cancel)  │              │ (cancel)   │   │
          └─────┬─────┘              └─────┬──────┘   │
                │    Set Draft             │           │
                └──────────────────────────┘           │
                                                       │
          [ Delete available from any state ]◄─────────┘
```

---

## 7. Data Model

### Purchase Order

| Field            | Type                            | Description                        |
| ---------------- | ------------------------------- | ---------------------------------- |
| `id`             | number                          | Unique identifier                  |
| `name`           | string                          | PO reference (e.g., `PO/2024/001`) |
| `partner_name`   | string                          | Vendor/supplier name               |
| `company_name`   | string                          | Issuing company                    |
| `order_type`     | string                          | Type of order                      |
| `state`          | `draft` / `purchase` / `cancel` | Order lifecycle state              |
| `date_order`     | string                          | Order timestamp                    |
| `amount_untaxed` | number                          | Subtotal (IDR)                     |
| `amount_tax`     | number                          | Tax amount (IDR)                   |
| `amount_total`   | number                          | Grand total (IDR)                  |
| `notes`          | string                          | HTML-formatted notes               |
| `order_lines`    | `OrderLine[]`                   | Line items                         |

### Order Line

| Field              | Type   | Description         |
| ------------------ | ------ | ------------------- |
| `product_name`     | string | Product name        |
| `product_code`     | string | SKU / product code  |
| `vessel_name`      | string | Target vessel       |
| `region_name`      | string | Operational region  |
| `product_qty`      | number | Quantity            |
| `product_uom_name` | string | Unit of measure     |
| `price_unit`       | number | Unit price (IDR)    |
| `price_subtotal`   | number | Line subtotal (IDR) |
| `project_name`     | string | Associated project  |
| `divisi_name`      | string | Division/category   |
| `code_budget_name` | string | Budget code         |

---

## 8. API Integration

The application connects to the backend at `https://order.barokahperkasagroup.com`.

### Authentication

| Method | Endpoint      | Description                               |
| ------ | ------------- | ----------------------------------------- |
| `POST` | `/api/login2` | Authenticate user, returns `access_token` |

Authentication flow:

1. User submits email + password.
2. App POSTs to `/api/login2` with `{ login, password, db: "po-bunker" }`.
3. Server returns `{ access_token, user_id, login }`.
4. Token is stored in `localStorage` and sent as `Authorization: Bearer <token>` on all subsequent requests.

### Purchase Orders

| Method   | Endpoint                            | Description                 |
| -------- | ----------------------------------- | --------------------------- |
| `GET`    | `/api/purchase-orders?page=&limit=` | List orders (paginated)     |
| `GET`    | `/api/purchase-orders/:id`          | Get single order with lines |
| `POST`   | `/api/purchase-orders`              | Create new order            |
| `PUT`    | `/api/purchase-orders/:id`          | Update existing order       |
| `DELETE` | `/api/purchase-orders/:id`          | Delete order                |
| `POST`   | `/api/purchase-orders/:id/confirm`  | Confirm (draft → purchase)  |
| `POST`   | `/api/purchase-orders/:id/cancel`   | Cancel order                |
| `POST`   | `/api/purchase-orders/:id/draft`    | Reset to draft              |

### Reference Data

| Method | Endpoint                | Description                   |
| ------ | ----------------------- | ----------------------------- |
| `GET`  | `/api/companies`        | List companies                |
| `GET`  | `/api/partners`         | List vendors/partners         |
| `GET`  | `/api/shipping_vessels` | List vessels                  |
| `GET`  | `/api/regions`          | List regions (auto-paginated) |
| `GET`  | `/api/products`         | List products                 |

### Export

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| `GET`  | `/api/reports/pdf/:id`   | Generate PDF report   |
| `GET`  | `/api/reports/excel/:id` | Generate Excel report |

---

## 9. Security

| Measure                 | Implementation                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Authentication**      | Bearer JWT token on every API request                                                                                        |
| **Session persistence** | Token stored in `localStorage`; cleared on logout                                                                            |
| **XSS prevention**      | All HTML from the server (order notes) is sanitized using **DOMPurify** before rendering                                     |
| **Input validation**    | Client-side form validation before submission (email format, required fields, minimum lengths)                               |
| **HTTPS**               | All API traffic goes over HTTPS                                                                                              |
| **Proxy**               | Dev proxy hides the backend origin; production uses Nginx reverse proxy — no credentials are embedded in the frontend bundle |

---

## 10. Project Structure

```
po-bunker/
├── public/
│   └── pt-barokah-gemilang-perkasa.png   # Company logo
├── src/
│   ├── main.tsx                           # App entry point
│   ├── App.tsx                            # Root: Login or Dashboard
│   ├── index.css                          # Global styles
│   ├── assets/                            # Static assets
│   ├── components/
│   │   ├── Login.tsx                      # Authentication screen
│   │   ├── Dashboard.tsx                  # Main layout with sidebar
│   │   ├── Sidebar.tsx                    # Collapsible navigation
│   │   ├── orders/
│   │   │   ├── OrderPage.tsx              # Orders feature root
│   │   │   ├── OrdersTable.tsx            # Paginated orders table
│   │   │   ├── OrderForm.tsx              # Create / Edit PO dialog
│   │   │   ├── ViewOrderModal.tsx         # PO detail view dialog
│   │   │   └── PdfPreviewModal.tsx        # PDF viewer dialog
│   │   └── ui/                            # Reusable UI primitives
│   │       ├── button.tsx, input.tsx, ...
│   ├── contexts/
│   │   ├── AuthContext.tsx                # Auth state provider
│   │   └── useAuth.ts                     # Auth context hook
│   ├── services/
│   │   └── api/
│   │       ├── config.ts                  # Base URL & headers
│   │       ├── authApi.ts                 # Login endpoint
│   │       ├── ordersApi.ts               # All PO-related endpoints
│   │       ├── tokenManager.ts            # localStorage token helpers
│   │       └── index.ts                   # Re-exports
│   └── lib/
│       └── utils.ts                       # Utility helpers (cn, etc.)
├── index.html
├── vite.config.ts                         # Dev proxy config
├── tsconfig.json
├── package.json
└── DOCUMENTATION.md
```

---

_Documentation generated for PO Bunker v0.0.0 — PT Barokah Gemilang Perkasa_
