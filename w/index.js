const WanzClient = require('./src/WanzClient');

module.exports = {
    Client: WanzClient,
    ObjectId: require('uuid').v4
};