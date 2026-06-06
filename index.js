/**
 * Middleware to ensure the user is logged in.
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  // If request is an AJAX API request, send 401 JSON. Otherwise, redirect to login page.
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return res.redirect('/login');
}

/**
 * Middleware to redirect already authenticated users away from guest pages (e.g. login).
 */
function isGuest(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return next();
}

/**
 * Middleware to restrict access to specific roles.
 * @param {string[]} allowedRoles 
 */
function hasRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return res.redirect('/login');
    }

    if (allowedRoles.includes(req.session.user.role)) {
      return next();
    }

    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }
    return res.status(403).render('error', { 
      message: 'Access denied: You do not have permission to view this page.' 
    });
  };
}

module.exports = {
  isAuthenticated,
  isGuest,
  hasRole
};
