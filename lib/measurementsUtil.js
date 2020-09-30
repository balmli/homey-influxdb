'use strict';

const _formatValue = (value, capability) => {
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
};

const _isNumber = num => {
    return (typeof num == 'string' || typeof num == 'number') && !isNaN(num - 0) && num !== '';
};

const _isSupported = value => {
    return typeof value === 'boolean' || _isNumber(value);
};

const _measurementName = (event, { measurementMode, measurementPrefix }) => {
    let measurementName = event.name.replace(/ /g, '_');
    if (event.zoneName && event.zoneName.length > 0) {
        if (measurementMode === 'by_zone') {
            measurementName = event.zoneName.replace(/ /g, '_');
        } else if (measurementMode === 'by_zone_name') {
            measurementName = event.zoneName.replace(/ /g, '_') + '_' + event.name.replace(/ /g, '_');
        }
    }
    return (measurementPrefix && measurementPrefix.length > 0 ? measurementPrefix + '_' : '') + measurementName;
};

const fromEvent = (event, options) => {
    return {
        measurement: _measurementName(event, options),
        tags: event.tags,
        fields: event.fields,
        timestamp: event.ts ? event.ts : new Date()
    };
};

const fromEvents = (events, options) => {
    return events.map(event => fromEvent(event, options));
};

const fromCapability = (capability, options) => {
    const valueFormatted = _formatValue(capability.value, capability.capability);
    if (valueFormatted === undefined || valueFormatted === null || !_isSupported(capability.value)) {
        return;
    }
    return {
        measurement: _measurementName(capability, options),
        tags: {
            id: capability.id,
            name: capability.name,
            zoneId: capability.zoneId,
            zone: capability.zoneName
        },
        fields: {
            [capability.capId]: valueFormatted
        },
        timestamp: capability.ts ? capability.ts : new Date()
    };
};

module.exports = {
    fromEvent: fromEvent,
    fromEvents: fromEvents,
    fromCapability: fromCapability
};
