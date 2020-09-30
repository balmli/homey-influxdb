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
        organization: '',
        token: '',
        username: 'root',
        password: 'root',
        database: 'homey',
        measurement_mode: 'by_name',
        measurement_prefix: '',
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
