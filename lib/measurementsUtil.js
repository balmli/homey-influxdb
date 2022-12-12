'use strict';

const _isNumber = num => {
    return (typeof num == 'string' || typeof num == 'number') && !isNaN(num - 0) && num !== '';
};

const _isSupported = value => {
    return typeof value === 'boolean' || typeof value === 'string' || _isNumber(value);
};

const _formatKey = (value) => {
    return value ? value.replace(/ /g, '_').replace(/\u00A0/g, '_').replace(/,/g, '\\,').replace(/=/g, '\\=').replace(/"/g, '\\"') : value;
}

const _formatMeasurementName = (event, options) => {
    let measurementName = _formatKey(event.name);
    if (event.zoneName && event.zoneName.length > 0 && !!options) {
        if (options.measurementMode === 'by_zone') {
            measurementName = _formatKey(event.zoneName);
        } else if (options.measurementMode === 'by_zone_name') {
            measurementName = _formatKey(event.zoneName) + '_' + _formatKey(event.name);
        }
    }
    return (!!options && options.measurementPrefix && options.measurementPrefix.length > 0 ? _formatKey(options.measurementPrefix) : '') + measurementName;
};

const _formatTagValue = (value) => {
    return _formatKey(value);
};

const _formatFieldValue = (value, capability) => {
    if (value === undefined || value === null) {
        return value;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        return `"${value.replace(/"/g, '\\"').replace(/\\/g, '\\')}"`;
    }

    if (capability && capability.units === '%') {
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
};

const fromEvent = (event, options) => {
    return {
        measurement: _formatMeasurementName(event, options),
        tags: event.tags,
        fields: event.fields,
        timestamp: event.ts ? event.ts : new Date()
    };
};

const fromEvents = (events, options) => {
    return events.map(event => fromEvent(event, options));
};

const fromCapability = (capability, options) => {
    if (!capability) {
        return;
    }
    const valueFormatted = _formatFieldValue(capability.value, capability.capability);
    if (valueFormatted === undefined || valueFormatted === null || !_isSupported(capability.value)) {
        return;
    }
    return {
        measurement: _formatMeasurementName(capability, options),
        tags: {
            id: capability.id,
            name: _formatTagValue(capability.name),
            zoneId: capability.zoneId,
            zone: _formatTagValue(capability.zoneName)
        },
        fields: {
            [capability.capId]: valueFormatted
        },
        timestamp: capability.ts ? capability.ts : new Date()
    };
};

const fromValue = (measurement, value, options) => {
    const valueFormatted = _formatFieldValue(value);
    if (!measurement || value === undefined || value === null || !_isSupported(value)) {
        return;
    }
    return {
        measurement: _formatMeasurementName({
            name: measurement
        }, options),
        tags: {
        },
        fields: {
            value: valueFormatted
        },
        timestamp: new Date()
    };
};

module.exports = {
    _isSupported,
    _formatKey,
    _formatMeasurementName,
    _formatTagValue,
    _formatFieldValue,
    fromEvent,
    fromEvents,
    fromCapability,
    fromValue
};
