const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../vendorbridge.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Enable Foreign Key support in SQLite
db.run('PRAGMA foreign_keys = ON');

// Promisified query wrappers
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

async function initDb() {
  try {
    // Create Tables
    await query.exec(`
      CREATE TABLE IF NOT EXISTS vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        gst_number TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        rating REAL DEFAULT 0.0,
        status TEXT CHECK(status IN ('ACTIVE', 'PENDING_APPROVAL', 'BLACKLISTED')) DEFAULT 'ACTIVE'
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('PROCUREMENT_OFFICER', 'VENDOR', 'APPROVER', 'ADMIN')) NOT NULL,
        vendor_id TEXT,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS rfqs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        items_json TEXT NOT NULL,
        deadline TEXT NOT NULL,
        status TEXT CHECK(status IN ('DRAFT', 'ACTIVE', 'CLOSED')) DEFAULT 'DRAFT',
        created_at TEXT NOT NULL
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS rfq_assignments (
        rfq_id TEXT,
        vendor_id TEXT,
        PRIMARY KEY (rfq_id, vendor_id),
        FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id TEXT PRIMARY KEY,
        rfq_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        items_json TEXT NOT NULL,
        delivery_timeline_days INTEGER NOT NULL,
        notes TEXT,
        status TEXT CHECK(status IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')) DEFAULT 'SUBMITTED',
        submitted_at TEXT NOT NULL,
        approval_remarks TEXT,
        approved_by TEXT,
        FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        rfq_id TEXT NOT NULL,
        quote_id TEXT NOT NULL,
        vendor_id TEXT NOT NULL,
        po_number TEXT UNIQUE NOT NULL,
        tax_rate_percent REAL NOT NULL,
        sub_total REAL NOT NULL,
        tax_amount REAL NOT NULL,
        grand_total REAL NOT NULL,
        status TEXT CHECK(status IN ('ISSUED', 'INVOICED')) DEFAULT 'ISSUED',
        created_at TEXT NOT NULL,
        FOREIGN KEY (rfq_id) REFERENCES rfqs(id) ON DELETE CASCADE,
        FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        status TEXT CHECK(status IN ('PENDING', 'PAID')) DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await query.exec(`
      CREATE TABLE IF NOT EXISTS mock_emails (
        id TEXT PRIMARY KEY,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        sent_at TEXT NOT NULL
      );
    `);

    console.log('Database tables verified/created successfully.');

    // Seed initial data if database is empty
    const userCount = await query.get('SELECT COUNT(*) as count FROM users');
    if (userCount.count === 0) {
      console.log('Seeding initial mock data...');

      // Seed Vendors
      const seedVendors = [
        {
          id: 'ven_001',
          name: 'Apex Global Technologies',
          category: 'Hardware & IT Equipment',
          gst_number: '27AAAAA1111A1Z1',
          email: 'sales@apexglobal.com',
          phone: '+91 9876543210',
          address: '404 Bandra Kurla Complex, Mumbai, MH',
          rating: 4.8,
          status: 'ACTIVE'
        },
        {
          id: 'ven_002',
          name: 'Nippon Office Essentials',
          category: 'Office Stationery',
          gst_number: '27BBBBB2222B2Z2',
          email: 'support@nipponoffice.com',
          phone: '+91 8765432109',
          address: 'G-12, Outer Ring Road, Bengaluru, KA',
          rating: 4.2,
          status: 'ACTIVE'
        },
        {
          id: 'ven_003',
          name: 'Cybernetic Solutions Corp',
          category: 'Software Licenses & Cloud Services',
          gst_number: '27CCCCC3333C3Z3',
          email: 'info@cybernetics.com',
          phone: '+91 7654321098',
          address: 'Sector 62, Noida, UP',
          rating: 3.9,
          status: 'ACTIVE'
        }
      ];

      for (const vendor of seedVendors) {
        await query.run(`
          INSERT INTO vendors (id, name, category, gst_number, email, phone, address, rating, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [vendor.id, vendor.name, vendor.category, vendor.gst_number, vendor.email, vendor.phone, vendor.address, vendor.rating, vendor.status]);
      }

      // Seed Users
      const saltRounds = 10;
      const seedUsers = [
        {
          id: 'usr_001',
          name: 'John Doe (Officer)',
          email: 'officer@vendorbridge.com',
          password: 'officer123',
          role: 'PROCUREMENT_OFFICER',
          vendor_id: null
        },
        {
          id: 'usr_002',
          name: 'Apex Global Sales (Vendor)',
          email: 'vendor@vendorbridge.com',
          password: 'vendor123',
          role: 'VENDOR',
          vendor_id: 'ven_001'
        },
        {
          id: 'usr_003',
          name: 'Sarah Jenkins (Approver)',
          email: 'manager@vendorbridge.com',
          password: 'manager123',
          role: 'APPROVER',
          vendor_id: null
        },
        {
          id: 'usr_004',
          name: 'System Admin',
          email: 'admin@vendorbridge.com',
          password: 'admin123',
          role: 'ADMIN',
          vendor_id: null
        }
      ];

      for (const user of seedUsers) {
        const hash = bcrypt.hashSync(user.password, saltRounds);
        await query.run(`
          INSERT INTO users (id, name, email, password_hash, role, vendor_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [user.id, user.name, user.email, hash, user.role, user.vendor_id]);
      }

      // Seed a sample RFQ
      const sampleRFQ = {
        id: 'rfq_001',
        title: 'High Performance Laptops for Developers',
        description: 'Requirement for 15 developer machines with standard configuration: i9 processor, 32GB RAM, 1TB SSD.',
        items_json: JSON.stringify([
          { id: 'itm_1', name: 'Developer Laptop i9 32GB 1TB', quantity: 15, unit: 'PCS', description: 'Includes 3 years accidental damage protection.' }
        ]),
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days from now
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      };

      await query.run(`
        INSERT INTO rfqs (id, title, description, items_json, deadline, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [sampleRFQ.id, sampleRFQ.title, sampleRFQ.description, sampleRFQ.items_json, sampleRFQ.deadline, sampleRFQ.status, sampleRFQ.created_at]);

      // Assign the sample RFQ to Apex Global Technologies
      await query.run(`
        INSERT INTO rfq_assignments (rfq_id, vendor_id)
        VALUES (?, ?)
      `, [sampleRFQ.id, 'ven_001']);

      // Log initial action
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['log_001', 'usr_001', 'John Doe (Officer)', 'RFQ Creation', 'Created and published RFQ rfq_001', new Date().toISOString()]);

      console.log('Seeding finished successfully.');
    }
  } catch (err) {
    console.error('Initialization / seeding failed:', err);
  }
}

module.exports = {
  db,
  query,
  initDb
};
