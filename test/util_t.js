const chai = require("chai");
const expect = chai.expect;

const { delay } = require('../lib/util');

// Mock Homey object for testing
class MockHomey {
  setTimeout(callback, ms) {
    return setTimeout(callback, ms);
  }
}

describe("util", function () {
  let mockHomey;

  beforeEach(function () {
    mockHomey = new MockHomey();
  });

  describe("delay", function () {
    it("should return a promise", function () {
      const result = delay(mockHomey, 10);

      expect(result).to.be.instanceof(Promise)
    });

    it("should resolve after specified milliseconds", async function () {
      const start = Date.now();
      await delay(mockHomey, 100);
      const elapsed = Date.now() - start;

      // Allow some tolerance for timing (within 50ms)
      expect(elapsed).to.be.at.least(100)
      expect(elapsed).to.be.below(150)
    });

    it("should work with 0ms delay", async function () {
      const start = Date.now();
      await delay(mockHomey, 0);
      const elapsed = Date.now() - start;

      // Should resolve almost immediately
      expect(elapsed).to.be.below(50)
    });

    it("should allow chaining with async/await", async function () {
      const order = [];

      order.push(1);
      await delay(mockHomey, 10);
      order.push(2);
      await delay(mockHomey, 10);
      order.push(3);

      expect(order).to.deep.eq([1, 2, 3])
    });

    it("should work with Promise.all for parallel delays", async function () {
      const start = Date.now();

      await Promise.all([
        delay(mockHomey, 50),
        delay(mockHomey, 50),
        delay(mockHomey, 50)
      ]);

      const elapsed = Date.now() - start;

      // All should run in parallel, so total time should be ~50ms, not 150ms
      expect(elapsed).to.be.at.least(50)
      expect(elapsed).to.be.below(100)
    });

    it("should use homey's setTimeout method", function (done) {
      let setTimeoutCalled = false;
      const customHomey = {
        setTimeout: (callback, ms) => {
          setTimeoutCalled = true;
          return setTimeout(callback, ms);
        }
      };

      delay(customHomey, 10).then(() => {
        expect(setTimeoutCalled).to.eq(true)
        done();
      });
    });

    it("should handle large delay values", async function () {
      // Just verify it doesn't throw, but don't actually wait
      const promise = delay(mockHomey, 10000);
      expect(promise).to.be.instanceof(Promise)
    });
  });

  describe("delay edge cases", function () {
    it("should handle negative delay as 0", async function () {
      const start = Date.now();
      await delay(mockHomey, -100);
      const elapsed = Date.now() - start;

      // Node.js treats negative delays as 0
      expect(elapsed).to.be.below(50)
    });

    it("should handle very small delays", async function () {
      const start = Date.now();
      await delay(mockHomey, 1);
      const elapsed = Date.now() - start;

      expect(elapsed).to.be.at.least(0)
      expect(elapsed).to.be.below(50)
    });

    it("should resolve in sequential order when called sequentially", async function () {
      const results = [];

      await delay(mockHomey, 20).then(() => results.push('first'));
      await delay(mockHomey, 10).then(() => results.push('second'));
      await delay(mockHomey, 5).then(() => results.push('third'));

      expect(results).to.deep.eq(['first', 'second', 'third'])
    });

    it("should resolve in duration order when called in parallel", function (done) {
      const results = [];

      delay(mockHomey, 30).then(() => results.push('slow'));
      delay(mockHomey, 10).then(() => results.push('fast'));
      delay(mockHomey, 20).then(() => results.push('medium'));

      setTimeout(() => {
        expect(results).to.deep.eq(['fast', 'medium', 'slow'])
        done();
      }, 50);
    });
  });
});
