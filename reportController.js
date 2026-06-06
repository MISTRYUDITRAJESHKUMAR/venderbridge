const { query } = require('../config/db');

/**
 * List all activity logs
 */
exports.getLogs = async (req, res) => {
  try {
    const logs = await query.all('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 100');
    res.render('logs', {
      title: 'Activity Trail',
      activePage: 'logs',
      logs
    });
  } catch (error) {
    console.error('Logs fetch error:', error);
    res.status(500).render('error', { message: 'Failed to fetch activity logs.' });
  }
};
