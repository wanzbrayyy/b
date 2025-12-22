const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/user');
const auth = require('../middleware/authMiddleware');

// --- REGISTER ---
router.post('/register', async (req, res) => {
    const { _id, name, email, password, avatar } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: 'User exists' });

        user = new User({ _id, name, email, password, avatar, role: 'admin' });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- LOGIN (UPDATED FOR 2FA FLOW) ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        // Record Login History
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const device = req.headers['user-agent'];
        // Pastikan array ada
        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.push({ ip, device });
        await user.save();

        // 🔥 CEK 2FA STATUS 🔥
        if (user.isTwoFactorEnabled) {
            // Jangan kirim token utama dulu!
            // Kirim token sementara (temp_token) yang hanya valid untuk endpoint verifikasi 2FA
            const tempToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '5m' });
            
            return res.json({ 
                require2FA: true, 
                tempToken: tempToken,
                msg: "2FA Verification Required"
            });
        }

        // Login Normal (Jika 2FA mati)
        const payload = { user: { id: user.id } };
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

// --- 2FA FEATURES ---

// 1. Generate QR Code (Setup)
router.post('/2fa/generate', auth, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ name: `WanzDB (${req.user.id})` });
        const user = await User.findById(req.user.id);
        user.twoFactorSecret = secret.base32;
        await user.save();

        qrcode.toDataURL(secret.otpauth_url, (err, data_url) => {
            res.json({ secret: secret.base32, qrCode: data_url });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Verify & Enable (Setup)
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

// 3. VALIDATE LOGIN (Endpoint Baru untuk Login Step 2)
router.post('/2fa/validate-login', async (req, res) => {
    const { tempToken, otp } = req.body;
    
    try {
        // Decode tempToken untuk dapat User ID
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) return res.status(400).json({ msg: "User not found" });

        // Verifikasi Kode OTP
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: otp
        });

        if (verified) {
            // OTP Benar -> Berikan Token Asli
            const payload = { user: { id: user.id } };
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

// Update Profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, avatar } = req.body;
        let user = await User.findById(req.user.id);
        if (name) user.name = name;
        if (avatar) user.avatar = avatar; 
        await user.save();
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;