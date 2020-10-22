'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('athom-api');
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
            Homey.on('unload', () => this._onUninstall());
            await this.getApi();
            this._api.devices.setMaxListeners(9999);
            if (await this.shallWaitForHomey()) {
                await this.waitForHomey();
            }
            this._influxDb = new InfluxDb({ log: this.log });
            this._influxDb.on('offline', this._onOffline.bind(this));
            this._influxDb.on('online', this._onOnline.bind(this));
            await this.initSettings();
            await this.initFlows();
            this._devices = new DeviceHandler({ api: this._api, log: this.log });
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
        const host = Homey.ManagerSettings.get('host');
        if (!host || host.length === 0) {
            Homey.ManagerSettings.set('host', '');
        }
        const protocol = Homey.ManagerSettings.get('protocol');
        if (!protocol || protocol.length === 0) {
            Homey.ManagerSettings.set('protocol', 'http');
        }
        const port = Homey.ManagerSettings.get('port');
        if (!port || port.length === 0) {
            Homey.ManagerSettings.set('port', '8086');
        }
        const organization = Homey.ManagerSettings.get('organization');
        if (!organization || organization.length === 0) {
            Homey.ManagerSettings.set('organization', '');
        }
        const token = Homey.ManagerSettings.get('token');
        if (!token || token.length === 0) {
            Homey.ManagerSettings.set('token', '');
        }
        const username = Homey.ManagerSettings.get('username');
        if (!username || username.length === 0) {
            Homey.ManagerSettings.set('username', 'root');
        }
        const password = Homey.ManagerSettings.get('password');
        if (!password || password.length === 0) {
            Homey.ManagerSettings.set('password', 'root');
        }
        const database = Homey.ManagerSettings.get('database');
        if (!database || database.length === 0) {
            Homey.ManagerSettings.set('database', 'homey');
        }
        let measurementMode = Homey.ManagerSettings.get('measurement_mode');
        if (measurementMode === undefined || measurementMode === null) {
            measurementMode = 'by_name';
            Homey.ManagerSettings.set('measurement_mode', measurementMode);
        }
        let measurementPrefix = Homey.ManagerSettings.get('measurement_prefix');
        if (measurementPrefix === undefined || measurementPrefix === null) {
            measurementPrefix = '';
            Homey.ManagerSettings.set('measurement_prefix', measurementPrefix);
        }
        const homey_metrics = Homey.ManagerSettings.get('homey_metrics');
        if (homey_metrics === null || homey_metrics === true) {
            Homey.ManagerSettings.set('homey_metrics', 'true');
        } else if (homey_metrics === false) {
            Homey.ManagerSettings.set('homey_metrics', 'false');
        }
        let write_interval = Homey.ManagerSettings.get('write_interval');
        if (!write_interval) {
            write_interval = 10;
            Homey.ManagerSettings.set('write_interval', write_interval);
        }
        this._measurementOptions = {
            measurementMode: measurementMode,
            measurementPrefix: measurementPrefix
        };
        Homey.ManagerSettings.on('set', this._onSettingsChanged.bind(this));
        await this._influxDb.updateSettings({
            host: Homey.ManagerSettings.get('host'),
            protocol: Homey.ManagerSettings.get('protocol'),
            port: Homey.ManagerSettings.get('port'),
            organization: Homey.ManagerSettings.get('organization'),
            token: Homey.ManagerSettings.get('token'),
            username: Homey.ManagerSettings.get('username'),
            password: Homey.ManagerSettings.get('password'),
            database: Homey.ManagerSettings.get('database')
        });
        this._influxDb.updateWriteInterval(write_interval);
    }

    async _onSettingsChanged(key) {
        this.log('Settings changed', key);
        if (key === 'settings') {
            const settings = Homey.ManagerSettings.get('settings');
            Homey.ManagerSettings.set('host', settings.host);
            Homey.ManagerSettings.set('protocol', settings.protocol);
            Homey.ManagerSettings.set('port', settings.port);
            Homey.ManagerSettings.set('organization', settings.organization);
            Homey.ManagerSettings.set('token', settings.token);
            Homey.ManagerSettings.set('username', settings.username);
            Homey.ManagerSettings.set('password', settings.password);
            Homey.ManagerSettings.set('database', settings.database);
            Homey.ManagerSettings.set('measurement_mode', settings.measurement_mode);
            Homey.ManagerSettings.set('measurement_prefix', settings.measurement_prefix);
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
            await delay(120 * 1000);
        }
    }

    async initFlows() {
        this.offlineTrigger = new Homey.FlowCardTrigger('offline');
        await this.offlineTrigger.register();

        this.onlineTrigger = new Homey.FlowCardTrigger('online');
        await this.onlineTrigger.register();

        new Homey.FlowCardCondition('is_online')
            .register()
            .registerRunListener((args, state) => this._influxDb ? this._influxDb.getStatus().connected : false);

        new Homey.FlowCardCondition('is_metrics_enabled')
            .register()
            .registerRunListener((args, state) => Homey.ManagerSettings.get('homey_metrics') !== 'false');

        new Homey.FlowCardCondition('is_app_metrics_enabled')
            .register()
            .registerRunListener((args, state) => Homey.ManagerSettings.get('homey_metrics') === 'true');

        new Homey.FlowCardAction('enable_metrics')
            .register()
            .registerRunListener(async (args, state) => {
                Homey.ManagerSettings.set('homey_metrics', args.enabled);
                await this.enableDisableMetrics();
            });

        new Homey.FlowCardAction('influxdb_write_interval')
            .register()
            .registerRunListener(async (args, state) => {
                Homey.ManagerSettings.set('write_interval', args.write_interval);
                this._influxDb.updateWriteInterval(args.write_interval);
            });
    }

    async getApi() {
        if (!this._api) {
            this._api = await HomeyAPI.forCurrentHomey();
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
                this._homey = new HomeyStateHandler({ api: this._api, log: this.log });
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
                this._insights = new InsightsHandler({ api: this._api, log: this.log });
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
        const enabled = Homey.ManagerSettings.get('homey_metrics');
        const homeyMetrics = enabled === 'true' || enabled === 'homey';
        const appMetrics = enabled === 'true';
        await this.homeyState(homeyMetrics, appMetrics);
        await this.insights(appMetrics);
        this.log(`Homey metrics: was ${homeyMetrics ? 'enabled' : 'disabled'}, App metrics: was ${appMetrics ? 'enabled' : 'disabled'}`);
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
        this.offlineTrigger.trigger();
    }

    _onOnline(event) {
        this.onlineTrigger.trigger();
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
