const { query } = require('../config/db');

/**
 * List all reports and analytics
 */
exports.getReports = async (req, res) => {
  try {
    // 1. Core Summary Metrics
    const totalSpendRow = await query.get("SELECT SUM(grand_total) as total FROM purchase_orders");
    const totalRfqRow = await query.get("SELECT COUNT(*) as count FROM rfqs");
    const activeVendorsRow = await query.get("SELECT COUNT(*) as count FROM vendors WHERE status = 'ACTIVE'");
    const totalInvoicesRow = await query.get("SELECT SUM(grand_total) as total FROM invoices i JOIN purchase_orders po ON i.po_id = po.id");

    const summary = {
      totalSpend: totalSpendRow.total || 0,
      totalRfqs: totalRfqRow.count || 0,
      activeVendors: activeVendorsRow.count || 0,
      totalInvoiced: totalInvoicesRow.total || 0
    };

    // 2. Tabular breakdown: Spend by Vendor
    const vendorSpends = await query.all(`
      SELECT 
        v.id, v.name, v.category, v.rating,
        COUNT(po.id) as po_count,
        COALESCE(SUM(po.grand_total), 0) as total_spend
      FROM vendors v
      LEFT JOIN purchase_orders po ON v.id = po.vendor_id
      GROUP BY v.id
      ORDER BY total_spend DESC
    `);

    // 3. Monthly spending trends (past 6 months)
    const monthlySpending = await query.all(`
      SELECT 
        strftime('%m', created_at) as month_num,
        SUM(grand_total) as total
      FROM purchase_orders 
      GROUP BY month_num
      ORDER BY month_num ASC
      LIMIT 6
    `);

    res.render('reports', {
      title: 'Reports & Analytics',
      activePage: 'reports',
      summary,
      vendorSpends,
      monthlySpendingData: JSON.stringify(monthlySpending)
    });
  } catch (error) {
    console.error('Reports fetch error:', error);
    res.status(500).render('error', { message: 'Failed to compile reports data.' });
  }
};
