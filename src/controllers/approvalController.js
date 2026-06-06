const { query } = require('../config/db');

/**
 * List Approvals pending and history
 */
exports.getApprovals = async (req, res) => {
  const user = req.session.user;

  try {
    let pendingApprovals = [];
    let approvalHistory = [];

    if (user.role === 'APPROVER') {
      // Managers see quotes waiting for approval
      pendingApprovals = await query.all(`
        SELECT q.*, r.title as rfq_title, v.name as vendor_name, v.rating as vendor_rating
        FROM quotes q
        JOIN rfqs r ON q.rfq_id = r.id
        JOIN vendors v ON q.vendor_id = v.id
        WHERE q.status = 'UNDER_REVIEW'
        ORDER BY q.submitted_at ASC
      `);

      approvalHistory = await query.all(`
        SELECT q.*, r.title as rfq_title, v.name as vendor_name, u.name as approver_name
        FROM quotes q
        JOIN rfqs r ON q.rfq_id = r.id
        JOIN vendors v ON q.vendor_id = v.id
        LEFT JOIN users u ON q.approved_by = u.id
        WHERE q.status IN ('APPROVED', 'REJECTED')
        ORDER BY q.submitted_at DESC LIMIT 15
      `);
    } else if (user.role === 'PROCUREMENT_OFFICER') {
      // Officers see status of quotes they requested approval for
      pendingApprovals = await query.all(`
        SELECT q.*, r.title as rfq_title, v.name as vendor_name
        FROM quotes q
        JOIN rfqs r ON q.rfq_id = r.id
        JOIN vendors v ON q.vendor_id = v.id
        WHERE q.status = 'UNDER_REVIEW'
        ORDER BY q.submitted_at ASC
      `);

      approvalHistory = await query.all(`
        SELECT q.*, r.title as rfq_title, v.name as vendor_name, u.name as approver_name
        FROM quotes q
        JOIN rfqs r ON q.rfq_id = r.id
        JOIN vendors v ON q.vendor_id = v.id
        LEFT JOIN users u ON q.approved_by = u.id
        WHERE q.status IN ('APPROVED', 'REJECTED')
        ORDER BY q.submitted_at DESC LIMIT 15
      `);
    }

    // Parse items for pending approvals to calculate total values
    for (let quote of pendingApprovals) {
      quote.items = JSON.parse(quote.items_json);
      quote.totalValue = quote.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }
    for (let quote of approvalHistory) {
      quote.items = JSON.parse(quote.items_json);
      quote.totalValue = quote.items.reduce((sum, item) => sum + item.totalPrice, 0);
    }

    res.render('approvals', {
      title: 'Procurement Approvals',
      activePage: 'approvals',
      pendingApprovals,
      approvalHistory
    });
  } catch (error) {
    console.error('Approvals fetch error:', error);
    res.status(500).render('error', { message: 'Failed to retrieve approval list.' });
  }
};

/**
 * Handle POST request approval submission (by Officer)
 */
exports.postRequestApproval = async (req, res) => {
  const { quoteId, rfqId } = req.body;
  const user = req.session.user;

  try {
    if (!quoteId || !rfqId) {
      return res.status(400).render('error', { message: 'Missing required parameters.' });
    }

    // Update quote status to UNDER_REVIEW
    await query.run("UPDATE quotes SET status = 'UNDER_REVIEW' WHERE id = ?", [quoteId]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'Approval Requested', `Requested manager approval for Quote ID: ${quoteId} (RFQ ID: ${rfqId})`, new Date().toISOString()]);

    res.redirect(`/quotes/compare?rfqId=${rfqId}`);
  } catch (error) {
    console.error('Request approval error:', error);
    res.status(500).render('error', { message: 'Failed to submit approval request.' });
  }
};

/**
 * Handle POST Action Approval (by Manager - Approve or Reject)
 */
exports.postActionApproval = async (req, res) => {
  const { quoteId, action, remarks } = req.body;
  const user = req.session.user;

  try {
    if (!quoteId || !action || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).render('error', { message: 'Invalid action parameters.' });
    }

    // 1. Fetch Quote & RFQ Details
    const quote = await query.get(`
      SELECT q.*, r.title as rfq_title, v.name as vendor_name, v.email as vendor_email
      FROM quotes q
      JOIN rfqs r ON q.rfq_id = r.id
      JOIN vendors v ON q.vendor_id = v.id
      WHERE q.id = ?
    `, [quoteId]);

    if (!quote) {
      return res.status(404).render('error', { message: 'Quotation not found.' });
    }

    if (quote.status !== 'UNDER_REVIEW') {
      return res.status(400).render('error', { message: 'This quotation is not pending review.' });
    }

    const logId = 'log_' + Date.now();

    if (action === 'APPROVE') {
      // A. Update current quote to APPROVED
      await query.run(`
        UPDATE quotes 
        SET status = 'APPROVED', approved_by = ?, approval_remarks = ? 
        WHERE id = ?
      `, [user.id, remarks ? remarks.trim() : 'Approved by manager', quoteId]);

      // B. Reject other competing quotes for this RFQ
      await query.run(`
        UPDATE quotes 
        SET status = 'REJECTED', approval_remarks = ?
        WHERE rfq_id = ? AND id != ? AND status IN ('SUBMITTED', 'UNDER_REVIEW')
      `, [`Competing quotation approved: ${quote.vendor_name}`, quote.rfq_id, quoteId]);

      // C. Close the RFQ to prevent any further operations
      await query.run("UPDATE rfqs SET status = 'CLOSED' WHERE id = ?", [quote.rfq_id]);

      // D. Generate Purchase Order
      const items = JSON.parse(quote.items_json);
      const subTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const taxRatePercent = 18.0; // GST rate
      const taxAmount = subTotal * (taxRatePercent / 100);
      const grandTotal = subTotal + taxAmount;
      
      const poId = 'po_' + Date.now().toString().slice(-6);
      const poNumber = 'PO-' + new Date().getFullYear() + '-' + Math.floor(1000 + Math.random() * 9000);

      await query.run(`
        INSERT INTO purchase_orders (id, rfq_id, quote_id, vendor_id, po_number, tax_rate_percent, sub_total, tax_amount, grand_total, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', ?)
      `, [poId, quote.rfq_id, quoteId, quote.vendor_id, poNumber, taxRatePercent, subTotal, taxAmount, grandTotal, new Date().toISOString()]);

      // E. Write Mock Email Notification to Database
      const emailId = 'eml_' + Date.now();
      const emailSubject = `Purchase Order Issued: ${poNumber} - ${quote.rfq_title}`;
      const emailBody = `Dear ${quote.vendor_name},\n\nWe are pleased to inform you that your quotation for RFQ "${quote.rfq_title}" has been APPROVED. \n\nPurchase Order ${poNumber} has been successfully issued to your firm for a total value of ₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (including 18% GST).\n\nPlease log in to VendorBridge ERP to view the PO details and generate your invoice.\n\nRegards,\nProcurement Team\nVendorBridge`;
      
      await query.run(`
        INSERT INTO mock_emails (id, recipient_email, subject, body, sent_at)
        VALUES (?, ?, ?, ?, ?)
      `, [emailId, quote.vendor_email, emailSubject, emailBody, new Date().toISOString()]);

      // F. Log action
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [logId, user.id, user.name, 'Approval Approved', `Approved Quote ID: ${quoteId} from ${quote.vendor_name}. Issued PO: ${poNumber}.`, new Date().toISOString()]);

    } else {
      // B. Reject quotation
      await query.run(`
        UPDATE quotes 
        SET status = 'REJECTED', approval_remarks = ? 
        WHERE id = ?
      `, [remarks ? remarks.trim() : 'Rejected by manager', quoteId]);

      // Log action
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [logId, user.id, user.name, 'Approval Rejected', `Rejected Quote ID: ${quoteId} from ${quote.vendor_name} with remarks: "${remarks}"`, new Date().toISOString()]);
    }

    res.redirect('/approvals');
  } catch (error) {
    console.error('Approval action error:', error);
    res.status(500).render('error', { message: 'Failed to record approval decision.' });
  }
};
