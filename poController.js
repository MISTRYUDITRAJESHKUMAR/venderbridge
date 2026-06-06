const { query } = require('../config/db');

exports.getDashboard = async (req, res) => {
  const user = req.session.user;

  try {
    let stats = {};
    let recentPOs = [];
    let recentInvoices = [];
    let logs = [];

    if (user.role === 'VENDOR') {
      // Vendor metrics
      const vendorId = user.vendorId;

      const activeRfqsCount = await query.get(`
        SELECT COUNT(DISTINCT r.id) as count 
        FROM rfqs r 
        JOIN rfq_assignments ra ON r.id = ra.rfq_id 
        WHERE r.status = 'ACTIVE' AND ra.vendor_id = ?
      `, [vendorId]);

      const quotesCount = await query.get(`
        SELECT COUNT(*) as count FROM quotes WHERE vendor_id = ?
      `, [vendorId]);

      const posCount = await query.get(`
        SELECT COUNT(*) as count FROM purchase_orders WHERE vendor_id = ?
      `, [vendorId]);

      const invoicesCount = await query.get(`
        SELECT COUNT(*) as count FROM invoices i 
        JOIN purchase_orders po ON i.po_id = po.id 
        WHERE po.vendor_id = ?
      `, [vendorId]);

      stats = {
        activeRfqs: activeRfqsCount.count,
        submittedQuotes: quotesCount.count,
        totalPOs: posCount.count,
        totalInvoices: invoicesCount.count
      };

      recentPOs = await query.all(`
        SELECT po.*, v.name as vendor_name 
        FROM purchase_orders po 
        JOIN vendors v ON po.vendor_id = v.id 
        WHERE po.vendor_id = ? 
        ORDER BY po.created_at DESC LIMIT 5
      `, [vendorId]);

      recentInvoices = await query.all(`
        SELECT i.*, po.po_number, v.name as vendor_name 
        FROM invoices i 
        JOIN purchase_orders po ON i.po_id = po.id 
        JOIN vendors v ON po.vendor_id = v.id 
        WHERE po.vendor_id = ? 
        ORDER BY i.created_at DESC LIMIT 5
      `, [vendorId]);

      logs = await query.all(`
        SELECT * FROM activity_logs 
        WHERE user_id = ? 
        ORDER BY timestamp DESC LIMIT 5
      `, [user.id]);

    } else {
      // Procurement Officer, Approver, and Admin metrics
      const activeRfqsCount = await query.get("SELECT COUNT(*) as count FROM rfqs WHERE status = 'ACTIVE'");
      const pendingApprovalsCount = await query.get("SELECT COUNT(*) as count FROM quotes WHERE status = 'UNDER_REVIEW'");
      const posCount = await query.get("SELECT COUNT(*) as count FROM purchase_orders");
      const invoicesCount = await query.get("SELECT COUNT(*) as count FROM invoices");

      stats = {
        activeRfqs: activeRfqsCount.count,
        pendingApprovals: pendingApprovalsCount.count,
        totalPOs: posCount.count,
        totalInvoices: invoicesCount.count
      };

      recentPOs = await query.all(`
        SELECT po.*, v.name as vendor_name 
        FROM purchase_orders po 
        JOIN vendors v ON po.vendor_id = v.id 
        ORDER BY po.created_at DESC LIMIT 5
      `);

      recentInvoices = await query.all(`
        SELECT i.*, po.po_number, v.name as vendor_name 
        FROM invoices i 
        JOIN purchase_orders po ON i.po_id = po.id 
        JOIN vendors v ON po.vendor_id = v.id 
        ORDER BY i.created_at DESC LIMIT 5
      `);

      logs = await query.all("SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 5");
    }

    // Chart.js data gathering: Monthly spending totals for the past 6 months
    const monthlySpending = await query.all(`
      SELECT 
        strftime('%m', created_at) as month_num,
        SUM(grand_total) as total
      FROM purchase_orders 
      GROUP BY month_num
      ORDER BY month_num ASC
      LIMIT 6
    `);

    // Chart.js data gathering: Top 5 Vendors by Average Rating
    const topVendors = await query.all(`
      SELECT name, rating FROM vendors 
      WHERE status = 'ACTIVE'
      ORDER BY rating DESC 
      LIMIT 5
    `);

    res.render('dashboard', {
      title: 'Dashboard',
      activePage: 'dashboard',
      stats,
      recentPOs,
      recentInvoices,
      logs,
      monthlySpendingData: JSON.stringify(monthlySpending),
      topVendorsData: JSON.stringify(topVendors)
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).render('error', { message: 'Failed to load dashboard metrics.' });
  }
};
