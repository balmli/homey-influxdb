'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('athom-api');
const DeviceHandler = require('./lib/DeviceHandler');
const InfluxDb = require('./lib/InfluxDb');

module.exports = class InfluxDbApp extends Homey.App {

    async onInit() {
        try {
            Homey.on('unload', () => this._onUninstall());
            await this.getApi();
            this._api.devices.setMaxListeners(9999);
            if (await this.shallWaitForHomey()) {
                await this.waitForHomey();
            }
            this._influxDb = new InfluxDb({ log: this.log });
            await this.initSettings();
            this._devices = new DeviceHandler({ api: this._api, log: this.log });
            this._devices.on('capability', this._onCapability.bind(this));
            await this._devices.registerDevices();
            this._influxDb.scheduleWriteToInfluxDb();
            this.log('InfluxDbApp is running...');
        } catch (err) {
            this.log('onInit error', err);
        }
    }

    async initSettings() {
        const host = Homey.ManagerSettings.get('host');
        if (!host || host.length === 0) {
            Homey.ManagerSettings.set('host', '');
        }
        const port = Homey.ManagerSettings.get('port');
        if (!port || port.length === 0) {
            Homey.ManagerSettings.set('port', '8086');
        }
        const database = Homey.ManagerSettings.get('database');
        if (!database || database.length === 0) {
            Homey.ManagerSettings.set('database', 'homey');
        }
        Homey.ManagerSettings.on('set', this._onSettingsChanged.bind(this));
        await this._influxDb.updateSettings({
            host: Homey.ManagerSettings.get('host'),
            port: Homey.ManagerSettings.get('port'),
            database: Homey.ManagerSettings.get('database')
        });
    }

    async _onSettingsChanged(key) {
        this.log('Settings changed', key);
        if (key === 'settings') {
            const settings = Homey.ManagerSettings.get('settings');
            Homey.ManagerSettings.set('host', settings.host);
            Homey.ManagerSettings.set('port', settings.port);
            Homey.ManagerSettings.set('database', settings.database);
            await this._influxDb.updateSettings(settings);
        }
    }

    async shallWaitForHomey() {
        const uptime = (await this._api.system.getInfo()).uptime;
        return uptime < 600;
    }

    async waitForHomey() {
        let numDevices = 0;
        while (true) {
            let newRunningDevices = Object.keys(await this._api.devices.getDevices()).length;
            if (newRunningDevices && newRunningDevices === numDevices) {
                break;
            }
            numDevices = newRunningDevices;
            await this._delay(120 * 1000);
        }
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getApi() {
        if (!this._api) {
            this._api = await HomeyAPI.forCurrentHomey();
        }
        return this._api;
    };

    _onUninstall() {
        try {
            this._devices.unregisterDevices();
            delete this._devices;
            delete this._influxDb;
        } catch (err) {
            this.log('_onUninstall error', err);
        }
    }

    isNumber(num) {
        return (typeof num == 'string' || typeof num == 'number') && !isNaN(num - 0) && num !== '';
    }

    isSupported(value) {
        return typeof value === 'boolean' || this.isNumber(value);
    }

    _onCapability(event) {
        if (!this._influxDb) {
            return;
        }

        const valueFormatted = this._formatValue(event.value, event.capability);
        if (valueFormatted === undefined || valueFormatted === null || !this.isSupported(event.value)) {
            return;
        }

        const measurement = {
            measurement: event.name.replace(/ /g, '_'),
            tags: [event.id, event.name],
            fields: {
                [event.capId]: valueFormatted
            },
            timestamp: new Date()
        };

        this._influxDb.write(measurement);
    }

    _formatValue(value, capability) {
        if (value === undefined || value === null) {
            return value;
        }
        if (typeof value === 'boolean') {
            return value;
        }

        if (capability.units === '%') {
            switch (this.percentageScale) {
                case 'int':
                    if (capability.min === 0 && capability.max === 1)
                        return value * 100;
                    break;
                case 'float':
                    if (capability.min === 0 && capability.max === 100)
                        return value / 100;
                    break;
                case 'default':
                default:
                    // nothing
                    break;
            }
        }

        return value;
    }

};
