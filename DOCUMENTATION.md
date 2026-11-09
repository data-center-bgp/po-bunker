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
| Authentication            | Email/password login (JWT + refresh cookie), role-based access |
| Purchase Order Management | Full CRUD — create, view, edit, and delete POs        |
| Status Workflow           | Submitted → Completed (DO + actual quantity) or Cancelled (with reason) |
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
| **Excel Generation**  | xlsx (SheetJS, in the browser)                               |
| **State Management**  | React Context API + `useState` / `useEffect`                 |
| **Backend**           | Go (Gin) API + PostgreSQL, in `backend/`                     |
| **Data Client**       | `fetch` wrapper in `src/lib/api.ts`                          |
| **PDF Generation**    | jsPDF + jspdf-autotable (in the browser)                     |

---

## 3. Architecture Overview

```
Browser (React SPA)
       │
       ├── AuthContext  ──── access token in memory + refresh cookie
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

Service layer (src/services/)  →  API client (src/lib/api.ts)  →  /api/v1  (Nginx → Go API)
       │
       └── Go API (backend/)  →  PostgreSQL + files on disk
             ├── Auth: users, rotating refresh tokens, roles
             ├── Tables: purchase_orders, purchase_order_lines, companies,
             │           partners, regions, vessels, products, code_budgets, ...
             └── Rules in Go: PO numbering, totals, submit/complete/cancel
```

The frontend is a **Single Page Application (SPA)** that talks to the PO Bunker API on its own origin. Access is enforced by the API (a role check on every request), not by hiding buttons in the frontend.

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

# Start the API first (see backend/README.md), then the development server
npm run dev
```

The app will be available at `http://localhost:5173`; the dev server forwards `/api` to the API on `http://127.0.0.1:8080`
(override with `VITE_PROXY_TARGET`).

### Build for Production

```bash
npm run build
```

Output is placed in the `dist/` folder: a static site. In production Nginx serves it and proxies `/api/` to the API, so no build-time configuration is needed. See `DEPLOY.md` and `backend/README.md`.

---

## 5. How to Use the Application

### 5.1 Login

1. Open the application in your browser.
2. You will be presented with the **Login** screen (the app redirects all unauthenticated users here automatically).
3. Enter your registered **Email Address** and **Password**.
4. Click **Sign In**.

**Validation rules:**

- Email must be a valid email format.
- Password is required.

An administrator creates your account on the **Pengguna** page and gives you a starting password; change it from the account menu (bottom left, *Ubah kata sandi*). Too many wrong attempts are answered with a short wait.

On success you are redirected to the **Dashboard**. The session renews itself in the background until you log out, and ends at once if an administrator deactivates your account.

| Role   | Can do                                                        |
| ------ | ------------------------------------------------------------- |
| admin  | Everything, including users                                   |
| staff  | Create/complete/cancel orders; manage companies, partners, regions, products, units and code budgets; sync vessels |
| viewer | Read-only: write buttons are hidden                           |

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
| Status     | Current order state (badge: Submitted / Completed / Cancelled) |
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
| **Vendor Document**  | Quotation or Invoice (printed as "as per your company's ...") | No |
| **Vendor Document No. / Date** | Number and date of the vendor's document | No   |
| **Bunker Date & Time** | When the bunkering is planned                   | No       |
| **Discount (Rp)**    | Discount amount taken off the lines total          | No       |
| **VAT (%)**          | VAT percentage applied after the discount          | No       |

#### Step B — Add Order Line Items

Each order must have at least one line item. Click **"Add Line"** to add more rows.

| Field            | Description                                      | Notes                                 |
| ---------------- | ------------------------------------------------ | ------------------------------------- |
| **Product**      | Searchable dropdown by name or code              | Auto-fills Category, UoM, Code Budget |
| **Vessel**       | Searchable dropdown by type and name             | Required                              |
| **Region**       | Searchable dropdown                              | Optional                              |
| **Quantity**     | Number of units                                  | Required                              |
| **Unit Price**   | Price per unit (IDR)                             | Required                              |
| **Priority**     | Urgency level: `L` Low / `M` Medium / `H` High   | Optional                              |
| **Project**      | Project name or reference                        | Optional                              |
| **Requested By** | App user who requested the item (searchable)     | Optional                              |
| **Category**     | Product division/category                        | Auto-filled from product              |
| **Code Budget**  | Budget allocation code (searchable, overridable) | Auto-filled from product              |
| **Unit**         | Unit of Measure                                  | Auto-filled from product              |

- The **subtotal** per line and the totals are calculated automatically: lines total (active lines) minus the discount, plus VAT on the remainder.
- To remove a line, click the **trash icon** on that row.

3. Click **"Submit Order"**. The new order appears in the table with **Submitted** status. It is locked from then on (see 5.6).

---

### 5.5 Viewing an Order

Click the **Eye icon** on any order row to open the **View Order** dialog. It shows the status, the dates (order, vendor
document, bunker, completed), the customer and company, the order items, the totals, the Delivery Order files, the remarks
and the notes. A cancelled order shows who cancelled it, when, and the reason. A completed order also shows the **ordered vs
actual quantity and amount** per line.

---

### 5.6 Submitting and fixing an order

Creating an order submits it. A **submitted order is locked**: its header and lines cannot be edited. If an order was made
wrongly, **cancel it and create a new one** (the *Copy as new PO* button on a cancelled order opens the form prefilled).
Remarks can still be added to an order in any status.

---

### 5.7 Order status workflow

| Status        | Meaning                                                       | How it gets there                                |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| **Submitted** | The PO was created                                            | Save the order form                              |
| **Completed** | The bunkering happened; the DO and the actual quantity are recorded | **Complete** on a submitted order          |
| **Cancelled** | The PO was made wrongly or was really cancelled               | **Cancel PO** on a submitted order, with a reason |

**Complete** (green check): upload at least one **Delivery Order (DO)** file (PDF, JPG or PNG, max 5 MB each) and enter the
**actual quantity** for every line (for example ordered 1000 L, the DO says 900 L). Both numbers are kept; the ordered totals,
discount and VAT are not recalculated, and the actual amount (quantity x unit price) is shown next to them. A completed order
is final.

**Cancel PO** (orange X): a reason (at least 3 characters) is required. The order stays in the list with its reason and its
number is not reused. Only submitted orders can be cancelled.

Status badges: Submitted (blue), Completed (green), Cancelled (red). Admins and staff can submit, complete and cancel;
viewers only read.

---

### 5.8 Exporting Orders

Two export formats are available per order from the **action buttons** in the table. Both reproduce the bilingual
"ORDER PEMBELIAN / PURCHASE ORDER" form of the old system (bunker layout): the issuing company's letterhead (the image uploaded on the company, else the default `public/letterhead.jpg`), vendor block, line table,
remarks, total / discount / VAT / grand total, amount in words (Terbilang), payment options and three signature boxes
(empty on new orders; old orders keep their printed signatures). A cancelled order prints a red CANCELLED line with its reason.
Both run in your browser.

- **PDF Preview:** click the **Printer icon**, then save or print from the viewer.
- **Excel Download:** click the **Download icon**; the file is named after the PO number.

---

### 5.9 Remarks

Admins and staff can add and delete colored notes (red or blue) on an order in any status, for example delivery updates.
They print under the order lines.

---

### 5.10 Users (admins only)

The **Pengguna** page (sidebar, section *Administrasi*) lists everyone with access to PO Bunker: name, email, role,
status and last sign-in. Admins can:

- **Tambah Pengguna:** create an account with an email, name, role (Admin, Staf or Viewer) and a starting password (there is
  a button that makes a random one). Tell the user the password; they can change it themselves.
- **Ubah:** change the name or role, switch access off (the user can no longer open PO Bunker, their PO history stays),
  or set a new password (*Atur ulang kata sandi*), which also ends that user's sessions.
- You cannot change your own role or deactivate yourself, and there must always be one active admin.

---

## 6. Order States & Workflow

```
   New order ──► SUBMITTED ──── Complete (DO + actual qty) ───► COMPLETED   (final)
                     │
                     └──────── Cancel (reason) ───────────────► CANCELLED   (final; "Copy as new PO")
```

---

## 7. Data Model

The authoritative definition is in `backend/migrations/` (`00001_init_schema.sql`). The shapes the frontend uses are in `src/services/types.ts`.

### Purchase Order (`po_bunker.purchase_orders`)

| Field                | Type                                              | Description                         |
| -------------------- | ------------------------------------------------- | ----------------------------------- |
| `id`                 | bigint                                            | Unique identifier                   |
| `name`               | text                                              | PO number, assigned on create (see below) |
| `company_id`         | bigint → `companies`                              | Issuing company                     |
| `partner_id`         | bigint → `partners`                               | Vendor/supplier                     |
| `order_type`         | `bunker_fuel` / `bunker_water` / `logistic`       | Type of order                       |
| `state`              | `submitted` / `completed` / `cancelled`           | Order lifecycle state               |
| `date_order`         | timestamptz                                       | Order date and time                 |
| `amount_untaxed`     | numeric                                           | Sum of line subtotals (maintained by trigger) |
| `amount_tax`         | numeric                                           | 0 for now                           |
| `amount_total`       | numeric                                           | untaxed + tax - discount            |
| `notes`              | text                                              | HTML-formatted notes                |
| `option_order`, `partner_ref`, `date_vendor` | text / text / timestamptz        | Vendor quotation/invoice, its number and date |
| `date_bunker`        | timestamptz                                       | Planned bunker date                 |
| `tax_percent`        | numeric (0-100)                                   | VAT %                               |
| `amount_discount`    | numeric (>= 0)                                    | Discount amount (entered by the user) |
| `completed_at`, `completed_by` | timestamptz / uuid                      | Who completed the order and when    |
| `cancel_reason`, `cancelled_at`, `cancelled_by` | text / timestamptz / uuid | Cancellation reason, when and by whom |
| `actual_amount`      | numeric                                           | Sum of actual quantity x unit price (set on completion) |
| `first/second/third_approved_*` | uuid / timestamptz / text              | Legacy three-level approval and signature snapshot (old orders only, no longer used) |

### Order Line (`po_bunker.purchase_order_lines`)

| Field            | Type                            | Description                    |
| ---------------- | ------------------------------- | ------------------------------ |
| `product_id`     | bigint → `products`             | Product                        |
| `vessel_id`      | bigint → `vessels`              | Target vessel                  |
| `region_id`      | bigint → `regions`              | Operational region (optional)  |
| `code_budget_id` | bigint → `code_budgets`         | Budget code (optional)         |
| `category_id`    | bigint → `product_categories`   | Division/category              |
| `uom_id`         | bigint → `uoms`                 | Unit of measure                |
| `product_qty`    | numeric (> 0)                   | Quantity                       |
| `price_unit`     | numeric (>= 0)                  | Unit price (IDR)               |
| `price_subtotal` | numeric (generated)             | `round(qty * unit price, 2)`   |
| `project`        | text                            | Project name or reference      |
| `requested_by`   | uuid → `profiles`               | Requesting user (optional)     |
| `priority`       | `low` / `medium` / `high`       | Line priority (optional)       |
| `actual_qty`     | numeric (>= 0)                  | Quantity on the Delivery Order (set on completion) |
| `actual_subtotal` | numeric (generated)            | `round(actual qty * unit price, 2)` |
| `status_list`    | `onprogress` / `hold` / `cancel` / `close` | Legacy per-line status, no longer used in the app |

`po_bunker.purchase_order_remarks` holds the colored notes (`order_id`, `remark_date`, `color` merah/biru, `remark`).
`po_bunker.purchase_order_documents` holds the Delivery Order files (`order_id`, `doc_type`, `file_path`, `file_name`, `mime_type`, `size_bytes`); the files live in the private bucket `po_bunker_assets` under `documents/<order id>/`.

---

## 8. Backend (Go API)

The app talks to one API client (`src/lib/api.ts`); data access lives in `src/services/`. The API is in `backend/` (see
`backend/README.md` for every endpoint, the rules and how to run its tests).

### Authentication

`POST /api/v1/auth/login` with email and password returns a 15-minute access token (kept in memory) and sets a rotating
refresh token in an `httpOnly`, `SameSite=Strict` cookie. The client renews the access token by itself on a 401 and
restores the session after a page reload. Roles: `admin`, `staff`, `viewer`; the API reads the user from the database on
every request, so a deactivation or role change applies immediately.

### Writes to orders

Orders are written only through three operations, each one database transaction:

| Endpoint                          | Description                                                   |
| --------------------------------- | ------------------------------------------------------------- |
| `POST /orders`                    | Submit a new order (header and lines together). The PO number and totals are computed on the server. Editing a submitted order is not possible |
| `POST /orders/:id/complete`       | Submitted order only; needs >= 1 DO file and an actual quantity for every line |
| `POST /orders/:id/cancel`         | Submitted order only; a reason is required                    |

Delivery Order files are uploaded with `POST /orders/:id/documents` (PDF, PNG or JPG, 5 MB, checked by the file's content)
and deleted with `DELETE /orders/:id/documents/:docId`, only while the order is submitted. Orders cannot be deleted.

### Reference data

Companies, partners and regions can be created and edited from the app. **Vessels** are synced from the company SMS vessel API: an admin or staff user presses *Sync from SMS* on the Vessels page (the API token stays on the server; vessels that disappear from the API are deactivated, never deleted; inactive vessels can no longer be picked on new orders). **Products, units of measure and code budgets** have their own screens (*Produk*, *Satuan*, *Kode Budget*, section Data Master) where admins and staff can add and edit them (viewers only read). Products and code budgets are deactivated instead of deleted; nothing is deleted from the app. Categories and business units are managed in the database (admin only).

### Export

PDF (jsPDF) and Excel (ExcelJS) are generated in the browser from the order data. `src/lib/orderPrintData.ts` builds the shared print model, `exportOrderPdf.ts` and `exportOrderExcel.ts` draw the form.

---

## 9. Security

| Measure                 | Implementation                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Authentication**      | bcrypt passwords, short-lived JWT access tokens, rotating refresh tokens (stored hashed); login attempts are rate limited |
| **Authorization**       | A role check on every endpoint; the user is re-read from the database per request (deactivation applies at once)    |
| **Order integrity**     | Orders change only through the three transactional operations; numbering, totals and the state machine live in Go with database CHECK constraints as a backstop |
| **Files**               | Type decided from the file's bytes, size limits, fixed path layout (no traversal), downloads through short-lived signed links |
| **XSS prevention**      | Order notes (HTML) are sanitized with **DOMPurify** before rendering                                                |
| **Input validation**    | Strict JSON (unknown fields refused), server-side validation with stable error codes, plus database CHECK constraints |
| **Secrets**             | JWT and file-signing secrets and the SMS API token are environment variables on the server; the browser holds none  |

---

## 10. Project Structure

```
po-bunker/
├── public/
│   └── logo-bpg.png                       # Company logo
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
│   ├── services/                          # API calls (same function names as before)
│   │   ├── orders.ts                      # Orders, documents, remarks, complete/cancel
│   │   ├── companies.ts, partners.ts, regions.ts, lookups.ts, catalog.ts, users.ts, auth.ts, storage.ts
│   │   ├── types.ts                       # Shapes returned by the API
│   │   └── helpers.ts                     # Re-exports ApiError
│   └── lib/
│       ├── api.ts                         # fetch wrapper: token, silent refresh, ApiError
│       ├── apiErrors.ts                   # API error codes -> Indonesian messages
│       ├── exportOrder.ts                 # PDF + Excel generation
│       └── utils.ts                       # Utility helpers (cn, etc.)
├── index.html
├── vite.config.ts                         # Vite config
├── backend/                               # The Go API (see backend/README.md)
├── supabase/                              # Previous backend: kept for reference and the data import
├── tsconfig.json
├── package.json
└── DOCUMENTATION.md
```

---

_Documentation last updated 2026-10-22 — PO Bunker v0.0.0 — PT Barokah Gemilang Perkasa_
