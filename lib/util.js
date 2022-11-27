'use strict';

const delay = (homey, ms) => new Promise(resolve => homey.setTimeout(resolve, ms));

module.exports = {
    delay: delay,
};
