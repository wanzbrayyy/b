module.exports = function (req, res, next) {
    // Asumsi req.user sudah diisi oleh authMiddleware
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ msg: 'Access denied. Administrator privileges required.' });
    }
};