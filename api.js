'use strict';

module.exports = {
  async getStatus({ homey }) {
    return homey.app.getStatus();
  }
};
