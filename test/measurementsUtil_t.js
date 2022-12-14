const chai = require("chai");
const expect = chai.expect;

const measurementsUtil = require('../lib/measurementsUtil');

describe("_isSupported", function () {
  describe("Check null", function () {
    it("Check null", function () {
      expect(measurementsUtil._isSupported(null)).to.eq(false)
    });
  });
  describe("Check booleans", function () {
    it("Check boolean 1", function () {
      expect(measurementsUtil._isSupported(true)).to.eq(true)
    });
    it("Check boolean 2", function () {
      expect(measurementsUtil._isSupported(false)).to.eq(true)
    });
  });
  describe("Check strings", function () {
    it("Check string", function () {
      expect(measurementsUtil._isSupported('aString')).to.eq(true)
    });
  });
  describe("Check numbers", function () {
    it("Check number 1", function () {
      expect(measurementsUtil._isSupported(0)).to.eq(true)
    });
    it("Check number 2", function () {
      expect(measurementsUtil._isSupported(1)).to.eq(true)
    });
  });
});

describe("_formatKey", function () {
  describe("Check null", function () {
    it("Check null", function () {
      expect(measurementsUtil._formatKey(null)).null
    });
  });
  describe("Check strings", function () {
    it("Check string 1", function () {
      expect(measurementsUtil._formatKey('Bo No')).to.eq('Bo_No')
    });
    it("Check string 2", function () {
      expect(measurementsUtil._formatKey('Bo , = "')).to.eq('Bo_\\,_\\=_\\"')
    });
  });
});

describe("_formatMeasurementName", function () {
  describe("Check null", function () {
    it("Check null 1", function () {
      expect(measurementsUtil._formatMeasurementName({ name: 'no' }, null)).to.eq('no')
    });
    it("Check null 2 ", function () {
      expect(measurementsUtil._formatMeasurementName({ name: 'no' }, {})).to.eq('no')
    });
  });
  describe("Check strings", function () {
    it("Check string 1", function () {
      expect(measurementsUtil._formatMeasurementName({ name: 'Bo No' }, {})).to.eq('Bo_No')
    });
    it("Check string 2", function () {
      expect(measurementsUtil._formatMeasurementName({ name: 'Bo , = "' }, {})).to.eq('Bo_\\,_\\=_\\"')
    });
    it("Check string 3", function () {
      expect(measurementsUtil._formatMeasurementName({ name: 'Another Name = Bob' }, {
        measurementPrefix: 'APrefix=, '
      })).to.eq('APrefix\\=\\,_Another_Name_\\=_Bob')
    });
  });
  describe("Check strings with options", function () {
    it("Check string with options 1", function () {
      expect(measurementsUtil._formatMeasurementName({
        name: 'Measurement Name',
        zoneName: 'Zone Name'
      }, {
        measurementMode: 'by_zone',
        measurementPrefix: 'Pref'
      })).to.eq('PrefZone_Name')
    });
    it("Check string with options 2", function () {
      expect(measurementsUtil._formatMeasurementName({
        name: 'Measurement Name',
        zoneName: 'Zone Name'
      }, {
        measurementMode: 'by_zone_name',
        measurementPrefix: 'Pref'
      })).to.eq('PrefZone_Name_Measurement_Name')
    });
  });
});

describe("_formatFieldValue", function () {
  describe("Check null", function () {
    it("Check null", function () {
      expect(measurementsUtil._formatFieldValue(null, null)).null
    });
  });
  describe("Check booleans", function () {
    it("Check boolean", function () {
      expect(measurementsUtil._formatFieldValue(true, null)).to.eq(true)
    });
  });
  describe("Check strings", function () {
    it("Check string", function () {
      expect(measurementsUtil._formatFieldValue("bob", null)).to.eq("\"bob\"")
    });
    it("Check string =", function () {
      expect(measurementsUtil._formatFieldValue("bob=", null)).to.eq("\"bob\=\"")
    });
    it("Check string ,", function () {
      expect(measurementsUtil._formatFieldValue("bob,", null)).to.eq("\"bob\,\"")
    });
    it("Check string \\", function () {
      expect(measurementsUtil._formatFieldValue("bob\\", null)).to.eq("\"bob\\\"")
    });
  });
  describe("Check numbers", function () {
    it("Check 1", function () {
      expect(measurementsUtil._formatFieldValue(1, null)).to.eq(1)
    });
  });
});

describe("fromCapability", function () {
  describe("Check nulls", function () {
    it("Check null 1", function () {
      expect(measurementsUtil.fromCapability(null, null)).eq(undefined)
    });
  });
  describe("Check capabilities", function () {
    it("Check capability 1", function () {
      const now = Date.now()
      const ret = measurementsUtil.fromCapability({
        id: '123-123',
        capId: '912-232',
        name: 'TheName ',
        zoneId: '456-234',
        zoneName: 'The Zone =, Name',
        value: 101,
        capability: 'Cap',
        ts: now
      }, null);
      expect(ret.measurement).to.eq('TheName_')
      expect(ret.tags.id).to.eq('123-123')
      expect(ret.tags.name).to.eq('TheName_')
      expect(ret.tags.zoneId).to.eq('456-234')
      expect(ret.tags.zone).to.eq('The_Zone_\\=\\,_Name')
      expect(ret.fields['912-232']).to.eq(101)
      !expect(ret.timestamp).is.not.null
    });
    it("Check capability 2", function () {
      const now = Date.now()
      const ret = measurementsUtil.fromCapability({
        id: '123-123',
        capId: '912-232',
        name: 'Some+=.,/\\ name ',
        zoneId: '456-234',
        zoneName: 'The Zone =, Name',
        value: 'String \\ = , "value"',
        capability: 'Cap',
        ts: now
      }, null);

      expect(ret.measurement).to.eq('Some+\\=.\\,/\\_name_')
      expect(ret.tags.id).to.eq('123-123')
      expect(ret.tags.name).to.eq('Some+\\=.\\,/\\_name_')
      expect(ret.tags.zoneId).to.eq('456-234')
      expect(ret.tags.zone).to.eq('The_Zone_\\=\\,_Name')
      expect(ret.fields['912-232']).to.eq('\"String \\ = , \\"value\\"\"')
      !expect(ret.timestamp).is.not.null
    });
  });
});

describe("fromValue", function () {
  describe("Check nulls", function () {
    it("Check null 1", function () {
      expect(measurementsUtil.fromValue(null, null, null)).eq(undefined)
    });
    it("Check null 2", function () {
      expect(measurementsUtil.fromValue('no', undefined, null)).eq(undefined)
      expect(measurementsUtil.fromValue('no', null, null)).eq(undefined)
    });
  });
  describe("Check objects", function () {
    it("Check object 1", function () {
      expect(measurementsUtil.fromValue('no', { some: 'value' }, null)).eq(undefined)
    });
  });
  describe("Check numbers", function () {
    it("Check number 1", function () {
      const ret = measurementsUtil.fromValue('no=bo co', 1, null);
      expect(ret.measurement).to.eq('no\\=bo_co')
      expect(ret.fields.value).to.eq(1)
      !expect(ret.timestamp).is.not.null
    });
    it("Check number 2", function () {
      const ret = measurementsUtil.fromValue('This , Is , It', 0, {
        measurementPrefix: 'ThePrefix!'
      });
      expect(ret.measurement).to.eq('ThePrefix!This_\\,_Is_\\,_It')
      expect(ret.fields.value).to.eq(0)
      !expect(ret.timestamp).is.not.null
    });
  });
  describe("Check strings", function () {
    it("Check string 1", function () {
      const ret = measurementsUtil.fromValue('Bo', ' ', {
      });
      expect(ret.measurement).to.eq('Bo')
      expect(ret.fields.value).to.eq('\" \"')
      !expect(ret.timestamp).is.not.null
    });
    it("Check string 2", function () {
      const ret = measurementsUtil.fromValue('X = Y , 1', 'Some"Value\\', {
        measurementPrefix: 'APrefix ='
      });
      expect(ret.measurement).to.eq('APrefix_\\=X_\\=_Y_\\,_1')
      expect(ret.fields.value).to.eq('\"Some\\"Value\\\"')
      !expect(ret.timestamp).is.not.null
    });
  });
});
