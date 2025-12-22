const ActivityLog = require('../models/ActivityLog');

const logger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', async () => {
    try {
      const duration = Date.now() - start;
      if (req.originalUrl.startsWith('/api/data')) {
        const parts = req.originalUrl.split('/');
        const colName = parts[3] || 'unknown'; 

        await ActivityLog.create({
          userId: req.user ? req.user.id : 'anonymous', 
          method: req.method,
          path: req.originalUrl,
          collectionName: colName.split('?')[0], 
          statusCode: res.statusCode,
          ip: req.ip,
          duration
        });
      }
    } catch (err) {
      console.error("Logging Error:", err);
    }
  });

  next();
};

module.exports = logger;