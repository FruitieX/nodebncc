var fs = require('fs');
var config = require(process.env.HOME + '/.nodebncc/config.json');
var bncConfig = require(process.env.HOME + '/.nodebnc/config.json');
var _ = require('underscore');
var winston = require('winston');
var log = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({
            level: config.logLevel,
            colorize: config.logColorize,
            handleExceptions: config.logExceptions,
            json: config.logJson
        })
    ]
});

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

var channels = [];
var state = {};
var nicks = {};

var initChan = function(chanId) {
    if(chanId && !state[chanId]) {
        state[chanId] = {
            messages: [],
            nicks: []
        };
    }
};

var handleMessage = function(message) {
    initChan(message.chanId);

    state[message.chanId].messages.push(message);
    io.sockets.in(message.chanId).emit('messages', [message]);
    log.debug('got msg on ' + message.chanId + ':', message);
};

var handleNickList = function(chanId, nickList) {
    log.debug('got nick list for ' + chanId + ':', nickList);
    initChan(chanId);

    state[chanId].nicks = nickList;
    io.sockets.in(chanId).emit('nickList', [chanId, nickList]);
};

bncSocket.on('connect', function() {
    log.info('connected');
    bncSocket.emit('getState', {
        backlogLimit: config.backlogLimit
    });

});

bncSocket.on('registered', function(info) {
    log.info('registered:', info);
});
bncSocket.on('messages', function(messages) {
    _.each(messages, function(message) {
        handleMessage(message);
    });
});
bncSocket.on('nickLists', function(chanIds) {
    _.each(chanIds, function(nickList, chanId) {
        handleNickList(chanId, nickList);
    });
});
bncSocket.on('nicks', function(_nicks) {
    log.debug('got my nicks:', _nicks);
    nicks = _nicks;
});
bncSocket.on('channels', function(_channels) {
    log.debug('got my channels:', _channels);
    channels = _channels;
});

// server has backlog for a certain channel, fetch it
bncSocket.on('backlogAvailable', function(chanId) {
    log.debug('backlog available for ' + chanId + ', fetching backlog');
    bncSocket.emit('getChannelState', {
        chanId: chanId,
        backlogLimit: config.backlogLimit
    });
});
bncSocket.on('bncErr', log.error);
bncSocket.on('bncWarn', log.warn);
bncSocket.on('channelEvent', function(ev) {
    log.debug('channelEvent', ev);
    io.sockets.emit('channelEvent', ev);
});
bncSocket.on('globalEvent', function(ev) {
    log.debug('globalEvent', ev);
    io.sockets.emit('globalEvent', ev);
});

var chGetSv = function(chanId) { return chanId.split(':')[0]; };
var chGetCh = function(chanId) {
    var ws = chanId.indexOf(' ');
    ws = ws !== -1 ? ws : chanId.length;
    return chanId.substr(0, ws).split(':')[1];
};

io.on('connection', function(socket) {
    var curRoom = null;

    socket.on('message', function(message) {
        bncSocket.emit('message', message);
    });
    socket.on('getChannelState', function(chanId) {
        io.sockets.in(chanId).emit('messages', state[chanId].messages);
    });
    socket.on('room', function(room) {
        log.verbose('client subscribed to ' + room);
        if(curRoom)
            socket.leave(curRoom);
        socket.join(room);
        socket.emit('nick', nicks[chGetSv(room)]);
        curRoom = room;
    });
});
