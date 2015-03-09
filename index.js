var fs = require('fs');
var config = require(process.env.HOME + '/.nodebnc/config.json');

var options = {
    tls: config.tls,
    key: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-key.pem'),
    cert: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-cert.pem'),
    ca: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-cert.pem'),
    rejectUnauthorized: config.rejectUnauthorized
};

var socket = require('socket.io-client')((config.tls ? 'https://' : 'http://') + config.hostname + ':' + config.port, options);

socket.on('connect', function() {
    console.log('connected');
    socket.emit('backlog', {
        channel: '#fruittest',
        server: 'qnet',
        limit: config.backlog
    });
    socket.on('backlog', function(messages) {
        console.log(messages);
    });
    socket.on('message', function(message) {
        console.log(message);
    });
    socket.on('error', function(err) {
        console.log('error! ' + err);
    });
});
