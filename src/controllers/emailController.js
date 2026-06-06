const { query } = require('../config/db');

/**
 * List simulated email logs
 */
exports.getEmails = async (req, res) => {
  const user = req.session.user;

  try {
    let emails = [];

    if (user.role === 'VENDOR') {
      // Vendor sees emails sent to their corporate address
      // Fetch vendor email first
      const vendor = await query.get('SELECT email FROM vendors WHERE id = ?', [user.vendorId]);
      if (vendor) {
        emails = await query.all('SELECT * FROM mock_emails WHERE recipient_email = ? ORDER BY sent_at DESC', [vendor.email]);
      }
    } else {
      // Officers see all outgoing communications
      emails = await query.all('SELECT * FROM mock_emails ORDER BY sent_at DESC');
    }

    res.render('emails', {
      title: 'Email Outbox',
      activePage: 'emails',
      emails
    });
  } catch (error) {
    console.error('Email log fetch error:', error);
    res.status(500).render('error', { message: 'Failed to fetch email logs.' });
  }
};
