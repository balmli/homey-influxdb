/* global Homey */
void function () {
    if (!Homey.isMock) return;

    let running = true;
    let counter = 10;

    setTimeout(() => {
        running = true;
    }, 2000);

    Homey.setSettings({
        host: '',
        protocol: 'http',
        port: '8086',
        username: 'root',
        password: 'root',
        database: 'homey'
    });

    Homey.addRoutes([
        {
            method: 'GET',
            path: '/status',
            fn: function (args, cb) {
                cb(null, {
                    running: running,
                    influxDb: {
                        url: 'http://192.168.1.10:8086',
                        database: 'homey',
                        connected: true,
                        measurements: counter++
                    }
                });
            }
        }
    ]);

}();
