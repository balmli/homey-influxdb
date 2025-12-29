'use strict';

const EventEmitter = require('events');
const http = require('http.min');
const escape = require('./escape');

const MESSAGES_SHALL_WRITE = 1000;
const MESSAGES_BUFFERED_MAX = 2000;

module.exports = class InfluxDb extends EventEmitter {

    constructor(options) {
        super();
        options = options || {};
        this.log = options.log || console.log;
        this.homey = options.homey;
        this._write_interval = 10;
        this._measurements = [];
        this._counter = 0;
        this.updateSettings(options);
    }

    getStatus() {
        return {
            url: this._host && this._host.length > 0 ? `${this._protocol}://${this._host}:${this._port}` : '',
            database: this._database,
            connected: this._connected,
            measurements: this._counter
        }
    }

    async updateSettings(options) {
        this._host = options.host;
        this._protocol = options.protocol || 'http';
        this._port = options.port || '8086';
        this._organization = options.organization || '';
        this._token = options.token || '';
        this._username = options.username || 'root';
        this._password = options.password || 'root';
        this._database = options.database;
        this._connected = false;
        this._isV2 = this._organization && this._organization.length > 0 && this._token && this._token.length > 0;
    }

    updateWriteInterval(write_interval) {
        if (!write_interval || write_interval < 10 || write_interval > 60) {
            throw new Error("Invalid write interval");
        }
        this._write_interval = write_interval;
    }

    _validateConnection() {
        // Validate host
        if (!this._host || typeof this._host !== 'string' || this._host.trim().length === 0) {
            return false;
        }

        // Validate port
        const port = parseInt(this._port);
        if (isNaN(port) || port < 1 || port > 65535) {
            return false;
        }

        // Validate protocol
        if (this._protocol !== 'http' && this._protocol !== 'https') {
            return false;
        }

        return true;
    }

    write(measurement) {
        if (this._measurements.length > MESSAGES_SHALL_WRITE) {
            this._onWriteToInfluxDb();
        }
        if (this._measurements.length > MESSAGES_BUFFERED_MAX) {
            return;
        }
        if (!measurement) {
            return;
        }
        this._measurements.push(measurement);
        this.log(`[${this._measurements.length}]: ${measurement.measurement} = ${JSON.stringify(measurement.fields)}`);
    }

    _hostDefined() {
        return this._validateConnection() &&
            this._database && this._database.length > 0;
    }

    async _pingDatabase(host, protocol, port, token) {
        return this._isV2 ? await this._pingDatabaseV2(host, protocol, port, token) :
            await this._pingDatabaseV1(host, protocol, port);
    }

    async _pingDatabaseV1(host, protocol, port) {
        let result;
        try {
            result = await http.get({
                uri: `${protocol}://${host}:${port}/ping`,
                timeout: 5000
            });
        } catch (err) {
            throw new Error(`Failed to ping InfluxDB at ${protocol}://${host}:${port}: ${err.message}`);
        }
        if (!result || !result.response) {
            throw new Error(`Missing response from ${protocol}://${host}:${port}`);
        }
        if (result.response.statusCode !== 204) {
            throw new Error(`InfluxDb at ${protocol}://${host}:${port} is not online! (${result.response.statusCode})`);
        }
    }

    async _pingDatabaseV2(host, protocol, port, token) {
        try {
            await this._pingDatabaseV1(host, protocol, port);
            return;
        } catch (err) {
            // V1 ping failed, try V2 health endpoint
        }
        let result;
        try {
            result = await http.get({
                uri: `${protocol}://${host}:${port}/health`,
                timeout: 5000,
                json: true,
                headers: {
                    'Authorization': `Token ${token}`
                }
            });
        } catch (err) {
            throw new Error(`Failed to check health of InfluxDB v2 at ${protocol}://${host}:${port}: ${err.message}`);
        }
        if (!result || !result.response) {
            throw new Error(`No response from ${protocol}://${host}:${port}`);
        }
        if (result.response.statusCode === 200) {
            const data = result.data;
            if (data.status !== 'pass') {
                throw new Error(`InfluxDb at ${protocol}://${host}:${port} is not online!`);
            }
        } else {
            throw new Error(`InfluxDb at ${protocol}://${host}:${port} is not online! (${result.response.statusCode})`);
        }
    }

    async _createInfluxDb() {
        try {
            this._connected = false;
            if (!this._hostDefined()) {
                this.log('InfluxDb: missing host / database', this._host);
            } else {
                try {
                    await this._pingDatabase(this._host, this._protocol, this._port, this._token);
                    if (!this._isV2) {
                        const names = await this._getDatabaseNamesV1();
                        if (!names.includes(this._database)) {
                            await this._createDatabaseV1(this._database);
                            this.log(`InfluxDb: created database: ${this._database}`);
                        }
                    }
                    this._connected = true;
                    this.log(`InfluxDb: connected to ${this._protocol}://${this._host}:${this._port} ${this._database}`);
                } catch (err) {
                    this.log(`InfluxDb: connection to ${this._protocol}://${this._host}:${this._port} ${this._database} failed!`);
                    this._connected = false;
                }
            }
        } catch (err) {
            this.log('createInfluxDb error', err);
        }
    };

    _createQueryV1(query) {
        try {
            return http.post({
                uri: `${this._protocol}://${this._host}:${this._port}/query`,
                timeout: 10000,
                json: true,
                query: {
                    u: this._username,
                    p: this._password
                },
            }, query);
        } catch (err) {
            return Promise.reject(new Error(`Query failed: ${err.message}`));
        }
    }

    async _getDatabaseNamesV1() {
        try {
            const result = await this._createQueryV1('q=SHOW DATABASES');
            if (result.response.statusCode === 200) {
                return result.data.results[0].series[0].values.map(val => val[0]);
            }
        } catch (err) {
            this.log('_getDatabaseNamesV1 error', err);
        }
        return [];
    }

    async _createDatabaseV1(database) {
        try {
            const result = await this._createQueryV1(`q=CREATE DATABASE ${escape.quoted(database)}`);
            if (result.response.statusCode !== 200) {
                this.log('_createDatabaseV1 failed', result.response.statusCode, result.response.statusMessage);
            }
        } catch (err) {
            this.log('_createDatabaseV1 error', err);
        }
    }

    _clearSchedule() {
        if (this._timeoutWriteToInfluxDb) {
            this.homey.clearTimeout(this._timeoutWriteToInfluxDb);
            this._timeoutWriteToInfluxDb = undefined;
        }
    }

    scheduleWriteToInfluxDb() {
        this._clearSchedule();
        this._timeoutWriteToInfluxDb = this.homey.setTimeout(this._onWriteToInfluxDb.bind(this), this._write_interval * 1000);
    }

    async _onWriteToInfluxDb() {
        if (this._isWriting) {
            return;
        }
        try {
            this._isWriting = true;
            this._clearSchedule();
            if (this._measurements.length > 0) {
                await this._checkInfluxDbConnection();
                if (this._connected) {
                    const measurements = [...this._measurements];
                    this._measurements = [];
                    const start = Date.now();
                    this._writePoints(measurements).then(() => {
                        this._counter = this._counter + measurements.length;
                        this.log(`InfluxDb: ${measurements.length} measurements written  (${(Date.now() - start)} ms)`);
                    }).catch(err => {
                        this._measurements.push(...measurements);
                        this.log(`InfluxDB error: ${err.stack}`, measurements);
                    });
                }
            }
        } finally {
            this.scheduleWriteToInfluxDb();
            this._isWriting = false;
        }
    }

    async writeMeasurements(measurements) {
        try {
            if (measurements.length > 0) {
                await this._checkInfluxDbConnection();
                if (this._connected) {
                    const start = Date.now();
                    await this._writePoints(measurements);
                    this._counter = this._counter + measurements.length;
                    this.log(`InfluxDb: ${measurements.length} measurements written  (${(Date.now() - start)} ms)`);
                }
            }
        } catch (err) {
            this.log(`InfluxDB error: ${err.stack}`);
        }
    }

    _toBody(measurements) {
        return measurements
            .map(({measurement, tags = {}, fields, timestamp}) => {
                let cntr = 0;
                const tagsString = Array.isArray(tags) ?
                    tags.map(tag => `,tag_${cntr++}=${escape.tag(tag.replace(/\u00A0/g, ' '))}`).join('') :
                    Object.keys(tags).map(tagKey => `,${tagKey}=${escape.tag(tags[tagKey].replace(/\u00A0/g, ' '))}`).join('');

                const fieldsString = Object.keys(fields)
                    .map(fieldKey => `${fieldKey}=${fields[fieldKey]}`)
                    .join(',');

                timestamp = timestamp ? ' ' + (timestamp instanceof Date ? timestamp.getTime() : timestamp) : '';

                return `${escape.measurement(measurement)}${tagsString} ${fieldsString}${timestamp}`;
            })
            .join('\n');
    }

    _writePoints(measurements) {
        return this._isV2 ? this._writePointsV2(measurements) : this._writePointsV1(measurements);
    }

    _writePointsV1(measurements) {
        try {
            const body = this._toBody(measurements);
            return http.post({
                uri: `${this._protocol}://${this._host}:${this._port}/write`,
                timeout: 10000,
                query: {
                    db: this._database,
                    u: this._username,
                    p: this._password,
                    precision: 'ms'
                },
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8'
                }
            }, body);
        } catch (err) {
            return Promise.reject(new Error(`Failed to write to InfluxDB v1: ${err.message}`));
        }
    }

    _writePointsV2(measurements) {
        try {
            const body = this._toBody(measurements);
            return http.post({
                uri: `${this._protocol}://${this._host}:${this._port}/api/v2/write`,
                timeout: 10000,
                query: {
                    orgID: this._organization,
                    bucket: this._database,
                    precision: 'ms'
                },
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Authorization': `Token ${this._token}`
                }
            }, body);
        } catch (err) {
            return Promise.reject(new Error(`Failed to write to InfluxDB v2: ${err.message}`));
        }
    }

    async _checkInfluxDbConnection() {
        if (!this._hostDefined()) {
            this.log('InfluxDb: host is not defined');
            return;
        }
        let online = false;
        try {
            await this._pingDatabase(this._host, this._protocol, this._port, this._token);
            online = true;
        } catch (err) {
            this.log('_checkInfluxDbConnection', err);
            online = false;
        }
        if (this._connected && !online) {
            this._connected = false;
            this.log('InfluxDb: is marked as "offline"');
            this.emit('offline');
        } else if (!this._connected && online) {
            await this._createInfluxDb();
            this.emit('online');
            this.log('InfluxDb: is marked as "online"');
        }
    }

    destroy() {
        this._clearSchedule();
    }

};
