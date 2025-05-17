import express from "express"
import {
    userSignup,
    userLogin
} from "../controllers/auth.controller.js"

const router = express.Router()

router.post('/google-signup',userSignup)
router.post('/google-login',userLogin)

export default router