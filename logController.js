const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

/**
 * Render Login Page
 */
exports.getLogin = (req, res) => {
  res.render('login', { error: null });
};

/**
 * Handle Login Submission
 */
exports.postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.render('login', { error: 'Please enter both email and password.' });
    }

    // Retrieve user by email
    const user = await query.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);

    if (!user) {
      return res.render('login', { error: 'Invalid email or password.' });
    }

    // Compare Password
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.render('login', { error: 'Invalid email or password.' });
    }

    // Create session payload (omit password hash for safety)
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      vendorId: user.vendor_id
    };

    // Log this login event to activity_logs
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, user.id, user.name, 'User Login', `Successfully logged in with role ${user.role}`, new Date().toISOString()]);

    return res.redirect('/dashboard');
  } catch (error) {
    console.error('Login Error:', error);
    return res.render('login', { error: 'An unexpected database error occurred.' });
  }
};

/**
 * Handle Logout
 */
exports.logout = async (req, res) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    try {
      const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      await query.run(`
        INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [logId, user.id, user.name, 'User Logout', 'Successfully logged out', new Date().toISOString()]);
    } catch (err) {
      console.error('Logout logging error:', err);
    }
  }

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/login');
  });
};

/**
 * Render Signup Page
 */
exports.getSignup = async (req, res) => {
  try {
    const vendors = await query.all("SELECT id, name FROM vendors WHERE status = 'ACTIVE' ORDER BY name ASC");
    res.render('signup', { error: null, success: null, vendors });
  } catch (error) {
    console.error('Signup load error:', error);
    res.status(500).render('error', { message: 'Failed to load signup page.' });
  }
};

/**
 * Handle Signup Submission
 */
exports.postSignup = async (req, res) => {
  const { name, email, password, role, vendorId } = req.body;
  
  try {
    const vendors = await query.all("SELECT id, name FROM vendors WHERE status = 'ACTIVE' ORDER BY name ASC");
    
    if (!name || !email || !password || !role) {
      return res.render('signup', { error: 'Please fill in all required fields.', success: null, vendors });
    }

    // Check if user email already exists
    const existingUser = await query.get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
    if (existingUser) {
      return res.render('signup', { error: 'An account with this email address already exists.', success: null, vendors });
    }

    const userId = 'usr_' + Date.now().toString().slice(-6);
    const hash = bcrypt.hashSync(password, 10);
    const assignedVendor = role === 'VENDOR' ? vendorId : null;

    // Insert user
    await query.run(`
      INSERT INTO users (id, name, email, password_hash, role, vendor_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [userId, name.trim(), email.trim().toLowerCase(), hash, role, assignedVendor]);

    // Log action
    const logId = 'log_' + Date.now();
    await query.run(`
      INSERT INTO activity_logs (id, user_id, user_name, action, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [logId, userId, name.trim(), 'User Signup', `Registered a new account with role ${role}`, new Date().toISOString()]);

    return res.render('signup', { 
      error: null, 
      success: 'Account created successfully! You can now log in.', 
      vendors 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).render('error', { message: 'Failed to create user account.' });
  }
};

/**
 * Render Forgot Password Page
 */
exports.getForgotPassword = (req, res) => {
  res.render('forgot-password', { error: null, success: null });
};

/**
 * Handle Forgot Password Form Submission
 */
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.render('forgot-password', { error: 'Please enter your email address.', success: null });
    }

    const user = await query.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);

    // Professional security practice: even if user is not found, return a success message
    // to prevent user enumeration attacks.
    if (user) {
      const resetToken = 'tok_' + Math.random().toString(36).substr(2, 9);
      const resetLink = `http://localhost:3000/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

      // Send simulated email
      const emailId = 'eml_' + Date.now();
      const emailSubject = 'Password Reset Request - VendorBridge';
      const emailBody = `Dear ${user.name},\n\nWe received a request to reset the password for your VendorBridge ERP account.\n\nYou can reset your password by clicking the link below:\n${resetLink}\n\nIf you did not make this request, please ignore this email.\n\nRegards,\nVendorBridge Security`;

      await query.run(`
        INSERT INTO mock_emails (id, recipient_email, subject, body, sent_at)
        VALUES (?, ?, ?, ?, ?)
      `, [emailId, user.email, emailSubject, emailBody, new Date().toISOString()]);
    }

    return res.render('forgot-password', {
      error: null,
      success: 'If that email address exists in our system, we have sent a password reset link to it. Check the Simulated Email Outbox to view it!'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).render('error', { message: 'An error occurred during password reset processing.' });
  }
};

