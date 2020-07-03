'use strict';
const Homey = require('homey')

module.exports = [
    {
        method: 'GET',
        path: '/status',
        fn: async (args, callback) => {
            try {
                return callback(null, await Homey.app.getStatus());
            } catch (err) {
                return callback(err);
            }
        }
    },
];
