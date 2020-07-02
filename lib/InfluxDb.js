'use strict';

const Influx = require('influx');
const MAX_MESSAGES_BUFFERED = 1000;

module.exports = class InfluxDb {

    constructor(options) {
        options = options || {};
        this.log = options.log || console.log;
        this._measurements = [];
        this._influx = undefined;
        this.updateSettings(options);
    }

    async updateSettings(options) {
        this._host = options.host;
        this._protocol = options.protocol || 'http';
        this._port = options.port || '8086';
        this._username = options.username || 'root';
        this._password = options.password || 'root';
        this._database = options.database;
        this._connected = false;
    }

    write(measurement) {
        if (this._measurements.length > MAX_MESSAGES_BUFFERED) {
            return;
        }
        this._measurements.push(measurement);
        this.log(`[${this._measurements.length}]: ${measurement.measurement} = ${JSON.stringify(measurement.fields)}`);
    }

    _hostDefined() {
        return this._host && this._host.length > 0 &&
            this._database && this._database.length > 0;
    }

    async _pingDatabase(host, protocol, port, username, password) {
        const influxDb = new Influx.InfluxDB({
            host: host,
            protocol: protocol,
            port: port,
            username: username,
            password: password
        });
        const pingStats = await influxDb.ping(2000);
        const hostStats = pingStats && pingStats.length > 0 ? pingStats[0] : undefined;
        if (!hostStats) {
            throw new Error(`No response from ${host}:${port}`);
        }
        //this.log(`InfluxDb: ${hostStats.url.host} is ${hostStats.online ? 'online' : 'offline'}  (${hostStats.rtt} ms)`);
        if (!hostStats.online) {
            throw new Error(`InfluxDb at ${host}:${port} is not online!`);
        }
    }

    async _createInfluxDb() {
        try {
            this._connected = false;
            if (!this._hostDefined()) {
                this._influx = undefined;
                this.log('InfluxDb: missing host / database', this._host);
            } else {
                try {
                    await this._pingDatabase(this._host, this._protocol, this._port, this._username, this._password);
                    this._influx = new Influx.InfluxDB({
                        host: this._host,
                        protocol: this._protocol,
                        port: this._port,
                        username: this._username,
                        password: this._password
                    });
                    const names = await this._influx.getDatabaseNames();
                    if (!names.includes(this._database)) {
                        await this._influx.createDatabase(this._database);
                        this.log(`InfluxDb: created database: ${this._database}`);
                    }
                    this._connected = true;
                    this.log(`InfluxDb: connected to ${this._host}:8086 ${this._database}`);
                } catch (err) {
                    this.log(`InfluxDb: connection to ${this._host}:8086 ${this._database} failed!`);
                    this._connected = false;
                    this._influx = undefined;
                }
            }
        } catch (err) {
            this.log('createInfluxDb error', err);
        }
    };

    _clearSchedule() {
        if (this._timeoutWriteToInfluxDb) {
            clearTimeout(this._timeoutWriteToInfluxDb);
            this._timeoutWriteToInfluxDb = undefined;
        }
    }

    scheduleWriteToInfluxDb(interval = 10) {
        this._clearSchedule();
        this._timeoutWriteToInfluxDb = setTimeout(this._onWriteToInfluxDb.bind(this), interval * 1000);
    }

    async _onWriteToInfluxDb() {
        try {
            this._clearSchedule();
            if (this._measurements.length > 0) {
                await this._checkInfluxDbConnection();
                if (this._connected && this._influx) {
                    const measurements = [...this._measurements];
                    this._measurements = [];
                    const start = Date.now();
                    this._influx.writePoints(measurements,
                        { database: this._database }).then(() => {
                        this.log(`InfluxDb: ${measurements.length} measurements written  (${(Date.now() - start)} ms)`);
                    }).catch(err => {
                        this._measurements.push(measurements);
                        this.log(`InfluxDB error: ${err.stack}`, measurements);
                    });
                }
            }
        } finally {
            this.scheduleWriteToInfluxDb();
        }
    }

    async _checkInfluxDbConnection() {
        if (!this._hostDefined()) {
            this.log('InfluxDb: host is not defined');
            return;
        }
        let online = false;
        try {
            await this._pingDatabase(this._host, this._protocol, this._port, this._database, this._password);
            online = true;
        } catch (err) {
            online = false;
        }
        if (this._connected && !online) {
            this._connected = false;
            this._influx = undefined;
            this.log('InfluxDb: is marked as "offline"');
        } else if (!this._connected && online) {
            await this._createInfluxDb();
            this.log('InfluxDb: is marked as "online"');
        }
    }

    destroy() {
        this._clearSchedule();
    }

};
