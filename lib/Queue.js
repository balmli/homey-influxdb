'use strict';

const { delay } = require('./util');

module.exports = class Queue {

    constructor(options) {
        options = options || {};
        this.log = options.log || console.log;
        this.initHandler = options.initHandler;
        this.runHandler = options.runHandler;
        this.queue = [];
        this.head = 0;
        this.tail = 0;
        this.queueRunning = false;
    }

    isRunning() {
        return this.queueRunning;
    }

    async enQueue(item) {
        this.queue[this.tail] = item;
        this.tail += 1;
        if (!this.queueRunning) {
            this.queueRunning = true;
            if (this.initHandler) {
                await this.initHandler();
            }
            this.runQueue();
        }
    }

    deQueue() {
        const size = this.tail - this.head;
        if (size <= 0) {
            return undefined;
        }
        const item = this.queue[this.head];
        delete this.queue[this.head];
        this.head += 1;
        // Reset the counter
        if (this.head === this.tail) {
            this.head = 0;
            this.tail = 0;
        }
        return item;
    }

    async runQueue() {
        this.queueRunning = true;
        const item = this.deQueue();
        if (item) {
            await this.runHandler(item);
            global.gc();
            await delay(10000);
            this.runQueue();
        } else {
            this.queueRunning = false;
        }
    }

    flushQueue() {
        this.queue = [];
        this.head = 0;
        this.tail = 0;
        this.queueRunning = false;
    }

    destroy() {
    }

};
