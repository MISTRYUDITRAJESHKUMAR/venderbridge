const { query } = require('../config/db');

/**
 * List all Purchase Orders and Invoices
 */
exports.getPOs = async (req, res) => {
  const user = req.session.user;

  try {
    let pos = [];
    let invoices = [];

    if (user.role === 'VENDOR') {
      // Vendors only see POs and Invoices directed to them
      pos = await query.all(`
        SELECT po.*, r.title as rfq_title, v.name as vendor_name
        FROM purchase_orders po
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN vendors v ON po.vendor_id = v.id
        WHERE po.vendor_id = ?
        ORDER BY po.created_at DESC
      `, [user.vendorId]);

      invoices = await query.all(`
        SELECT i.*, po.po_number, po.grand_total, r.title as rfq_title, v.name as vendor_name
        FROM invoices i
        JOIN purchase_orders po ON i.po_id = po.id
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN vendors v ON po.vendor_id = v.id
        WHERE po.vendor_id = ?
        ORDER BY i.created_at DESC
      `, [user.vendorId]);
    } else {
      // Officers/Approvers see all POs and Invoices
      pos = await query.all(`
        SELECT po.*, r.title as rfq_title, v.name as vendor_name
        FROM purchase_orders po
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN vendors v ON po.vendor_id = v.id
        ORDER BY po.created_at DESC
      `);

      invoices = await query.all(`
        SELECT i.*, po.po_number, po.grand_total, r.title as rfq_title, v.name as vendor_name
        FROM invoices i
        JOIN purchase_orders po ON i.po_id = po.id
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN vendors v ON po.vendor_id = v.id
        ORDER BY i.created_at DESC
      `);
    }

    res.render('pos', {
      title: 'POs & Invoices',
      activePage: 'pos',
      pos,
      invoices
    });
  } catch (error) {
    console.error('Fetch PO/Invoices error:', error);
    res.status(500).render('error', { message: 'Failed to fetch Purchase Orders or Invoices.' });
  }
};

/**
 * Generate Invoice from Purchase Order (by Vendor or Officer)
 */
exports.postGenerateInvoice = async (req, res) => {
  const { poId } = req.body;
  const user = req.session.user;

  try {
    if (!poId) {
      return res.status(400).render('error', { message: 'Purchase Order ID is required.' });
    }

    // 1. Fetch PO details
    const po = await query.get(`
      SELECT po.*, v.name as vendor_name, v.email as vendor_email, r.title as rfq_title
      FROM purchase_orders po
      JOIN vendors v ON po.vendor_id = v.id
      JOIN rfqs r ON po.rfq_id = r.id
      WHERE po.id = ?
    `, [poId]);

    if (!po) {
      return res.status(404).render('error', { message: 'Purchase Order not found.' });
    }

    // 2. Check if invoice already exists
    const existingInvoice = await query.get('SELECT id FROM invoices WHERE po_id = ?', [poId]);
    if (existingInvoice) {
      return res.status(400).render('error', { message: 'An invoice has already been generated for this Purchase Order.' });
    }

    // 3. Insert Invoice
    const invoiceId = 'inv_' + Date.now().toString().slice(-6);
    const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

    await query.run(`
      INSERT INTO invoices (id, po_id, invoice_number, status, created_at)
      VALUES (?, ?, ?, 'PENDING', ?)
    `, [invoiceId, poId, invoiceNumber, new Date().toISOString()]);

    // 4. Update PO status to INVOICED
    await query.run("UPDATE purchase_orders SET status = 'INVOICED' WHERE id = ?", [poId]);

    // 5. Simulate Email Notification to Procurement Officer
    const emailId = 'eml_' + Date.now();
    const emailSubject = `New Invoice Submitted: ${invoiceNumber} for PO ${po.po_number}`;
    const emailBody = `Dear Procurement Team,\n\nThis is to notify you that vendor "${po.vendor_name}" has submitted invoice ${invoiceNumber} against Purchase Order ${po.po_number} (RFQ: ${po.rfq_title}).\n\nInvoice Details:\n- Total Amount: ₹${po.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n- Invoice Date: ${new Date().toLocaleDateString()}\n\nPlease review and approve the payment workflow.\n\nRegards,\nVendorBridge ERP System`;

    await query.run(`
      INSERT INTO mock_emails (id, recipient_email, subject, body, sent_at)
      VALUES (?, ?, ?, ?, ?)
    `, [emailId, 'procurement@vendorbridge.com', emailSubject, emailBody, new Date().toISOString()]);

    // 6. Log Action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'Invoice Generated', `Generated Invoice: ${invoiceNumber} for PO: ${po.po_number} (Value: ₹${po.grand_total})`, new Date().toISOString()]);

    res.redirect('/pos');
  } catch (error) {
    console.error('Invoice generation error:', error);
    res.status(500).render('error', { message: 'Failed to generate invoice.' });
  }
};

/**
 * Pay Invoice (Mark as PAID by Officer/Manager)
 */
exports.postPayInvoice = async (req, res) => {
  const { invoiceId } = req.body;
  const user = req.session.user;

  try {
    if (!invoiceId) {
      return res.status(400).render('error', { message: 'Invoice ID is required.' });
    }

    const invoice = await query.get(`
      SELECT i.*, po.po_number, v.name as vendor_name, v.email as vendor_email
      FROM invoices i
      JOIN purchase_orders po ON i.po_id = po.id
      JOIN vendors v ON po.vendor_id = v.id
      WHERE i.id = ?
    `, [invoiceId]);

    if (!invoice) {
      return res.status(404).render('error', { message: 'Invoice not found.' });
    }

    // Update status to PAID
    await query.run("UPDATE invoices SET status = 'PAID' WHERE id = ?", [invoiceId]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'Invoice Paid', `Marked Invoice ${invoice.invoice_number} as PAID (PO: ${invoice.po_number})`, new Date().toISOString()]);

    res.redirect('/pos');
  } catch (error) {
    console.error('Pay invoice error:', error);
    res.status(500).render('error', { message: 'Failed to record payment.' });
  }
};

/**
 * Render printable document page (Purchase Order or Invoice)
 */
exports.getPrintDocument = async (req, res) => {
  const { type, id } = req.query; // type: 'po' or 'invoice', id: record ID

  try {
    let documentData = {};

    if (type === 'po') {
      const po = await query.get(`
        SELECT po.*, r.title as rfq_title, r.description as rfq_desc, 
               v.name as vendor_name, v.email as vendor_email, v.phone as vendor_phone, v.address as vendor_address, v.gst_number as vendor_gst,
               q.items_json as quote_items_json, q.delivery_timeline_days
        FROM purchase_orders po
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN vendors v ON po.vendor_id = v.id
        JOIN quotes q ON po.quote_id = q.id
        WHERE po.id = ?
      `, [id]);

      if (!po) return res.status(404).render('error', { message: 'Purchase Order not found.' });

      po.items = JSON.parse(po.quote_items_json);
      
      // Map item names back to quote items (using RFQ items definition)
      const rfqItems = JSON.parse(await query.get('SELECT items_json FROM rfqs WHERE id = ?', [po.rfq_id]).then(r => r.items_json));
      po.items.forEach(item => {
        const rfqItem = rfqItems.find(ri => ri.id === item.itemId);
        item.name = rfqItem ? rfqItem.name : 'Procured Item';
        item.quantity = rfqItem ? rfqItem.quantity : 1;
        item.unit = rfqItem ? rfqItem.unit : 'PCS';
      });

      documentData = {
        title: `Purchase Order ${po.po_number}`,
        docType: 'Purchase Order',
        number: po.po_number,
        date: po.created_at,
        rfqTitle: po.rfq_title,
        rfqDesc: po.rfq_desc,
        vendor: {
          name: po.vendor_name,
          email: po.vendor_email,
          phone: po.vendor_phone,
          address: po.vendor_address,
          gst: po.vendor_gst
        },
        items: po.items,
        subTotal: po.sub_total,
        taxRate: po.tax_rate_percent,
        taxAmount: po.tax_amount,
        grandTotal: po.grand_total,
        timeline: `${po.delivery_timeline_days} Days`
      };

    } else if (type === 'invoice') {
      const inv = await query.get(`
        SELECT i.*, po.po_number, po.tax_rate_percent, po.sub_total, po.tax_amount, po.grand_total, po.rfq_id, po.quote_id,
               v.name as vendor_name, v.email as vendor_email, v.phone as vendor_phone, v.address as vendor_address, v.gst_number as vendor_gst,
               r.title as rfq_title, q.items_json as quote_items_json
        FROM invoices i
        JOIN purchase_orders po ON i.po_id = po.id
        JOIN vendors v ON po.vendor_id = v.id
        JOIN rfqs r ON po.rfq_id = r.id
        JOIN quotes q ON po.quote_id = q.id
        WHERE i.id = ?
      `, [id]);

      if (!inv) return res.status(404).render('error', { message: 'Invoice not found.' });

      inv.items = JSON.parse(inv.quote_items_json);
      const rfqItems = JSON.parse(await query.get('SELECT items_json FROM rfqs WHERE id = ?', [inv.rfq_id]).then(r => r.items_json));
      inv.items.forEach(item => {
        const rfqItem = rfqItems.find(ri => ri.id === item.itemId);
        item.name = rfqItem ? rfqItem.name : 'Procured Item';
        item.quantity = rfqItem ? rfqItem.quantity : 1;
        item.unit = rfqItem ? rfqItem.unit : 'PCS';
      });

      documentData = {
        title: `Invoice ${inv.invoice_number}`,
        docType: 'Commercial Invoice',
        number: inv.invoice_number,
        poNumber: inv.po_number,
        date: inv.created_at,
        rfqTitle: inv.rfq_title,
        vendor: {
          name: inv.vendor_name,
          email: inv.vendor_email,
          phone: inv.vendor_phone,
          address: inv.vendor_address,
          gst: inv.vendor_gst
        },
        items: inv.items,
        subTotal: inv.sub_total,
        taxRate: inv.tax_rate_percent,
        taxAmount: inv.tax_amount,
        grandTotal: inv.grand_total,
        status: inv.status
      };
    } else {
      return res.status(400).render('error', { message: 'Invalid document type requested.' });
    }

    res.render('print-document', {
      layout: false, // Don't wrap in layout headers (standalone printable EJS template)
      doc: documentData
    });
  } catch (error) {
    console.error('Render print doc error:', error);
    res.status(500).render('error', { message: 'Failed to render document for printing.' });
  }
};
