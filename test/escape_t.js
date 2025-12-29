const chai = require("chai");
const expect = chai.expect;

const escape = require('../lib/escape');

describe("escape.measurement", function () {
  describe("Basic escaping", function () {
    it("should escape commas in measurement names", function () {
      expect(escape.measurement('temp,humidity')).to.eq('temp\\,humidity')
    });

    it("should escape spaces in measurement names", function () {
      expect(escape.measurement('my measurement')).to.eq('my\\ measurement')
    });

    it("should escape both commas and spaces", function () {
      expect(escape.measurement('temp, humidity sensor')).to.eq('temp\\,\\ humidity\\ sensor')
    });

    it("should not alter measurement names without special characters", function () {
      expect(escape.measurement('temperature')).to.eq('temperature')
    });
  });

  describe("Edge cases", function () {
    it("should handle empty string", function () {
      expect(escape.measurement('')).to.eq('')
    });

    it("should handle multiple consecutive spaces", function () {
      expect(escape.measurement('temp  sensor')).to.eq('temp\\ \\ sensor')
    });

    it("should handle multiple consecutive commas", function () {
      expect(escape.measurement('a,,b')).to.eq('a\\,\\,b')
    });

    it("should handle measurement starting with special char", function () {
      expect(escape.measurement(',temp')).to.eq('\\,temp')
    });

    it("should handle measurement ending with special char", function () {
      expect(escape.measurement('temp,')).to.eq('temp\\,')
    });
  });
});

describe("escape.tag", function () {
  describe("Basic escaping", function () {
    it("should escape commas in tag values", function () {
      expect(escape.tag('zone,name')).to.eq('zone\\,name')
    });

    it("should escape equals signs in tag values", function () {
      expect(escape.tag('key=value')).to.eq('key\\=value')
    });

    it("should escape spaces in tag values", function () {
      expect(escape.tag('living room')).to.eq('living\\ room')
    });

    it("should escape all special characters together", function () {
      expect(escape.tag('zone = living room, floor 1')).to.eq('zone\\ \\=\\ living\\ room\\,\\ floor\\ 1')
    });

    it("should not alter tag values without special characters", function () {
      expect(escape.tag('bedroom')).to.eq('bedroom')
    });
  });

  describe("Edge cases", function () {
    it("should handle empty string", function () {
      expect(escape.tag('')).to.eq('')
    });

    it("should handle string with only special characters", function () {
      expect(escape.tag(' = ,')).to.eq('\\ \\=\\ \\,')
    });

    it("should handle multiple consecutive equals signs", function () {
      expect(escape.tag('a==b')).to.eq('a\\=\\=b')
    });
  });
});

describe("escape.quoted", function () {
  describe("Basic escaping", function () {
    it("should wrap value in double quotes", function () {
      expect(escape.quoted('mydb')).to.eq('"mydb"')
    });

    it("should escape double quotes in value", function () {
      expect(escape.quoted('my"db')).to.eq('"my\\"db"')
    });

    it("should escape backslashes in value", function () {
      expect(escape.quoted('my\\db')).to.eq('"my\\\\db"')
    });

    it("should escape both quotes and backslashes", function () {
      expect(escape.quoted('my\\"db"')).to.eq('"my\\\\\\"db\\""')
    });
  });

  describe("Edge cases", function () {
    it("should handle empty string", function () {
      expect(escape.quoted('')).to.eq('""')
    });

    it("should handle string with multiple quotes", function () {
      expect(escape.quoted('a"b"c"')).to.eq('"a\\"b\\"c\\""')
    });

    it("should handle string with multiple backslashes", function () {
      expect(escape.quoted('a\\\\b')).to.eq('"a\\\\\\\\b"')
    });
  });
});

describe("escape.stringLit", function () {
  describe("Basic escaping", function () {
    it("should wrap value in single quotes", function () {
      expect(escape.stringLit('hello')).to.eq("'hello'")
    });

    it("should escape single quotes in value", function () {
      expect(escape.stringLit("it's")).to.eq("'it\\'s'")
    });

    it("should handle multiple single quotes", function () {
      expect(escape.stringLit("it's'fun")).to.eq("'it\\'s\\'fun'")
    });
  });

  describe("Edge cases", function () {
    it("should handle empty string", function () {
      expect(escape.stringLit('')).to.eq("''")
    });

    it("should handle string with consecutive quotes", function () {
      expect(escape.stringLit("''")).to.eq("'\\'\\''"  )
    });
  });
});

describe("Escaper class integration", function () {
  describe("Real-world scenarios", function () {
    it("should properly escape InfluxDB measurement with zone name", function () {
      expect(escape.measurement('Living Room, Floor 1')).to.eq('Living\\ Room\\,\\ Floor\\ 1')
    });

    it("should properly escape InfluxDB tag with device name", function () {
      expect(escape.tag('Device = Sensor 1, Zone 2')).to.eq('Device\\ \\=\\ Sensor\\ 1\\,\\ Zone\\ 2')
    });

    it("should properly escape database name with special characters", function () {
      expect(escape.quoted('homey"metrics\\db')).to.eq('"homey\\"metrics\\\\db"')
    });
  });

  describe("Unicode and special cases", function () {
    it("should handle unicode characters in measurements", function () {
      expect(escape.measurement('temp °C')).to.eq('temp\\ °C')
    });

    it("should handle unicode characters in tags", function () {
      expect(escape.tag('zone café')).to.eq('zone\\ café')
    });

    it("should handle non-breaking spaces (U+00A0)", function () {
      // Non-breaking space should be treated differently by measurementsUtil._formatKey
      // but escape should handle it as regular character
      expect(escape.measurement('temp\u00A0sensor')).to.eq('temp\u00A0sensor')
    });
  });
});
