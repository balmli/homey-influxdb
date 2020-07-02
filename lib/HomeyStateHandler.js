'use strict';

const EventEmitter = require('events');

module.exports = class HomeyStateHandler extends EventEmitter {

    constructor(options) {
        super();
        options = options || {};
        this.log = options.log || console.log;
        this._api = options.api;
    }

    _clearSchedule() {
        if (this._timeoutFetchState) {
            clearTimeout(this._timeoutFetchState);
            this._timeoutFetchState = undefined;
        }
    }

    scheduleFetchState(interval = 30) {
        this._clearSchedule();
        this._timeoutFetchState = setTimeout(this._onUpdateData.bind(this), interval * 1000);
    }

    _onUpdateData() {
        try {
            this._clearSchedule();
            this._updateSystemData();
            this._updateMemoryData();
            this._updateStorageData();
        } finally {
            this.scheduleFetchState();
        }
    }

    _updateSystemData() {
        this._api.system.getInfo().then(systemInfo => {
            //this.log('_updateSystemData', JSON.stringify(systemInfo));
            this._onCpuLoadChanged({
                average_1: systemInfo.loadavg[0],
                average_5: systemInfo.loadavg[1],
                average_15: systemInfo.loadavg[2],
                cpu_speed: systemInfo.cpus[0].speed
            });
            for (let time in systemInfo.cpus[0].times) {
                if (systemInfo.cpus[0].times.hasOwnProperty(time)) {
                    this._onCpuTimesChanged({
                        field: `time_${time}`,
                        time: systemInfo.cpus[0].times[time]
                    });
                }
            }
        }).catch(err => {
            this.log("Update system info failed", err);
        });
    }

    _onCpuLoadChanged(load) {
        this.emit('state.changed', {
            name: 'homey:cpu_load',
            tags: ['cpu_load'],
            fields: load
        });
    }

    _onCpuTimesChanged(times) {
        this.emit('state.changed', {
            name: 'homey:cpu_times',
            tags: ['cpu_times'],
            fields: {
                [times.field]: times.time
            }
        });
    }

    _updateMemoryData() {
        this._api.system.getMemoryInfo().then(memoryInfo => {
            //this.log('_updateMemoryData', JSON.stringify(memoryInfo));
            this._onMemoryChanged({
                memory_total: memoryInfo.total,
                memory_free: memoryInfo.free,
                memory_swap: memoryInfo.swap,
            });
            for (let app in memoryInfo.types) {
                if (memoryInfo.types.hasOwnProperty(app)) {
                    this._onMemoryAppChanged({
                        app: app,
                        name: memoryInfo.types[app].name,
                        memory_used: memoryInfo.types[app].size
                    });
                }
            }
        }).catch(err => {
            this.log("Update memory info failed", err);
        });
    }

    _onMemoryChanged(memory_info) {
        this.emit('state.changed', {
            name: 'homey:memory',
            tags: ['memory'],
            fields: memory_info
        });
    }

    _onMemoryAppChanged(memory_info) {
        this.emit('state.changed', {
            name: `app:${memory_info.app}`,
            tags: ['memory', `${memory_info.app}`, `${memory_info.name}`],
            fields: {
                memory_used: memory_info.memory_used
            }
        });
    }

    _updateStorageData() {
        this._api.system.getStorageInfo().then(storageInfo => {
            //this.log('_updateStorageData', JSON.stringify(storageInfo));
            this._onStorageChanged({
                storage_total: storageInfo.total,
                storage_free: storageInfo.free
            });
            for (let app in storageInfo.types) {
                if (storageInfo.types.hasOwnProperty(app)) {
                    this._onStorageAppChanged({
                        app: app,
                        name: storageInfo.types[app].name,
                        storage_used: storageInfo.types[app].size
                    });
                }
            }
        }).catch(err => {
            this.log("Update storage info failed", err);
        });
    }

    _onStorageChanged(storage_info) {
        this.emit('state.changed', {
            name: 'homey:storage',
            tags: ['storage'],
            fields: storage_info
        });
    }

    _onStorageAppChanged(storage_info) {
        this.emit('state.changed', {
            name: `app:${storage_info.app}`,
            tags: ['storage', `${storage_info.app}`, `${storage_info.name}`],
            fields: {
                storage_used: storage_info.storage_used
            }
        });
    }

    destroy() {
        this._clearSchedule();
    }

};