const { query } = require('../config/db');

/**
 * List RFQs depending on user role
 */
exports.getRFQs = async (req, res) => {
  const user = req.session.user;

  try {
    let rfqs = [];

    if (user.role === 'VENDOR') {
      // Vendors only see ACTIVE RFQs assigned to them
      rfqs = await query.all(`
        SELECT DISTINCT r.* 
        FROM rfqs r
        JOIN rfq_assignments ra ON r.id = ra.rfq_id
        WHERE ra.vendor_id = ? AND r.status = 'ACTIVE'
        ORDER BY r.created_at DESC
      `, [user.vendorId]);
      
      // Check if vendor has already quoted
      for (let rfq of rfqs) {
        const existingQuote = await query.get('SELECT id, status FROM quotes WHERE rfq_id = ? AND vendor_id = ?', [rfq.id, user.vendorId]);
        rfq.vendorQuote = existingQuote || null;
      }
    } else {
      // Officers/Approvers see all RFQs
      rfqs = await query.all('SELECT * FROM rfqs ORDER BY created_at DESC');
    }

    // Map items_json back to JS objects and count quotes
    for (let rfq of rfqs) {
      rfq.items = JSON.parse(rfq.items_json);
      const quoteCount = await query.get('SELECT COUNT(*) as count FROM quotes WHERE rfq_id = ?', [rfq.id]);
      rfq.quoteCount = quoteCount.count;
    }

    res.render('rfqs', {
      title: 'RFQs Management',
      activePage: 'rfqs',
      rfqs
    });
  } catch (error) {
    console.error('RFQ fetch error:', error);
    res.status(500).render('error', { message: 'Failed to retrieve RFQs.' });
  }
};

/**
 * Render Create RFQ Screen
 */
exports.getCreateRFQ = async (req, res) => {
  try {
    // Only Active vendors can be assigned RFQs
    const vendors = await query.all("SELECT id, name, category FROM vendors WHERE status = 'ACTIVE' ORDER BY name ASC");
    res.render('rfq-create', {
      title: 'Create RFQ',
      activePage: 'rfqs',
      vendors
    });
  } catch (error) {
    console.error('Create RFQ preparation error:', error);
    res.status(500).render('error', { message: 'Failed to prepare RFQ creation form.' });
  }
};

/**
 * Handle POST Create RFQ
 */
exports.postCreateRFQ = async (req, res) => {
  const { title, description, deadline, assignedVendors, item_name, item_qty, item_unit, item_desc } = req.body;
  const user = req.session.user;

  try {
    if (!title || !description || !deadline || !assignedVendors || assignedVendors.length === 0) {
      return res.status(400).render('error', { message: 'Missing required RFQ fields or no vendors assigned.' });
    }

    // Format items array
    const items = [];
    if (Array.isArray(item_name)) {
      for (let i = 0; i < item_name.length; i++) {
        if (item_name[i].trim() !== '') {
          items.push({
            id: 'itm_' + Date.now() + '_' + i,
            name: item_name[i].trim(),
            quantity: parseFloat(item_qty[i]) || 1,
            unit: item_unit[i],
            description: item_desc[i] ? item_desc[i].trim() : ''
          });
        }
      }
    } else if (item_name && item_name.trim() !== '') {
      items.push({
        id: 'itm_' + Date.now() + '_0',
        name: item_name.trim(),
        quantity: parseFloat(item_qty) || 1,
        unit: item_unit,
        description: item_desc ? item_desc.trim() : ''
      });
    }

    if (items.length === 0) {
      return res.status(400).render('error', { message: 'An RFQ must contain at least one item.' });
    }

    const rfqId = 'rfq_' + Date.now().toString().slice(-6);

    // Save RFQ (status is set to ACTIVE directly to make it visible to assigned vendors)
    await query.run(`
      INSERT INTO rfqs (id, title, description, items_json, deadline, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)
    `, [rfqId, title.trim(), description.trim(), JSON.stringify(items), new Date(deadline).toISOString(), new Date().toISOString()]);

    // Save Assignments
    const vendorIds = Array.isArray(assignedVendors) ? assignedVendors : [assignedVendors];
    for (const vendorId of vendorIds) {
      await query.run(`
        INSERT INTO rfq_assignments (rfq_id, vendor_id)
        VALUES (?, ?)
      `, [rfqId, vendorId]);
    }

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'RFQ Creation', `Created RFQ: ${title} (ID: ${rfqId}) assigned to ${vendorIds.length} vendors`, new Date().toISOString()]);

    res.redirect('/rfqs');
  } catch (error) {
    console.error('RFQ creation error:', error);
    res.status(500).render('error', { message: 'Failed to create RFQ.' });
  }
};

/**
 * Handle POST Close RFQ (locks submission)
 */
exports.postCloseRFQ = async (req, res) => {
  const { id } = req.params;
  const user = req.session.user;

  try {
    const rfq = await query.get('SELECT title FROM rfqs WHERE id = ?', [id]);
    if (!rfq) {
      return res.status(404).render('error', { message: 'RFQ not found.' });
    }

    // Transition RFQ state
    await query.run("UPDATE rfqs SET status = 'CLOSED' WHERE id = ?", [id]);

    // Transaction-like update: Auto-reject all pending quotes on this closed RFQ
    const rejectedCount = await query.run(`
      UPDATE quotes 
      SET status = 'REJECTED', approval_remarks = 'RFQ was closed by Procurement Officer'
      WHERE rfq_id = ? AND status IN ('SUBMITTED', 'UNDER_REVIEW')
    `, [id]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'RFQ Closure', `Closed RFQ '${rfq.title}' (ID: ${id}). Rejected ${rejectedCount.changes} pending quotes.`, new Date().toISOString()]);

    res.redirect('/rfqs');
  } catch (error) {
    console.error('RFQ closure error:', error);
    res.status(500).render('error', { message: 'Failed to close RFQ.' });
  }
};
