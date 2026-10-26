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
| Authentication            | Supabase Auth email/password login, role-based access |
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
| **Excel Generation**  | xlsx (SheetJS, in the browser)                               |
| **State Management**  | React Context API + `useState` / `useEffect`                 |
| **Backend**           | Supabase (Postgres + Auth), `po_bunker` schema               |
| **Data Client**       | `@supabase/supabase-js`                                      |
| **PDF Generation**    | jsPDF + jspdf-autotable (in the browser)                     |

---

## 3. Architecture Overview

```
Browser (React SPA)
       │
       ├── AuthContext  ──── Supabase Auth session
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

Service layer (src/services/)  →  supabase-js (src/lib/supabase.ts)
       │
       └── Supabase project CGA, schema `po_bunker`
             ├── Auth (email/password)  +  po_bunker.profiles (role)
             ├── Tables: purchase_orders, purchase_order_lines, companies,
             │           partners, regions, vessels, products, code_budgets, ...
             └── RPC: save_purchase_order, confirm_/cancel_purchase_order,
                      set_purchase_order_draft
```

The frontend is a **Single Page Application (SPA)** that talks to Supabase directly from the browser. Access is enforced in the database with row level security, not in the frontend. There is no custom backend server.

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

# Configure Supabase (URL + anon key)
cp .env.example .env

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

### Build for Production

```bash
npm run build
```

Output is placed in the `dist/` folder: a static site that can be served by any web server. Nothing needs to be proxied. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building. See `supabase/README.md` for the database setup.

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

Your account also needs an active profile in the app (an administrator creates it). A valid Supabase account without a profile is signed out again with an "access" message.

On success you are redirected to the **Dashboard**. Supabase keeps the session and refreshes it automatically until you log out.

| Role   | Can do                                                        |
| ------ | ------------------------------------------------------------- |
| admin  | Everything, including users and master data such as vessels   |
| staff  | Create/edit orders, companies, partners and regions           |
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
| **Line Status**  | On progress / Hold / Cancelled / Closed          | Cancelled lines leave the totals and print struck through |

- The **subtotal** per line and the totals are calculated automatically: lines total (active lines) minus the discount, plus VAT on the remainder.
- To remove a line, click the **trash icon** on that row.

3. Click **"Create Order"** to submit. The new order appears in the table with **Draft** status.

---

### 5.5 Viewing an Order

Click the **Eye icon** (`👁`) on any order row to open the **View Order** modal.

The modal displays:

- **Order header** — reference number, vendor, company, order type, dates (order, confirmed, vendor document, bunker), status badge
- **Financial summary** — lines total, discount, VAT, and total amount
- **Order lines table** — product, vessel, quantity, unit price, subtotal and line status (changeable on draft and confirmed orders)
- **Approvals** — the three signature boxes (see 5.10)
- **Remarks** — red/blue notes (see 5.10)
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
| **Confirm**      | ✅ Check icon | Draft                  | Confirmed (`purchase`). Confirming is not an approval. |
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

Two export formats are available per order from the **action buttons** in the table. Both reproduce the bilingual
"ORDER PEMBELIAN / PURCHASE ORDER" form of the old system (bunker layout): company logo, vendor block, line table,
remarks, total / discount / VAT / grand total, amount in words (Terbilang), payment options and the three signature boxes.
Cancelled lines are struck through. The company logo comes from the company record (fallback: the group logo).

#### PDF Preview

1. Click the **Printer icon** on the order row.
2. A loading spinner appears while the PDF is generated in your browser.
3. The **PDF Preview** modal opens with the generated document.
4. Use your browser's built-in PDF toolbar to **save or print** the document.
5. Click **Close** to dismiss the modal.

#### Excel Download

1. Click the **Download icon** on the order row.
2. The `.xlsx` file is generated and **automatically downloaded** to your device.
3. The filename follows the pattern: `<OrderName>.xlsx`.

---

### 5.10 Approvals, signatures and remarks

**Signatures.** Admins and staff upload their signature once from the user menu (**My signature**, PNG or JPG under 1 MB).
It is stored privately and copied onto a PO at the moment you approve it, so changing your signature later never alters
POs you already approved.

**Approvals.** After an order is **Confirmed**, three people approve it in any order: *Corporate Logistic Admin*,
*Corporate Logistic* and *Business Unit PIC*. The **Approve** button appears in the View Order dialog only for users who
may approve that level and have a signature. Setting the order back to Draft clears all approvals.
An admin sets who may approve which level (see `supabase/README.md`).

**Remarks.** Admins and staff can add, and delete, colored notes (red or blue) on an order in any state, for example delivery
updates. They print under the order lines.

---

### 5.9 Deleting an Order

1. Click the **Trash icon** on the order row.
2. A **confirmation dialog** appears showing the order name.
3. If the order is in **Confirmed** state, you are warned that it will be cancelled first before deletion. Only draft and cancelled orders can be deleted.
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

The authoritative definition is in `supabase/migrations/0001_schema.sql`. The shapes the frontend uses are in `src/services/types.ts`.

### Purchase Order (`po_bunker.purchase_orders`)

| Field                | Type                                              | Description                         |
| -------------------- | ------------------------------------------------- | ----------------------------------- |
| `id`                 | bigint                                            | Unique identifier                   |
| `name`               | text                                              | PO number, assigned on create (see below) |
| `company_id`         | bigint → `companies`                              | Issuing company                     |
| `partner_id`         | bigint → `partners`                               | Vendor/supplier                     |
| `order_type`         | `bunker_fuel` / `bunker_water` / `logistic`       | Type of order                       |
| `state`              | `draft` / `to approve` / `purchase` / `done` / `cancel` | Order lifecycle state         |
| `date_order`         | timestamptz                                       | Order date and time                 |
| `date_approve`       | timestamptz                                       | Set when confirmed                  |
| `amount_untaxed`     | numeric                                           | Sum of line subtotals (maintained by trigger) |
| `amount_tax`         | numeric                                           | 0 for now                           |
| `amount_total`       | numeric                                           | untaxed + tax - discount            |
| `notes`              | text                                              | HTML-formatted notes                |
| `option_order`, `partner_ref`, `date_vendor` | text / text / timestamptz        | Vendor quotation/invoice, its number and date |
| `date_bunker`        | timestamptz                                       | Planned bunker date                 |
| `tax_percent`        | numeric (0-100)                                   | VAT %                               |
| `amount_discount`    | numeric (>= 0)                                    | Discount amount (entered by the user) |
| `first/second/third_approved_by`, `_at`, `_signature_path` | uuid / timestamptz / text | Three-level approval with the signature snapshot |

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
| `status_list`    | `onprogress` / `hold` / `cancel` / `close` | Cancelled lines are excluded from totals |

`po_bunker.purchase_order_remarks` holds the colored notes (`order_id`, `remark_date`, `color` merah/biru, `remark`).

---

## 8. Backend (Supabase)

The app uses one Supabase client (`src/lib/supabase.ts`) scoped to the `po_bunker` schema. Data access lives in `src/services/`.

### Authentication

`supabase.auth.signInWithPassword` with email and password. After sign-in the app reads the user's row in `po_bunker.profiles`; no active profile means no access. Roles: `admin`, `staff`, `viewer`.

### Writes to orders

Orders and lines cannot be inserted or updated directly. The app calls database functions:

| RPC                                            | Description                                                   |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `save_purchase_order(p_id, p_header, p_lines)` | Create (`p_id` null) or edit a draft; header and lines atomically |
| `confirm_purchase_order(p_id)`                 | draft → purchase (not an approval)                            |
| `approve_purchase_order(p_id, p_level)`        | confirmed order: `first` / `second` / `third` approval, copies the approver's signature |
| `set_line_status(p_line_id, p_status)`         | change a line's status on a draft or confirmed order          |
| `set_my_signature(p_path)`                     | save the caller's own signature path                          |
| `cancel_purchase_order(p_id)`                  | draft / to approve / purchase → cancel                        |
| `set_purchase_order_draft(p_id)`               | to approve / purchase / cancel → draft                        |

Deleting is a plain `DELETE`, allowed only for draft or cancelled orders.

### Reference data

Companies, partners and regions can be created and edited from the app. **Vessels** are synced from the company SMS vessel API: an admin presses *Sync from SMS* on the Vessels page (an Edge Function holds the API token; vessels that disappear from the API are deactivated, never deleted; inactive vessels can no longer be picked on new orders). Products, code budgets, units of measure, categories and business units are read-only in the app and are managed in Supabase (admin only; see `supabase/README.md` for CSV import).

### Export

PDF (jsPDF) and Excel (ExcelJS) are generated in the browser from the order data. `src/lib/orderPrintData.ts` builds the shared print model, `exportOrderPdf.ts` and `exportOrderExcel.ts` draw the form.

---

## 9. Security

| Measure                 | Implementation                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Authentication**      | Supabase Auth; the session is stored by supabase-js and refreshed automatically                                     |
| **Authorization**       | Row level security on every `po_bunker` table, scoped to users with an active profile; writes limited by role       |
| **Order integrity**     | No direct INSERT/UPDATE on orders; the state machine and totals are enforced in database functions and triggers     |
| **XSS prevention**      | Order notes (HTML) are sanitized with **DOMPurify** before rendering                                                |
| **Input validation**    | Client-side form validation plus database CHECK constraints (order type, state, quantity, priority)                 |
| **Keys**                | Only the public anon key is in the frontend bundle. The service role key must never be used in the browser or committed. |
| **Shared project**      | The Supabase project is shared with other apps; policies require a `po_bunker.profiles` row so other apps' users get nothing |

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
│   ├── services/                          # Supabase data access
│   │   ├── orders.ts                      # Orders, lines, state changes (RPC)
│   │   ├── companies.ts, partners.ts, regions.ts, lookups.ts
│   │   ├── types.ts                       # Row shapes used by the UI
│   │   └── helpers.ts                     # Error mapping
│   └── lib/
│       ├── supabase.ts                    # Supabase client (po_bunker schema)
│       ├── exportOrder.ts                 # PDF + Excel generation
│       └── utils.ts                       # Utility helpers (cn, etc.)
├── index.html
├── vite.config.ts                         # Vite config
├── supabase/                              # Migrations, import templates, DB README
├── tsconfig.json
├── package.json
└── DOCUMENTATION.md
```

---

_Documentation last updated 2026-10-22 — PO Bunker v0.0.0 — PT Barokah Gemilang Perkasa_
