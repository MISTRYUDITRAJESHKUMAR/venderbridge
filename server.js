const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDb } = require('./src/config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database & Run schemas/seeds
initDb();

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure static assets (CSS, JS, images)
app.use(express.static(path.join(__dirname, 'src/public')));

// Configure Express Session Management
app.use(session({
  name: 'vendorbridge.sid',
  secret: 'vendorbridge_hackathon_elite_19_years_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if running on HTTPS
    httpOnly: true, // Prevents client-side JS from accessing the cookie
    maxAge: 24 * 60 * 60 * 1000 // 1 day session validity
  }
}));

// Set View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Context Injection Middleware: injects session user into EJS view locals automatically
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Import and mount routers
const routes = require('./src/routes');
app.use('/', routes);

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(500).render('error', { 
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` VendorBridge ERP running on http://localhost:${PORT}`);
  console.log(`==================================================`);
});
