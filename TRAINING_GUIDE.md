# PO Bunker — Staff Training Guide

> A practical, step-by-step guide for staff learning to use the PO Bunker application.
> Use this document as the basis for training sessions and presentations.

---

## Table of Contents

1. [Purpose of This Guide](#1-purpose-of-this-guide)
2. [What is PO Bunker?](#2-what-is-po-bunker)
3. [Before You Start](#3-before-you-start)
4. [Logging In](#4-logging-in)
5. [Understanding the Screen Layout](#5-understanding-the-screen-layout)
6. [Task 1: Viewing the Orders List](#6-task-1-viewing-the-orders-list)
7. [Task 2: Creating a New Purchase Order](#7-task-2-creating-a-new-purchase-order)
8. [Task 3: Adding Priority & Requested By (Editing)](#8-task-3-adding-priority--requested-by-editing)
9. [Task 4: Confirming, Cancelling, and Draft](#9-task-4-confirming-cancelling-and-draft)
10. [Task 5: Printing and Downloading an Order](#10-task-5-printing-and-downloading-an-order)
11. [Task 6: Deleting an Order](#11-task-6-deleting-an-order)
12. [Quick Reference Cheat Sheet](#12-quick-reference-cheat-sheet)
13. [Do's and Don'ts](#13-dos-and-donts)
14. [Common Problems & Fixes](#14-common-problems--fixes)
15. [Frequently Asked Questions](#15-frequently-asked-questions)
16. [Getting Help](#16-getting-help)

---

## 1. Purpose of This Guide

This guide is designed to train new and existing staff on how to use **PO Bunker**, the company's Purchase Order (PO) system. It focuses on **practical, everyday usage** rather than technical details.

Use this guide to:

- Onboard new staff members quickly
- Serve as a reference during live training sessions or presentations
- Standardize how the team creates and manages purchase orders

---

## 2. What is PO Bunker?

PO Bunker is the internal web application used by **PT Barokah Gemilang Perkasa** to create and manage **Purchase Orders (POs)** for vessel supplies — such as bunker fuel, fresh water, and logistics — across the company's fleet and operational regions.

**Why it matters:**

- Replaces manual/paper-based ordering with a single digital system
- Keeps a full history of every order, who created it, and its approval status
- Produces ready-to-print PDF and Excel documents for each order
- Reduces errors by auto-filling product details (category, unit, budget code)

---

## 3. Before You Start

Make sure you have:

- [ ] A working **email and password** account provided by your administrator
- [ ] Access to the company network / VPN (if required)
- [ ] A modern web browser (Chrome, Edge, or Firefox — latest version recommended)
- [ ] The application URL bookmarked

> If you don't have login credentials yet, contact your system administrator before the training session.

---

## 4. Logging In

**Steps:**

1. Open the PO Bunker URL in your browser.
2. You'll see the **Welcome Back** login screen with the company logo.
3. Enter your **Email Address**.
4. Enter your **Password**.
   - Use the eye icon to reveal/hide your password if you want to double check it.
5. Click **Sign In**.

**If login fails:**

- Double-check your email format (must look like `name@example.com`).
- Password must be at least 6 characters.
- If you still can't log in, contact your administrator — your account may need to be reset or activated.

Once logged in, you'll stay signed in even if you close and reopen the browser, until you click **Log Out**.

---

## 5. Understanding the Screen Layout

After logging in, the screen is divided into two main areas:

```
┌───────────────┬─────────────────────────────────────┐
│               │                                     │
│   SIDEBAR     │           MAIN CONTENT               │
│               │                                     │
│  - Overview   │   (Orders table, forms, etc. show   │
│  - Orders     │    up here depending on what you     │
│  - Logout     │    click on the sidebar)             │
│               │                                     │
└───────────────┴─────────────────────────────────────┘
```

- **Sidebar (left):** Your main navigation. Click the arrow icon at the top to collapse it and get more screen space.
- **Orders:** This is where you'll spend most of your time — creating and managing purchase orders.
- **Overview:** A dashboard summary (still under development).
- **Your avatar (bottom of sidebar):** Click it to log out.

> Tip: The app remembers which tab you were on last time, so it will open where you left off.

---

## 6. Task 1: Viewing the Orders List

1. Click **Orders** in the sidebar.
2. You'll see a table listing all purchase orders with:
   - Order number, vendor, company, order type, date, total amount, and status.
3. Click the **arrow (▼)** next to any row to expand it and see the individual items in that order — without opening a new window.
4. Use the **Previous / Next** buttons at the bottom to move between pages (10 orders shown per page).

---

## 7. Task 2: Creating a New Purchase Order

This is the most common task you'll perform.

### Step-by-step:

1. On the **Orders** page, click the green **"+ Add New Order"** button (top-right corner).
2. A form window will pop up. Fill in the **Order Details** section first:

   | Field                 | What to enter                                       |
   | --------------------- | --------------------------------------------------- |
   | **Customer**          | The vendor/supplier this PO is for                  |
   | **Company**           | Your issuing company                                |
   | **Order Type**        | Choose: Bunker Fuel / Bunker Fresh Water / Logistic |
   | **Order Date & Time** | The date and time this order is placed              |

3. Scroll down to **Product Lines**. Each order needs at least **one line item**:

   | Field                             | What to do                                                                   |
   | --------------------------------- | ---------------------------------------------------------------------------- |
   | **Product**                       | Type to search and select the product needed                                 |
   | **Vessel**                        | Type to search and select the vessel (you can search by ship name)           |
   | **Region**                        | Type to search and select the operating region (optional)                    |
   | **Quantity**                      | Enter how many units are needed                                              |
   | **Unit Price**                    | Enter the price per unit                                                     |
   | **Project**                       | Optional free-text project reference                                         |
   | **Category / Unit / Code Budget** | These fill in automatically once you select a Product — no need to type them |
   - Need more than one item? Click **"Add Line"** to add another row.
   - Made a mistake on a line? Click the **trash icon** on that row to remove it.
   - The **subtotal** and **grand total** update automatically as you type.

4. Add any **Notes** at the bottom if needed (supports bold, italic, and lists).
5. Click **"Create Order"**.

Your new order will appear in the Orders table with a **Draft** status badge.

> **Important:** When first creating an order, the **Priority** and **Requested By** fields are not available yet. You'll add those after creating the order — see [Task 3](#8-task-3-adding-priority--requested-by-editing) below.

---

## 8. Task 3: Adding Priority & Requested By (Editing)

Some fields — **Priority** and **Requested By** — can only be filled in when **editing** an order (not while first creating it).

### Step-by-step:

1. On the Orders table, find the order you just created (it should be in **Draft** status).
2. Click the **Pencil (Edit) icon** on that row.
3. In the form that opens, scroll to the line item you want to update:
   - **Priority:** Choose **L (Low)**, **M (Medium)**, or **H (High)** depending on urgency.
   - **Requested By:** Search and select the staff member who requested this item.
4. Click **"Update Order"** to save your changes.

> Only orders in **Draft** status can be edited. Once an order is Confirmed, you must set it back to Draft first if changes are needed.

---

## 9. Task 4: Confirming, Cancelling, and Draft

Every order moves through a simple lifecycle:

```
   DRAFT  ──Confirm──►  CONFIRMED
     ▲                      │
     └──────Set Draft───────┘
     │                      │
     └────────Cancel────────┘
                             │
                        CANCELLED
```

| I want to...             | What to click             | Where                                               |
| ------------------------ | ------------------------- | --------------------------------------------------- |
| Approve/lock in an order | ✅ **Confirm** button     | Orders table row, or inside the order's View window |
| Undo a confirmation      | ↩ **Set to Draft** button | Same as above                                       |
| Cancel an order          | ✕ **Cancel** button       | Same as above                                       |

Status badges tell you the current state at a glance:

- **Gray** = Draft
- **Green** = Confirmed
- **Red** = Cancelled

---

## 10. Task 5: Printing and Downloading an Order

Once an order is created, you can generate documents for it:

### To preview/print as PDF:

1. Click the **Printer icon** on the order's row.
2. Wait a moment while the PDF is generated.
3. A preview window opens — use your browser's built-in print/save controls to print or save it.
4. Click **Close** when done.

### To download as Excel:

1. Click the **Download icon** on the order's row.
2. The `.xlsx` file downloads automatically to your computer's Downloads folder.

---

## 11. Task 6: Deleting an Order

1. Click the **Trash icon** on the order's row.
2. A confirmation window will appear asking you to confirm.
3. If the order was already **Confirmed**, you'll be warned it will be cancelled first.
4. Click **Confirm Delete** to permanently remove it, or **Cancel** to back out.

> ⚠️ **Deletion cannot be undone.** Always double-check the order name before confirming.

---

## 12. Quick Reference Cheat Sheet

| Icon / Button   | Action                               |
| --------------- | ------------------------------------ |
| 👁 Eye          | View order details                   |
| ✏️ Pencil       | Edit order (Draft only)              |
| 🖨 Printer      | Preview/print PDF                    |
| ⬇ Download      | Download Excel file                  |
| 🗑 Trash        | Delete order                         |
| ✅ Check        | Confirm order                        |
| ✕               | Cancel order                         |
| ↩               | Set order back to Draft              |
| ▼               | Expand row to see line items         |
| + Add New Order | Create a new PO                      |
| + Add Line      | Add another product line to the form |

---

## 13. Do's and Don'ts

**Do:**

- ✅ Double-check vendor, company, and vessel before submitting.
- ✅ Use the search box in dropdowns (Vessel, Region, Code Budget, Requested By) instead of scrolling.
- ✅ Set the correct Priority after creating an order so urgent requests are visible.
- ✅ Confirm an order only when everything is finalized.

**Don't:**

- ❌ Don't delete an order unless you're sure — it can't be recovered.
- ❌ Don't try to edit a Confirmed order directly — set it to Draft first.
- ❌ Don't leave the Quantity or Unit Price blank — both are required per line.
- ❌ Don't forget to click **Create/Update Order** — closing the window without saving discards your changes.

---

## 14. Common Problems & Fixes

| Problem                                       | Likely Cause                     | Fix                                                      |
| --------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| Can't log in                                  | Wrong email/password format      | Check email format and that password is 6+ characters    |
| Edit (pencil) button doesn't work             | Order is not in Draft status     | Set the order back to Draft first, then edit             |
| Priority / Requested By missing when creating | These fields are edit-only       | Create the order first, then edit it to add these fields |
| Dropdown shows "Loading..." for a long time   | Slow network or backend issue    | Wait a moment; if it persists, refresh the page          |
| PDF/Excel button spinning with no result      | Server generating a large report | Wait a few seconds; try again if it fails                |

---

## 15. Frequently Asked Questions

**Q: Can I edit an order after it's Confirmed?**
A: Not directly. Set it back to **Draft** first using the ↩ button, then edit it.

**Q: What's the difference between Priority and Order Type?**
A: **Order Type** (Bunker Fuel / Fresh Water / Logistic) describes what kind of PO it is. **Priority** (Low/Medium/High) describes how urgent a specific line item is.

**Q: Why can't I set Priority or Requested By when creating a new order?**
A: These two fields are currently only supported through the **Edit** flow. Always create the order first, then edit it to fill these in.

**Q: I deleted an order by mistake. Can I get it back?**
A: No — deletion is permanent. Please be careful and always confirm the order name before deleting.

**Q: How do I know which orders need my attention?**
A: Look for orders in **Draft** status — these haven't been confirmed yet and may still need editing or approval.

---

## 16. Getting Help

If you run into an issue not covered in this guide:

1. Take a screenshot of the error message (if any).
2. Note what you were trying to do and which order (if applicable).
3. Contact your system administrator or IT support with these details.

---

_Training guide prepared for PO Bunker staff onboarding — PT Barokah Gemilang Perkasa_
