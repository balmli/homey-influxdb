'use strict';

const EventEmitter = require('events');

module.exports = class DeviceHandler extends EventEmitter {

    constructor(options) {
        super();
        options = options || {};
        this.log = options.log || console.log;
        this._api = options.api;
        this._nodes = new Map();
        this._zones = new Map();
        this._capabilityInstances = new Map();

        this._api.devices.on('device.update', this._onDeviceUpdate.bind(this));
        this._api.devices.on('device.delete', this._onDeviceDelete.bind(this));

        this._api.zones.on('zones.create', this._onZoneCreate.bind(this));
        this._api.zones.on('zones.update', this._onZoneUpdate.bind(this));
        this._api.zones.on('zones.delete', this._onZoneDelete.bind(this));
    }

    async _onDeviceUpdate(deviceUpdated) {
        if (!deviceUpdated.ready) {
            return;
        }
        const { changedDevice } = this._hasNodeChanged(deviceUpdated);
        if (changedDevice) {
            //this.log('Updated device', deviceUpdated.id, deviceUpdated.name, deviceUpdated.capabilities);
            const device = await this._api.devices.getDevice({ id: deviceUpdated.id });
            await this._registerDevice(device);
        }
    }

    _hasNodeChanged(device) {
        const node = this._nodes.get(device.id);
        let changedDevice = !this._nodes.has(device.id) ||
            node && node.name !== device.name ||
            node && node.zone !== device.zone ||
            node && node.capabilities.length !== device.capabilities.length ||
            node && node.capabilities.slice().sort().join(",") !== device.capabilities.slice().sort().join(",");
        return { node, changedDevice };
    }

    async _onDeviceDelete(deviceDeleted) {
        this.log('Remove device', deviceDeleted.id);
        this._unregisterDevice(deviceDeleted.id);
    }

    async _onZoneCreate(id) {
        this.log('Zone added', id);
        await this._getAndRegisterZone(id);
    }

    async _onZoneUpdate(id) {
        this.log('Zone updated', id);
        await this._getAndRegisterZone(id);
    }

    async _getAndRegisterZone(theDevice) {
        setTimeout(async () => {
            const zone = await this.api.zones.getZone({ id: theDevice.id });
            if (zone) {
                await this._registerZone(zone);
            }
        }, 1000);
    }

    async _onZoneDelete(zoneId) {
        this.log('Zone deleted', zoneId);
        if (!this._zones.has(zoneId)) {
            return;
        }
        this._zones.delete(zoneId);
        //this.log('Zone deleted', zoneId);
    }

    async registerDevices() {
        this.log("Register devices");
        const devices = await this._api.devices.getDevices();
        if (devices) {
            for (let key in devices) {
                const device = devices[key];
                await this._registerDevice(device);
            }
            this.log('registerDevices', Object.getOwnPropertyNames(devices).length);
        }
        const zones = await this._api.zones.getZones();
        if (zones) {
            for (let key in zones) {
                const zone = zones[key];
                await this._registerZone(zone);
            }
        }
    }

    _createNode(device) {
        const node = {
            id: device.id,
            name: device.name,
            zone: device.zone,
            capabilities: device.capabilities
        };
        this._nodes.set(device.id, node);
        return node;
    }

    async _registerDevice(device) {
        if (!device ||
            typeof device !== 'object' ||
            !device.id ||
            !device.name ||
            !device.capabilities ||
            !device.capabilitiesObj) {
            this.log('Invalid device', device.id, device.name, device.capabilities, device.capabilitiesObj);
            return;
        }

        this.log(`Register device: ${device.id} ${device.name}`);
        this._createNode(device);

        const capabilities = device.capabilitiesObj;
        for (let key in capabilities) {
            if (capabilities.hasOwnProperty(key)) {
                const capability = capabilities[key];
                if (capability.type === 'number' || capability.type === 'boolean') {
                    this._registerCapability(device, capability, key);
                }
            }
        }
    }

    _registerCapability(device, capability, capabilityKey) {
        try {
            const deviceCapabilityId = device.id + capability.id;
            this._destroyCapabilityInstance(deviceCapabilityId);
            device.setMaxListeners(100);
            const capabilityInstance = device.makeCapabilityInstance(capabilityKey, value => {
                const node = this._nodes.get(device.id);
                let zone;
                if (node) {
                    zone = this._zones.get(node.zone);
                }
                this.emit('capability', {
                    id: device.id,
                    name: device.name,
                    zoneId: node ? node.zone : '',
                    zoneName: zone ? zone.name : '',
                    capability: capability,
                    capId: capability.id,
                    value: value
                });
            });
            this._capabilityInstances.set(deviceCapabilityId, capabilityInstance);
            this.log("Registered capability instance", device.name, capability.title, capability.type);
        } catch (e) {
            this.log("Error capability: " + capabilityKey, e);
        }
    }

    _destroyCapabilityInstance(deviceCapabilityId) {
        const capabilityInstance = this._capabilityInstances.get(deviceCapabilityId);
        if (capabilityInstance) {
            capabilityInstance.destroy();
            this._capabilityInstances.delete(deviceCapabilityId);
            this.log("Destroyed capability instance", deviceCapabilityId);
        }
    }

    unregisterDevices() {
        this.log("Unregister devices");
        for (var [id, node] of this._nodes.entries()) {
            try {
                this._unregisterDevice(id);
            } catch (e) {
                this.log('Failed to unregister device', id, e);
            }
        }
        this._nodes.clear();
    }

    _unregisterDevice(deviceId) {
        if (!this._nodes.has(deviceId)) {
            return;
        }

        const node = this._nodes.get(deviceId);
        const deviceCaps = node.capabilities;
        if (deviceCaps) {
            if (deviceCaps) {
                for (let capabilityId of deviceCaps) {
                    this._destroyCapabilityInstance(deviceId + capabilityId);
                }
            }
        }

        this._nodes.delete(deviceId);
    }

    _createZone(zone) {
        const node = {
            id: zone.id,
            name: zone.name,
            parent: zone.parent
        };
        this._zones.set(zone.id, node);
    }

    async _registerZone(zone) {
        this.log(`Register zone: ${zone.id} ${zone.name}`);
        this._createZone(zone);
        return true;
    }

    destroy() {
    }

};
