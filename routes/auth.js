const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/user');
const auth = require('../middleware/authMiddleware');

// ==========================================
// 1. AUTHENTICATION (Login / Register)
// ==========================================

// @route   POST api/auth/register
// @desc    Register user
router.post('/register', async (req, res) => {
    const { _id, name, email, password, avatar } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User already exists' });

        user = new User({ _id, name, email, password, avatar, role: 'admin' });
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        // Payload harus berisi role dan _id
        const payload = { user: { id: user.id, _id: user._id, role: user.role } }; 
        
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            const userData = user.toObject();
            delete userData.password;
            delete userData.twoFactorSecret;
            res.json({ token, user: userData });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/auth/login
// @desc    Login NORMAL (Email/Username + Password)
router.post('/login', async (req, res) => {
    const { email, password } = req.body; 
    
    try {
        let user = await User.findOne({
            $or: [
                { email: email },      
                { name: email }        
            ]
        });

        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.push({ ip, device: req.headers['user-agent'] });
        await user.save();

        // 2FA Check
        if (user.isTwoFactorEnabled) {
            const tempToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
            return res.json({ require2FA: true, tempToken, msg: "2FA Required" });
        }

        // Login Normal
        // Payload harus berisi role dan _id
        const payload = { user: { id: user.id, _id: user._id, role: user.role } };
        
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            const userData = user.toObject();
            delete userData.password;
            delete userData.twoFactorSecret;
            res.json({ token, user: userData });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/auth/login-sdk
// @desc    Authenticate using API Key (User ID/UUID) - Bypasses bcrypt
router.post('/login-sdk', async (req, res) => {
    const { username, apiKey } = req.body;
    
    try {
        let user = await User.findOne({
            $or: [{ email: username }, { name: username }]
        });

        if (!user) return res.status(400).json({ msg: 'Invalid credentials (User not found)' });

        if (user._id !== apiKey) {
            return res.status(400).json({ msg: 'Invalid credentials (API Key mismatch)' });
        }
        
        // Sukses: Generate Normal Token
        const payload = { user: { id: user.id, _id: user._id, role: user.role } };
        
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            const userData = user.toObject();
            delete userData.password;
            delete userData.twoFactorSecret;
            res.json({ token, user: userData });
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. PROFILE & 2FA
// ==========================================

// @route   PUT api/auth/profile
// @desc    Update Profile (Nama, Avatar)
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, avatar } = req.body;
        let user = await User.findById(req.user.id);
        
        if (name) user.name = name;
        if (avatar) user.avatar = avatar; 
        
        await user.save();
        
        const userData = user.toObject();
        delete userData.password;
        res.json(userData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/auth/2fa/generate
// @desc    Generate Secret & QR Code
router.post('/2fa/generate', auth, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ name: `WanzDB (${req.user.id})` });
        const user = await User.findById(req.user.id);
        user.twoFactorSecret = secret.base32;
        await user.save();

        qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
            if (err) throw err;
            res.json({ secret: secret.base32, qrCode: data_url });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/auth/2fa/verify
// @desc    Verify OTP & Enable 2FA
router.post('/2fa/verify', auth, async (req, res) => {
    try {
        const { token } = req.body;
        const user = await User.findById(req.user.id);
        
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token
        });

        if (verified) {
            user.isTwoFactorEnabled = true;
            await user.save();
            res.json({ success: true, msg: "2FA Enabled" });
        } else {
            res.status(400).json({ success: false, msg: "Invalid Token" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route   POST api/auth/2fa/validate-login
// @desc    Final Step Login: Validate OTP dan berikan token asli
router.post('/2fa/validate-login', async (req, res) => {
    const { tempToken, otp } = req.body;
    
    try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(400).json({ msg: "User not found" });

        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: otp
        });

        if (verified) {
            // Berikan Token Akses Penuh
            const payload = { user: { id: user.id, _id: user._id, role: user.role } }; 
            
            jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
                if (err) throw err;
                const userData = user.toObject();
                delete userData.password;
                delete userData.twoFactorSecret;
                res.json({ token, user: userData });
            });
        } else {
            res.status(400).json({ msg: "Invalid 2FA Code" });
        }
    } catch (err) {
        res.status(401).json({ msg: "Session expired or invalid" });
    }
});

module.exports = router;