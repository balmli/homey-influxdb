'use strict';

const Homey = require('homey');
const { HomeyAPIApp } = require('homey-api');
const { delay } = require('./lib/util');
const measurementsUtil = require('./lib/measurementsUtil');
const HomeyStateHandler = require('./lib/HomeyStateHandler');
const DeviceHandler = require('./lib/DeviceHandler');
const InsightsHandler = require('./lib/InsightsHandler');
const InfluxDb = require('./lib/InfluxDb');

module.exports = class InfluxDbApp extends Homey.App {

    async onInit() {
        try {
            this._running = false;
            this.homey.on('unload', () => this._onUninstall());
            await this.getApi();
            if (await this.shallWaitForHomey()) {
                await this.waitForHomey();
            }
            this._influxDb = new InfluxDb({ homey: this.homey, log: this.log });
            this._influxDb.on('offline', this._onOffline.bind(this));
            this._influxDb.on('online', this._onOnline.bind(this));
            await this.initSettings();
            await this.initFlows();
            this._devices = new DeviceHandler({ homey: this.homey, api: this._api, log: this.log });
            this._devices.on('capability', this._onCapability.bind(this));
            await this._devices.registerDevices();
            await this.enableDisableMetrics();
            this._influxDb.scheduleWriteToInfluxDb();
            this._running = true;
            this.log('InfluxDbApp is running...');
        } catch (err) {
            this.log('onInit error', err);
        }
    }

    async initSettings() {
        const host = this.homey.settings.get('host');
        if (!host || host.length === 0) {
            this.homey.settings.set('host', '');
        }
        const protocol = this.homey.settings.get('protocol');
        if (!protocol || protocol.length === 0) {
            this.homey.settings.set('protocol', 'http');
        }
        const port = this.homey.settings.get('port');
        if (!port || port.length === 0) {
            this.homey.settings.set('port', '8086');
        }
        const organization = this.homey.settings.get('organization');
        if (!organization || organization.length === 0) {
            this.homey.settings.set('organization', '');
        }
        const token = this.homey.settings.get('token');
        if (!token || token.length === 0) {
            this.homey.settings.set('token', '');
        }
        const username = this.homey.settings.get('username');
        if (!username || username.length === 0) {
            this.homey.settings.set('username', 'root');
        }
        const password = this.homey.settings.get('password');
        if (!password || password.length === 0) {
            this.homey.settings.set('password', 'root');
        }
        const database = this.homey.settings.get('database');
        if (!database || database.length === 0) {
            this.homey.settings.set('database', 'homey');
        }
        let measurementMode = this.homey.settings.get('measurement_mode');
        if (measurementMode === undefined || measurementMode === null) {
            measurementMode = 'by_name';
            this.homey.settings.set('measurement_mode', measurementMode);
        }
        let measurementPrefix = this.homey.settings.get('measurement_prefix');
        if (measurementPrefix === undefined || measurementPrefix === null) {
            measurementPrefix = '';
            this.homey.settings.set('measurement_prefix', measurementPrefix);
        }
        const homey_metrics = this.homey.settings.get('homey_metrics');
        if (homey_metrics === null || homey_metrics === true) {
            this.homey.settings.set('homey_metrics', 'true');
        } else if (homey_metrics === false) {
            this.homey.settings.set('homey_metrics', 'false');
        }
        let write_interval = this.homey.settings.get('write_interval');
        if (!write_interval) {
            write_interval = 10;
            this.homey.settings.set('write_interval', write_interval);
        }
        this._measurementOptions = {
            measurementMode: measurementMode,
            measurementPrefix: measurementPrefix
        };
        this.homey.settings.on('set', this._onSettingsChanged.bind(this));
        await this._influxDb.updateSettings({
            host: this.homey.settings.get('host'),
            protocol: this.homey.settings.get('protocol'),
            port: this.homey.settings.get('port'),
            organization: this.homey.settings.get('organization'),
            token: this.homey.settings.get('token'),
            username: this.homey.settings.get('username'),
            password: this.homey.settings.get('password'),
            database: this.homey.settings.get('database')
        });
        this._influxDb.updateWriteInterval(write_interval);
    }

    async _onSettingsChanged(key) {
        this.log('Settings changed', key);
        if (key === 'settings') {
            const settings = this.homey.settings.get('settings');
            this.homey.settings.set('host', settings.host);
            this.homey.settings.set('protocol', settings.protocol);
            this.homey.settings.set('port', settings.port);
            this.homey.settings.set('organization', settings.organization);
            this.homey.settings.set('token', settings.token);
            this.homey.settings.set('username', settings.username);
            this.homey.settings.set('password', settings.password);
            this.homey.settings.set('database', settings.database);
            this.homey.settings.set('measurement_mode', settings.measurement_mode);
            this.homey.settings.set('measurement_prefix', settings.measurement_prefix);
            await this._influxDb.updateSettings(settings);
            this._measurementOptions = {
                measurementMode: settings.measurement_mode,
                measurementPrefix: settings.measurement_prefix
            };
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
            await delay(this.homey, 120 * 1000);
        }
    }

    async initFlows() {
        this.homey.flow.getConditionCard('is_online')
            .registerRunListener((args, state) => this._influxDb ? this._influxDb.getStatus().connected : false);

        this.homey.flow.getConditionCard('is_metrics_enabled')
            .registerRunListener((args, state) => this.homey.settings.get('homey_metrics') !== 'false');

        this.homey.flow.getConditionCard('is_app_metrics_enabled')
            .registerRunListener((args, state) => this.homey.settings.get('homey_metrics') === 'true');

        this.homey.flow.getActionCard('enable_metrics')
            .registerRunListener(async (args, state) => {
                this.homey.settings.set('homey_metrics', args.enabled);
                await this.enableDisableMetrics();
            });

        this.homey.flow.getActionCard('influxdb_write_interval')
            .registerRunListener(async (args, state) => {
                this.homey.settings.set('write_interval', args.write_interval);
                this._influxDb.updateWriteInterval(args.write_interval);
            });

        this.homey.flow.getActionCard('write_boolean')
          .registerRunListener(async (args, state) => this.writeFromValue(args.measurement, args.value));

        this.homey.flow.getActionCard('write_number')
          .registerRunListener(async (args, state) => this.writeFromValue(args.measurement, args.value));

        this.homey.flow.getActionCard('write_text')
          .registerRunListener(async (args, state) => this.writeFromValue(args.measurement, args.value));
    }

    async getApi() {
        if (!this._api) {
            this._api = new HomeyAPIApp({ homey: this.homey, debug: false });
        }
        return this._api;
    }

    async getStatus() {
        return {
            running: this._running,
            influxDb: this._influxDb ? this._influxDb.getStatus() : {}
        };
    }

    async homeyState(enabled, appMetrics) {
        if (enabled) {
            if (!this._homey) {
                this._homey = new HomeyStateHandler({ homey: this.homey, api: this._api, log: this.log });
                this._homey.on('state.changed', this._onHomeyStateChanged.bind(this));
                this._homey.scheduleFetchState();
            }
            this._homey.appMetrics(appMetrics);
        } else {
            if (this._homey) {
                this._homey._clearSchedule();
                this._homey.removeListener('state.changed', this._onHomeyStateChanged.bind(this));
                delete this._homey;
                this._homey = undefined;
            }
        }
    }

    async insights(enabled) {
        if (enabled) {
            if (!this._insights) {
                this._insights = new InsightsHandler({ homey: this.homey, api: this._api, log: this.log });
                this._insights.scheduleExport(60);
            }
        } else {
            if (this._insights) {
                this._insights._clearSchedule();
                delete this._insights;
                this._insights = undefined;
            }
        }
    }

    async enableDisableMetrics() {
        const enabled = this.homey.settings.get('homey_metrics');
        const homeyMetrics = enabled === 'true' || enabled === 'homey';
        const appMetrics = enabled === 'true';
        await this.homeyState(homeyMetrics, appMetrics);
        await this.insights(appMetrics);
        this.log(`Homey metrics: was ${homeyMetrics ? 'enabled' : 'disabled'}, App metrics: was ${appMetrics ? 'enabled' : 'disabled'}`);
    }

    async writeFromValue(measurement, value) {
        if (!this._influxDb) {
            return;
        }
        this._influxDb.write(measurementsUtil.fromValue(measurement, value, this._measurementOptions));
    }

    async writeEvents(events) {
        if (!this._influxDb) {
            return;
        }
        this._influxDb.writeMeasurements(measurementsUtil.fromEvents(events, this._measurementOptions));
    }

    _onUninstall() {
        try {
            if (this._insights) {
                this._insights._clearSchedule();
                delete this._insights;
            }
            if (this._homey) {
                this._homey._clearSchedule();
                delete this._homey;
            }
            this._influxDb._clearSchedule();
            this._devices.unregisterDevices();
            delete this._devices;
            delete this._influxDb;
        } catch (err) {
            this.log('_onUninstall error', err);
        }
    }

    _onOffline(event) {
        this.homey.flow.getTriggerCard('offline')
          .trigger()
          .catch(err => this.log(err));
    }

    _onOnline(event) {
        this.homey.flow.getTriggerCard('online')
          .trigger()
          .catch(err => this.log(err));
    }

    _onHomeyStateChanged(event) {
        if (!this._influxDb) {
            return;
        }
        this._influxDb.write(measurementsUtil.fromEvent(event, this._measurementOptions));
    }

    _onCapability(capability) {
        if (!this._influxDb) {
            return;
        }
        this._influxDb.write(measurementsUtil.fromCapability(capability, this._measurementOptions));
    }

};
