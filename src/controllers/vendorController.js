const { query } = require('../config/db');

/**
 * List all vendors with optional search and filters
 */
exports.getVendors = async (req, res) => {
  const { search, category, status } = req.query;

  try {
    let sql = 'SELECT * FROM vendors WHERE 1=1';
    const params = [];

    if (search && search.trim() !== '') {
      sql += ' AND (name LIKE ? OR gst_number LIKE ? OR email LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    if (category && category.trim() !== '') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (status && status.trim() !== '') {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY name ASC';

    const vendors = await query.all(sql, params);
    
    // Get unique categories for filter dropdown
    const categoriesRows = await query.all('SELECT DISTINCT category FROM vendors');
    const categories = categoriesRows.map(r => r.category);

    res.render('vendors', {
      title: 'Vendor Directory',
      activePage: 'vendors',
      vendors,
      categories,
      filters: { search: search || '', category: category || '', status: status || '' }
    });
  } catch (error) {
    console.error('Vendor retrieval error:', error);
    res.status(500).render('error', { message: 'Failed to fetch vendor directory.' });
  }
};

/**
 * Register a new vendor profile
 */
exports.postRegisterVendor = async (req, res) => {
  const { name, category, gstNumber, email, phone, address } = req.body;
  const user = req.session.user;

  try {
    if (!name || !category || !gstNumber || !email || !phone || !address) {
      return res.status(400).render('error', { message: 'All registration fields are required.' });
    }

    const vendorId = 'ven_' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);

    // Insert vendor
    await query.run(`
      INSERT INTO vendors (id, name, category, gst_number, email, phone, address, rating, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0.0, 'ACTIVE')
    `, [vendorId, name.trim(), category.trim(), gstNumber.trim().toUpperCase(), email.trim().toLowerCase(), phone.trim(), address.trim()]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'Vendor Registered', `Successfully registered vendor: ${name} (ID: ${vendorId})`, new Date().toISOString()]);

    res.redirect('/vendors');
  } catch (error) {
    console.error('Vendor registration error:', error);
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).render('error', { message: 'A vendor with this email already exists.' });
    }
    res.status(500).render('error', { message: 'Failed to register new vendor.' });
  }
};

/**
 * Update vendor status (e.g. Activate, Blacklist)
 */
exports.postUpdateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = req.session.user;

  try {
    if (!['ACTIVE', 'PENDING_APPROVAL', 'BLACKLISTED'].includes(status)) {
      return res.status(400).render('error', { message: 'Invalid vendor status specified.' });
    }

    // Get vendor details for logging
    const vendor = await query.get('SELECT name FROM vendors WHERE id = ?', [id]);
    if (!vendor) {
      return res.status(404).render('error', { message: 'Vendor not found.' });
    }

    // Update status
    await query.run('UPDATE vendors SET status = ? WHERE id = ?', [status, id]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'Vendor Status Update', `Updated vendor status of '${vendor.name}' to ${status}`, new Date().toISOString()]);

    res.redirect('/vendors');
  } catch (error) {
    console.error('Vendor status update error:', error);
    res.status(500).render('error', { message: 'Failed to update vendor status.' });
  }
};
