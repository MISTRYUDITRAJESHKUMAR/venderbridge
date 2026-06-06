# VendorBridge ERP

VendorBridge is an elite, production-grade **Procurement & Vendor Management ERP** platform designed to automate and streamline supply chain operations. It covers the complete procurement lifecycle from RFQ creation to quotation submissions, comparison algorithms, manager approvals, Purchase Order drafting, billing invoice processing, and full transactional log auditing.

---

## 🛠️ Technology Stack

* **Backend Environment**: Node.js & Express.js
* **Relational Database**: SQLite (zero-install local file persistence: `vendorbridge.sqlite`)
* **Security & Authentication**: `bcryptjs` (password hashing) & `express-session` (session tokens)
* **Templating Engine**: EJS (Embedded JavaScript) for modular views and component layout
* **Analytics**: Chart.js (client-side data visualization)
* **Icons Package**: Lucide Icons (rendered dynamically via CDN)

---

## ⚡ Quick Start & Installation

1. **Install Node.js**: Ensure you have Node.js (version 18 or above) installed.
2. **Install Dependencies**:
   Run the following command in the project root:
   ```bash
   npm install
   ```
3. **Start the Server**:
   Start the local Express server:
   ```bash
   npm start
   ```
4. **Open Application**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Demo Accounts for Grading & Testing

Pre-seeded credentials are provided on the login page for convenience:

* **Procurement Officer**: `officer@vendorbridge.com` (Password: `officer123`)
* **Winning Vendor**: `vendor@vendorbridge.com` (Password: `vendor123`)
* **Manager / Approver**: `manager@vendorbridge.com` (Password: `manager123`)
* **System Administrator**: `admin@vendorbridge.com` (Password: `admin123`)

---

## 🏗️ Folder Structure

```
d:/Udit Oddo Hackathon/
├── src/
│   ├── config/           # Database connections and seeding
│   ├── controllers/      # MVC controllers containing logic flows
│   ├── middleware/       # Route authentication and role checkers
│   ├── public/           # Static css, prints-css, and javascripts
│   ├── routes/           # Routing engines mapping URLs
│   └── views/            # EJS page layouts and reusable components
├── server.js             # Main server execution entry point
├── package.json          # Manifest scripts and dependencies
└── README.md             # Documentation guide
```

---

## 🌟 Elite Features

1. **Role-Based Guards**: Restricts views and API calls strictly according to user permissions (Admin, Officer, Manager, Vendor).
2. **Dynamic Forms**: Client-side JavaScript handles adding/deleting rows on RFQ creation and computes line totals instantly on quotation entry.
3. **Comparison Calculations**: Automatically identifies and highlights the **Lowest Price** (green border) and **Fastest Delivery** (blue border) bids side-by-side.
4. **FSM Workflow Integrations**: When a manager approves a quote, competing bids for that RFQ are automatically marked `REJECTED`, the RFQ is `CLOSED`, a PO is generated, and a notification email is created in the outbox.
5. **Print Engine**: Fully configured `@media print` rules strip sidebars and buttons, presenting invoices and POs as official company sheets.
6. **Analytics charts**: Rendered using Chart.js to track monthly spending and vendor rankings.
7. **Simulated SMTP Logs**: Captures notifications dispatched to vendors and officers, visible in a central Outbox panel.
