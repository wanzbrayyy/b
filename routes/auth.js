const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const User = require('../models/user');
const auth = require('../middleware/authMiddleware');
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

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const device = req.headers['user-agent'];
        user.loginHistory.push({ ip, device });
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            const userData = user.toObject();
            delete userData.password;
            delete userData.twoFactorSecret; // Jangan kirim secret
            res.json({ token, user: userData });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, avatar } = req.body;
        let user = await User.findById(req.user.id);
        
        if (name) user.name = name;
        if (avatar) user.avatar = avatar; // Simpan Base64 string
        
        await user.save();
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
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

module.exports = router;