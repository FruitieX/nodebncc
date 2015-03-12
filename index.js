var fs = require('fs');
var config = require(process.env.HOME + '/.nodebncc/config.json');
var bncConfig = require(process.env.HOME + '/.nodebnc/config.json');
var _ = require('underscore');

var bncOptions = {
    tls: bncConfig.tls,
    key: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-key.pem'),
    cert: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-cert.pem'),
    ca: fs.readFileSync(process.env.HOME + '/.nodebnc/nodebnc-cert.pem'),
    rejectUnauthorized: bncConfig.rejectUnauthorized
};

var bncSocket = require('socket.io-client')((bncConfig.tls ? 'https://' : 'http://') + bncConfig.hostname + ':' + bncConfig.port, bncOptions);

var httpServer = require('http')
.createServer().listen(config.port, 'localhost');
var io = require('socket.io')(httpServer);

var ircChans = {};

var initChan = function(channel) {
    if(channel && !ircChans[channel]) {
        ircChans[channel] = {
            messages: [],
            nicks: []
        };
    }
};

var handleMessage = function(message) {
    console.log(message);
    initChan(message.channel);

    ircChans[message.channel].messages.push(message);
    io.sockets.in(message.channel).emit('message', message);
    console.log('got msg on ' + message.channel);
};

var handleNickList = function(channel, nickList) {
    console.log('got nick list for ' + channel + ':');
    console.log(nickList);
    initChan(channel);

    ircChans[channel].nicks = nickList;
    io.sockets.in(channel).emit('nickList', [channel, nickList]);
};

bncSocket.on('connect', function() {
    console.log('connected');
    bncSocket.emit('refreshState', {
        limit: config.backlog
    });
    bncSocket.on('messages', function(channels) {
        _.each(channels, function(channel) {
            _.each(channel.messages, function(message) {
                handleMessage(message);
            });
        });
    });
    bncSocket.on('nickLists', function(channels) {
        _.each(channels, function(nickList, channel) {
            handleNickList(channel, nickList);
        });
    });
    bncSocket.on('nickList', function(nickList) {
        handleNickList(channel, nickList);
    });
    bncSocket.on('message', handleMessage);
    bncSocket.on('bncErr', function(err) {
        console.log('error! ' + JSON.stringify(err, undefined, 4));
    });
});
