const express = require('express');
const router = express.Router();

// Import Middleware guards
const { isAuthenticated, isGuest, hasRole } = require('../middleware/authMiddleware');

// Import Controllers
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const vendorController = require('../controllers/vendorController');
const rfqController = require('../controllers/rfqController');
const quoteController = require('../controllers/quoteController');
const approvalController = require('../controllers/approvalController');
const poController = require('../controllers/poController');
const emailController = require('../controllers/emailController');
const logController = require('../controllers/logController');
const reportController = require('../controllers/reportController');

// 1. Root redirection
router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  return res.redirect('/login');
});

// 2. Authentication Routes
router.get('/login', isGuest, authController.getLogin);
router.post('/login', isGuest, authController.postLogin);
router.get('/logout', isAuthenticated, authController.logout);

// 3. Dashboard Route
router.get('/dashboard', isAuthenticated, dashboardController.getDashboard);

// 4. Vendor Directory Routes
router.get('/vendors', isAuthenticated, hasRole(['ADMIN', 'PROCUREMENT_OFFICER']), vendorController.getVendors);
router.post('/vendors/register', isAuthenticated, hasRole(['ADMIN', 'PROCUREMENT_OFFICER']), vendorController.postRegisterVendor);
router.post('/vendors/:id/status', isAuthenticated, hasRole(['ADMIN', 'PROCUREMENT_OFFICER']), vendorController.postUpdateStatus);

// 5. RFQs Routes
router.get('/rfqs', isAuthenticated, rfqController.getRFQs);
router.get('/rfqs/create', isAuthenticated, hasRole(['PROCUREMENT_OFFICER']), rfqController.getCreateRFQ);
router.post('/rfqs/create', isAuthenticated, hasRole(['PROCUREMENT_OFFICER']), rfqController.postCreateRFQ);
router.post('/rfqs/:id/close', isAuthenticated, hasRole(['PROCUREMENT_OFFICER']), rfqController.postCloseRFQ);

// 6. Quotation Submission & Comparison Routes
router.get('/quotes/submit', isAuthenticated, hasRole(['VENDOR']), quoteController.getSubmitQuote);
router.post('/quotes/submit', isAuthenticated, hasRole(['VENDOR']), quoteController.postSubmitQuote);
router.get('/quotes/compare', isAuthenticated, hasRole(['PROCUREMENT_OFFICER', 'APPROVER']), quoteController.getCompareQuotes);

// 7. Approvals Workflow Routes
router.get('/approvals', isAuthenticated, hasRole(['PROCUREMENT_OFFICER', 'APPROVER']), approvalController.getApprovals);
router.post('/approvals/request', isAuthenticated, hasRole(['PROCUREMENT_OFFICER']), approvalController.postRequestApproval);
router.post('/approvals/action', isAuthenticated, hasRole(['APPROVER']), approvalController.postActionApproval);

// 8. Purchase Order & Invoice Routes
router.get('/pos', isAuthenticated, poController.getPOs);
router.post('/invoices/generate', isAuthenticated, hasRole(['VENDOR']), poController.postGenerateInvoice);
router.post('/invoices/pay', isAuthenticated, hasRole(['PROCUREMENT_OFFICER', 'APPROVER']), poController.postPayInvoice);
router.get('/pos/print', isAuthenticated, poController.getPrintDocument);

// 9. Mock Email Outbox
router.get('/emails', isAuthenticated, emailController.getEmails);

// 10. Audit Activity Logs Route
router.get('/logs', isAuthenticated, hasRole(['ADMIN', 'PROCUREMENT_OFFICER', 'APPROVER']), logController.getLogs);

// 11. Reports & Analytics Route
router.get('/reports', isAuthenticated, hasRole(['ADMIN', 'PROCUREMENT_OFFICER', 'APPROVER']), reportController.getReports);

module.exports = router;
