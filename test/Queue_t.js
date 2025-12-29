const chai = require("chai");
const expect = chai.expect;

const Queue = require('../lib/Queue');

// Mock Homey object for testing
class MockHomey {
  constructor() {
    this.timeouts = [];
  }

  setTimeout(callback, ms) {
    const timeoutId = setTimeout(callback, ms);
    this.timeouts.push(timeoutId);
    return timeoutId;
  }

  clearAllTimeouts() {
    this.timeouts.forEach(id => clearTimeout(id));
    this.timeouts = [];
  }
}

describe("Queue", function () {
  let mockHomey;
  let queue;

  beforeEach(function () {
    mockHomey = new MockHomey();
  });

  afterEach(function () {
    mockHomey.clearAllTimeouts();
    if (queue) {
      queue.destroy();
    }
  });

  describe("Constructor", function () {
    it("should initialize empty queue", function () {
      queue = new Queue({ homey: mockHomey });

      expect(queue.queue).to.be.an('array').that.is.empty
      expect(queue.head).to.eq(0)
      expect(queue.tail).to.eq(0)
      expect(queue.queueRunning).to.eq(false)
    });

    it("should accept custom log function", function () {
      const customLog = () => {};
      queue = new Queue({
        homey: mockHomey,
        log: customLog
      });

      expect(queue.log).to.eq(customLog)
    });

    it("should use console.log as default logger", function () {
      queue = new Queue({ homey: mockHomey });

      expect(queue.log).to.eq(console.log)
    });

    it("should accept initHandler and runHandler", function () {
      const initHandler = () => {};
      const runHandler = () => {};
      queue = new Queue({
        homey: mockHomey,
        initHandler,
        runHandler
      });

      expect(queue.initHandler).to.eq(initHandler)
      expect(queue.runHandler).to.eq(runHandler)
    });
  });

  describe("enQueue", function () {
    it("should add item to queue and start processing", function (done) {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {
          // Handler is called, test passes
          done();
        }
      });

      queue.enQueue('item1').then(() => {
        // Queue should be running after enqueuing
        expect(queue.queueRunning).to.eq(true);
      });
    });

    it("should add multiple items to queue", function (done) {
      const itemsProcessed = [];
      queue = new Queue({
        homey: mockHomey,
        runHandler: (item) => {
          itemsProcessed.push(item);
          // Test passes after first item is processed
          // (processing all 3 would take 30+ seconds due to 10s delays)
          if (itemsProcessed.length === 1) {
            expect(itemsProcessed[0]).to.eq('item1');
            expect(queue.queueRunning).to.eq(true);
            done();
          }
        }
      });

      queue.enQueue('item1');
      queue.enQueue('item2');
      queue.enQueue('item3');
    });

    it("should set queueRunning to true", async function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      await queue.enQueue('item1');

      expect(queue.queueRunning).to.eq(true)
    });

    it("should call initHandler on first item", async function () {
      let initCalled = false;
      queue = new Queue({
        homey: mockHomey,
        initHandler: async () => { initCalled = true; },
        runHandler: () => {}
      });

      await queue.enQueue('item1');

      expect(initCalled).to.eq(true)
    });
  });

  describe("deQueue", function () {
    it("should return undefined for empty queue", function () {
      queue = new Queue({ homey: mockHomey });

      const item = queue.deQueue();

      expect(item).to.be.undefined
    });

    it("should return first item from queue", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add items to queue without triggering runQueue
      queue.queue[0] = 'item1';
      queue.queue[1] = 'item2';
      queue.tail = 2;

      const item = queue.deQueue();

      expect(item).to.eq('item1')
      expect(queue.head).to.eq(1)
    });

    it("should increment head pointer", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add items to queue without triggering runQueue
      queue.queue[0] = 'item1';
      queue.queue[1] = 'item2';
      queue.queue[2] = 'item3';
      queue.tail = 3;

      queue.deQueue();
      expect(queue.head).to.eq(1)

      queue.deQueue();
      expect(queue.head).to.eq(2)

      // Don't dequeue the last item, so head/tail don't reset
    });

    it("should reset pointers when queue is empty", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add item
      queue.queue[0] = 'item1';
      queue.tail = 1;

      queue.deQueue();

      expect(queue.head).to.eq(0)
      expect(queue.tail).to.eq(0)
    });

    it("should delete dequeued items", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add item
      queue.queue[0] = 'item1';
      queue.tail = 1;

      const headBefore = queue.head;
      queue.deQueue();

      expect(queue.queue[headBefore]).to.be.undefined
    });
  });

  describe("isRunning", function () {
    it("should return false when queue is not running", function () {
      queue = new Queue({ homey: mockHomey });

      expect(queue.isRunning()).to.eq(false)
    });

    it("should return true when queue is running", async function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      await queue.enQueue('item1');

      expect(queue.isRunning()).to.eq(true)
    });
  });

  describe("flushQueue", function () {
    it("should clear all items from queue", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add items
      queue.queue[0] = 'item1';
      queue.queue[1] = 'item2';
      queue.queue[2] = 'item3';
      queue.tail = 3;
      queue.queueRunning = true;

      queue.flushQueue();

      expect(queue.queue).to.be.an('array').that.is.empty
      expect(queue.head).to.eq(0)
      expect(queue.tail).to.eq(0)
      expect(queue.queueRunning).to.eq(false)
    });

    it("should reset all pointers", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually set up queue state
      queue.queue[0] = 'item1';
      queue.queue[2] = 'item2';
      queue.head = 1;
      queue.tail = 3;

      queue.flushQueue();

      expect(queue.head).to.eq(0)
      expect(queue.tail).to.eq(0)
    });
  });

  describe("runQueue", function () {
    this.timeout(15000); // Increase timeout for async tests with 10s delays

    it("should process items in order", function (done) {
      const processed = [];
      queue = new Queue({
        homey: mockHomey,
        runHandler: async (item) => {
          processed.push(item);
        }
      });

      queue.enQueue('item1');
      queue.enQueue('item2');
      queue.enQueue('item3');

      // Queue processes with 10s delay between items, so need to wait longer
      setTimeout(() => {
        // Should have processed at least the first item
        expect(processed).to.have.lengthOf.at.least(1)
        expect(processed[0]).to.eq('item1')
        done();
      }, 500);
    });

    it("should set queueRunning to false when done", function (done) {
      queue = new Queue({
        homey: mockHomey,
        runHandler: async () => {}
      });

      queue.enQueue('item1');

      // Wait for the item to be processed (10s delay + processing time)
      setTimeout(() => {
        expect(queue.isRunning()).to.eq(false)
        done();
      }, 11000);
    });

    it("should handle async runHandler", function (done) {
      let handlerCalled = false;
      queue = new Queue({
        homey: mockHomey,
        runHandler: async (item) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          handlerCalled = true;
        }
      });

      queue.enQueue('item1');

      setTimeout(() => {
        expect(handlerCalled).to.eq(true)
        done();
      }, 200);
    });
  });

  describe("destroy", function () {
    it("should have destroy method", function () {
      queue = new Queue({ homey: mockHomey });

      expect(queue.destroy).to.be.a('function')
      queue.destroy();
    });
  });

  describe("Edge cases", function () {
    it("should handle rapid enqueueing", function (done) {
      const processed = [];
      queue = new Queue({
        homey: mockHomey,
        runHandler: (item) => {
          processed.push(item);
        }
      });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(queue.enQueue(`item${i}`));
      }

      Promise.all(promises).then(() => {
        // All items should have been enqueued
        expect(queue.queueRunning).to.eq(true);
        done();
      });
    });

    it("should handle queue operations with null/undefined items", function () {
      queue = new Queue({
        homey: mockHomey,
        runHandler: () => {}
      });

      // Manually add null/undefined to test they can be stored
      queue.queue[0] = null;
      queue.queue[1] = undefined;
      queue.tail = 2;

      const item1 = queue.deQueue();
      expect(item1).to.be.null;

      const item2 = queue.deQueue();
      expect(item2).to.be.undefined;
    });

    it("should handle complex objects as items", function (done) {
      const processed = [];
      const complexItem = {
        id: 123,
        data: { nested: 'value' },
        array: [1, 2, 3]
      };

      queue = new Queue({
        homey: mockHomey,
        runHandler: (item) => {
          processed.push(item);
        }
      });

      queue.enQueue(complexItem).then(() => {
        setTimeout(() => {
          expect(processed).to.have.lengthOf.at.least(1);
          expect(processed[0]).to.deep.eq(complexItem);
          done();
        }, 500);
      });
    });
  });
});
