const { query } = require('../config/db');

/**
 * Render Quotation Submission Form (for Vendors)
 */
exports.getSubmitQuote = async (req, res) => {
  const { rfqId, quoteId } = req.query;
  const user = req.session.user;

  try {
    // 1. Fetch RFQ
    const rfq = await query.get('SELECT * FROM rfqs WHERE id = ?', [rfqId]);
    if (!rfq) {
      return res.status(404).render('error', { message: 'RFQ not found.' });
    }

    // 2. Security Check: Verify if this RFQ is assigned to the current vendor
    const assignment = await query.get('SELECT * FROM rfq_assignments WHERE rfq_id = ? AND vendor_id = ?', [rfqId, user.vendorId]);
    if (!assignment) {
      return res.status(403).render('error', { message: 'Access denied: You are not invited to quote for this RFQ.' });
    }

    if (rfq.status !== 'ACTIVE') {
      return res.status(400).render('error', { message: 'This RFQ is no longer open for bidding.' });
    }

    // Parse items
    rfq.items = JSON.parse(rfq.items_json);

    // 3. Fetch Existing Quote if editing
    let quote = null;
    if (quoteId) {
      quote = await query.get('SELECT * FROM quotes WHERE id = ? AND vendor_id = ?', [quoteId, user.vendorId]);
      if (quote) {
        quote.items = JSON.parse(quote.items_json);
      }
    } else {
      // Auto-fallback check if they already submitted but forgot the ID parameter
      quote = await query.get('SELECT * FROM quotes WHERE rfq_id = ? AND vendor_id = ?', [rfqId, user.vendorId]);
      if (quote) {
        quote.items = JSON.parse(quote.items_json);
      }
    }

    res.render('quote-submit', {
      title: quote ? 'Edit Quotation' : 'Submit Quotation',
      activePage: 'rfqs',
      rfq,
      quote
    });
  } catch (error) {
    console.error('Submit quote prep error:', error);
    res.status(500).render('error', { message: 'Failed to prepare quotation form.' });
  }
};

/**
 * Handle POST Quotation Submission
 */
exports.postSubmitQuote = async (req, res) => {
  const { rfqId, quoteId, deliveryTimeline, notes, item_id, price_per_unit } = req.body;
  const user = req.session.user;

  try {
    // 1. Validate RFQ and deadline
    const rfq = await query.get('SELECT * FROM rfqs WHERE id = ?', [rfqId]);
    if (!rfq) {
      return res.status(404).render('error', { message: 'RFQ not found.' });
    }

    if (rfq.status !== 'ACTIVE') {
      return res.status(400).render('error', { message: 'This RFQ is no longer active.' });
    }

    if (new Date() > new Date(rfq.deadline)) {
      return res.status(400).render('error', { message: 'The submission deadline for this RFQ has passed.' });
    }

    const assignment = await query.get('SELECT * FROM rfq_assignments WHERE rfq_id = ? AND vendor_id = ?', [rfqId, user.vendorId]);
    if (!assignment) {
      return res.status(403).render('error', { message: 'Access denied: You are not assigned to this RFQ.' });
    }

    // Parse RFQ items to map quantities
    const rfqItems = JSON.parse(rfq.items_json);
    const quoteItems = [];

    if (Array.isArray(item_id)) {
      for (let i = 0; i < item_id.length; i++) {
        const rfqItem = rfqItems.find(item => item.id === item_id[i]);
        const price = parseFloat(price_per_unit[i]) || 0;
        if (price <= 0) {
          return res.status(400).render('error', { message: 'All items must have a valid price greater than zero.' });
        }
        quoteItems.push({
          itemId: item_id[i],
          pricePerUnit: price,
          totalPrice: price * (rfqItem ? rfqItem.quantity : 1)
        });
      }
    } else {
      const rfqItem = rfqItems.find(item => item.id === item_id);
      const price = parseFloat(price_per_unit) || 0;
      if (price <= 0) {
        return res.status(400).render('error', { message: 'All items must have a valid price greater than zero.' });
      }
      quoteItems.push({
        itemId: item_id,
        pricePerUnit: price,
        totalPrice: price * (rfqItem ? rfqItem.quantity : 1)
      });
    }

    const timelineDays = parseInt(deliveryTimeline) || 1;

    if (quoteId && quoteId.trim() !== '') {
      // Update existing
      await query.run(`
        UPDATE quotes
        SET items_json = ?, delivery_timeline_days = ?, notes = ?, submitted_at = ?, status = 'SUBMITTED'
        WHERE id = ? AND vendor_id = ?
      `, [JSON.stringify(quoteItems), timelineDays, notes ? notes.trim() : '', new Date().toISOString(), quoteId, user.vendorId]);

      // Log action
      const logId = 'log_' + Date.now();
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [logId, user.id, user.name, 'Quotation Updated', `Updated quotation ID: ${quoteId} for RFQ ID: ${rfqId}`, new Date().toISOString()]);
    } else {
      // Insert new
      const newQuoteId = 'qte_' + Date.now().toString().slice(-6);
      await query.run(`
        INSERT INTO quotes (id, rfq_id, vendor_id, items_json, delivery_timeline_days, notes, status, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', ?)
      `, [newQuoteId, rfqId, user.vendorId, JSON.stringify(quoteItems), timelineDays, notes ? notes.trim() : '', new Date().toISOString()]);

      // Log action
      const logId = 'log_' + Date.now();
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [logId, user.id, user.name, 'Quotation Submitted', `Submitted quotation ID: ${newQuoteId} for RFQ ID: ${rfqId}`, new Date().toISOString()]);
    }

    res.redirect('/rfqs');
  } catch (error) {
    console.error('Quote submit error:', error);
    res.status(500).render('error', { message: 'Failed to process quotation submission.' });
  }
};

/**
 * Compare Quotations Side-by-Side (for Officers, Approvers)
 */
exports.getCompareQuotes = async (req, res) => {
  const { rfqId } = req.query;

  try {
    const rfq = await query.get('SELECT * FROM rfqs WHERE id = ?', [rfqId]);
    if (!rfq) {
      return res.status(404).render('error', { message: 'RFQ not found.' });
    }

    rfq.items = JSON.parse(rfq.items_json);

    // Fetch all quotes submitted for this RFQ
    const quotes = await query.all(`
      SELECT q.*, v.name as vendor_name, v.rating as vendor_rating, v.gst_number as vendor_gst
      FROM quotes q
      JOIN vendors v ON q.vendor_id = v.id
      WHERE q.rfq_id = ?
      ORDER BY q.submitted_at ASC
    `, [rfqId]);

    // Parse quotes items and calculate quote total values
    let lowestQuoteId = null;
    let lowestPrice = Infinity;
    
    let fastestQuoteId = null;
    let shortestTimeline = Infinity;

    quotes.forEach(quote => {
      quote.items = JSON.parse(quote.items_json);
      quote.totalValue = quote.items.reduce((sum, item) => sum + item.totalPrice, 0);

      // Find lowest price
      if (quote.totalValue < lowestPrice) {
        lowestPrice = quote.totalValue;
        lowestQuoteId = quote.id;
      }

      // Find fastest delivery timeline
      if (quote.delivery_timeline_days < shortestTimeline) {
        shortestTimeline = quote.delivery_timeline_days;
        fastestQuoteId = quote.id;
      }
    });

    res.render('quote-compare', {
      title: 'Compare Quotations',
      activePage: 'rfqs',
      rfq,
      quotes,
      lowestQuoteId,
      fastestQuoteId
    });
  } catch (error) {
    console.error('Quotation comparison error:', error);
    res.status(500).render('error', { message: 'Failed to load quotation comparison.' });
  }
};
