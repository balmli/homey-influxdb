'use strict';

const Homey = require('homey');
const EventEmitter = require('events');
const Queue = require('./Queue');

module.exports = class InsightsHandler extends EventEmitter {

    constructor(options) {
        super();
        options = options || {};
        this.log = options.log || console.log;
        this._api = options.api;
        this._logs = [];
        this._runQueue = new Queue({
            initHandler: this._initExport.bind(this),
            runHandler: this._runQueueHandler.bind(this),
            log: this.log
        });
        this._abort = false;
    }

    isExporting() {
        return this._runQueue.isRunning();
    }

    _clearSchedule() {
        if (this._timeoutExport) {
            clearTimeout(this._timeoutExport);
            this._timeoutExport = undefined;
        }
    }

    scheduleExport(interval = 600) { // Default: every 10 minutes
        this._clearSchedule();
        this._timeoutExport = setTimeout(this._onExport.bind(this), interval * 1000);
    }

    _onExport() {
        try {
            this._clearSchedule();
            this._exportAppCpuUsageLastHour();
        } finally {
            this.scheduleExport();
        }
    }

    _exportAppCpuUsageLastHour() {
        this._runQueue.enQueue({ appId: 'apps', resolution: 'lastHour' });
    }

    async _runQueueHandler(item) {
        try {
            this.log(`Export of ${item.appId} ${item.resolution} started`);
            this.emit('export.started', {
                appId: item.appId,
                resolution: item.resolution
            });
            if (item.appId === 'apps') {
                await this._exportLogsCpu(item.resolution);
            }
            this.log(`Export of ${item.appId} ${item.resolution} ended`);
            this.emit('export.ended', {
                appId: item.appId,
                resolution: item.resolution
            });
        } catch (err) {
            this.log(`Export of ${item.appId} failed`, err);
        }
    }

    stopExport() {
        this._abort = true;
        this._runQueue.flushQueue();
    }

    async _initExport() {
        try {
            this._logs = await this._api.insights.getLogs();
            this.log(`Get logs: ${this._logs.length}`);
        } catch (err) {
            this.log('initExport failed', err);
        }
    }

    async _exportLogsCpu(resolution) {
        this.log(`Exporting CPU per app`);
        const events = [];
        const logs = this._logs
            .filter(log => log.uri === `homey:manager:apps` &&
                log.id.endsWith('-cpuusage') &&
                (log.type === 'number' || log.type === 'boolean'));

        for (let log of logs) {
            const theAppId = log.id.substr(0, log.id.length - 9);
            const pos = log.title.indexOf(' — ');
            const theAppName = pos >= 0 ? log.title.substr(0, pos) : theAppId;
            const entries = await this._api.insights.getLogEntries({
                uri: log.uri,
                id: log.id,
                resolution: log.type !== 'boolean' ? resolution : undefined
            });
            let lastEntry = undefined;
            for (let entry of entries.values) {
                if (lastEntry === undefined || entry.v !== lastEntry.v) {
                    events.push({
                        name: `app:homey:app:${theAppId}`,
                        tags: ['cpu', `${theAppId}`, `${theAppName}`],
                        fields: {
                            cpu: entry.v
                        },
                        ts: new Date(entry.t)
                    });
                }
                lastEntry = entry;
            }
        }
        await Homey.app.writeEvents(events);
    }

    destroy() {
        this._clearSchedule();
    }

};
