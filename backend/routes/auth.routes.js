import express from 'express'
import passport from '../config/passport.js'
import {
  handleGoogleCallback,
  getMe,
  refreshAccessToken,
  logout,
  userSignup,
  userLogin,
} from '../controllers/auth.controller.js'
import { isAuthenticated } from '../middlewares/auth.middlewares.js';

const router = express.Router()

// @route   GET /auth/google
// @desc    Redirect to Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'],
  prompt: 'select_account'
 }))

// @route   GET /auth/google/callback
// @desc    Google OAuth callback — issues JWT tokens
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=auth_failed` }),
  handleGoogleCallback
)

// @route   POST /auth/google-signup
// @desc    Sign up or sign in with Google UID
router.post('/google-signup', userSignup)

// @route   POST /auth/google-login
// @desc    Login with email and Google UID
router.post('/google-login', userLogin)

// @route   GET /auth/me
// @desc    Get current logged-in user
router.get('/me', isAuthenticated, getMe)

// @route   POST /auth/refresh
// @desc    Issue new access token using refresh token cookie
router.post('/refresh', refreshAccessToken)

// @route   POST /auth/logout
// @desc    Logout user
router.post('/logout', logout)

export default router