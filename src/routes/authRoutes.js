const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated, isGuest } = require('../middleware/authMiddleware');

// Guest-only routes
router.get('/login', isGuest, authController.getLogin);
router.post('/login', isGuest, authController.postLogin);
router.get('/signup', isGuest, authController.getSignup);
router.post('/signup', isGuest, authController.postSignup);
router.get('/forgot-password', isGuest, authController.getForgotPassword);
router.post('/forgot-password', isGuest, authController.postForgotPassword);

// Authenticated-only routes
router.get('/logout', isAuthenticated, authController.logout);

module.exports = router;
