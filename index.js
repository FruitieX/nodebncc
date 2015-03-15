#!/usr/bin/env node
var spawn = require('child_process').spawn;
var vimrl = require('vimrl');
var crypto = require('crypto');
var _ = require('underscore');
var config = require(process.env.HOME + "/.nodebncc/config.json");
var socket = require('socket.io-client')('http://' + config.hostname + ':' + config.port);

var nicks = {};
var nick;

var chanNumber, server, chan, hideJoinsParts;

var updateCompletions = function() {
    var nicksArray = Object.keys(nicks);
    for(var i = 0; i < nicksArray.length; i++) {
        if(nicksArray[i][0] === '@' || nicksArray[i][0] === '+') {
            nicksArray[i] = nicksArray[i].substr(1);
        }
    }

    readline.setCompletions(nicksArray);
};

var findChannel = function(searchString) {
    // exact match for server:chan format
    if(searchString.indexOf(':') !== -1) {
        // first try looking for a match in config
        for(var i = 0; i < config.favoriteChannels.length; i++) {
            if(searchString === (config.favoriteChannels[i].server + ':' +
                                config.favoriteChannels[i].chan)) {
                return {
                    chanNumber: i,
                    server: config.favoriteChannels[i].server,
                    chan: config.favoriteChannels[i].chan
                }
            }
        }
        // otherwise assume the user knows better, use provided names
        return {
            server: searchString.split(':')[0],
            chan: searchString.split(':')[1]
        }
    }

    // search for substring in shortName
    for(var i = 0; i < config.favoriteChannels.length; i++) {
        if(config.favoriteChannels[i].shortName.match(new RegExp(searchString))) {
            return {
                chanNumber: i,
                server: config.favoriteChannels[i].server,
                chan: config.favoriteChannels[i].chan
            }
        }
    }
};

socket.on('connect', function() {
    socket.emit('room', process.argv[2]);
    redraw();
});
socket.on('disconnect', function() {
    printLine({
        type: 'message',
        nick: '!',
        text: 'lost connection to jsiid, reconnecting...'
    });
    readline.redraw();
});
socket.on('messages', function(messages) {
    _.each(messages, function(message) {
        printLine({
            type: 'message',
            nick: message.nick,
            text: message.text
        });
    });
    readline.redraw();
});
socket.on('nick', function(_nick) {
    nick = _nick;
});
/* find server & channels names from first argument */
// no args: pick first favorite chan
/*
if(!process.argv[2]) {
    chanNumber = 0;
    server = config.favoriteChannels[0].server;
    chan = config.favoriteChannels[0].chan;
    hideJoinsParts = config.favoriteChannels[0].hideJoinsParts;
// by channel number
} else if (!isNaN(process.argv[2])) {
    chanNumber = parseInt(process.argv[2]);
    server = config.favoriteChannels[chanNumber].server;
    chan = config.favoriteChannels[chanNumber].chan;
    hideJoinsParts = config.favoriteChannels[chanNumber].hideJoinsParts;
// else search
} else {
    var results = findChannel(process.argv[2]);

    if(results) {
        server = results.server;
        chan = results.chan;
        chanNumber = results.chanNumber;
        hideJoinsParts = results.hideJoinsParts;
    } else {
        console.log("No results with given search terms!");
        process.exit(1);
    }
}
*/

// for prompt
var getChanName = function(server, chan, chanNumber) {
    if(!isNaN(chanNumber)) {
        return config.favoriteChannels[chanNumber].shortName;
    } else {
        return server + ':' + chan;
    }
};

var sendMsg = function(msg) {
    socket.write(JSON.stringify(msg) + '\n');
};

// reset cursor to lower left corner
var cursorReset = function() {
    process.stdout.write('\033[' + process.stdout.rows + ';0f');
};
// clear line where cursor currently is
var clearLine = function() {
    process.stdout.write('\033[K');
};

// prints line to lower left corner of terminal
var printLine = function(message) {
    var i;

    var hilight = false;
    var action = false;
    var separator = config.ui.nickSeparator;

    // move cursor to lower left
    cursorReset();
    // clear current line
    clearLine();

    var nickColor = 0;
    var textColor = config.textColor;

    var nick = message.nick

    // support irc ACTION messages
    if(message.type === 'action') {
        message.text = nick + ' ' + message.text;
        nick = '*';
        nickColor = config.ui.actionColor;
        textColor = config.ui.actionColor;
    } else if (message.type === 'join') {
        if(hideJoinsParts)
            return;
        separator = '';
        message.text = config.joinMsg;
        textColor = config.ui.joinColor;
    } else if (message.type === 'part') {
        if(hideJoinsParts)
            return;
        separator = '';
        message.text = config.partMsg;
        textColor = config.ui.partColor;
    } else if (message.type === 'nicklist') {
        nick = '*';
        message.text = 'Names: ' + msg.nicks.join(', ');
    } else if(message.text.match(config.hilight_re)) {
        textColor = config.ui.hilightColor;
    }

    if (nick) {
        if(nick === nick) {
            nickColor = config.ui.myNickColor;
            textColor = config.ui.myNickColor;
        } else {
            // nick color, avoids dark colors
            var md5sum = crypto.createHash('md5');
            md5sum.update(nick, 'utf8');
            nickColor = parseInt(md5sum.digest('hex'), 16) % 255;
            switch(nickColor) {
                case 18: case 22: case 23: case 24:
                    nickColor += 3; break;
                case 52: case 53: case 54: case 55: case 56: case 57: case 88: case 89:
                    nickColor += 6; break;
                case 232: case 233: case 234: case 235: case 236: case 237: case 238: case 239:
                    nickColor += 8; break;
                case 0: case 8: case 19: case 22:
                    nickColor++; break;
            }
        }
    }

    // limit nicklen
    nick = nick.substr(0, config.ui.maxNickLen);
    // align nicks and print
    process.stdout.write(Array(config.ui.maxNickLen - nick.length + 1).join(' '));
    process.stdout.write('\033[38;5;' + nickColor + 'm' + nick + // set nick color + nick
                         '\033[38;5;' + config.ui.separatorColor + 'm' + separator + // set separator color + separator
                         '\033[000m'); // reset colors

    var availWidth = process.stdout.columns - config.ui.maxNickLen - separator.length;

    var wrappedChars = 0;
    i = 0;

    // terminal too small? don't print anything
    if(availWidth <= 5)
        return;

    while(i * availWidth - wrappedChars < message.text.length) {
        var start = i * availWidth - wrappedChars;
        var curLine = message.text.substr(start, availWidth);
        // remove leading space on next line
        curLine.replace(/^\s+/, '');
        // line wrap at word boundary only if there is whitespace on this line
        if(start + availWidth < message.text.length && curLine.lastIndexOf(' ') !== -1) {
            curLine = curLine.slice(0, curLine.lastIndexOf(' '));
            // remove whitespace
            wrappedChars--;
        }

        wrappedChars += availWidth - curLine.length;

        // empty space on line wrap
        if (i > 0)
            process.stdout.write(Array(process.stdout.columns - availWidth + 1).join(' '));

        process.stdout.write('\033[38;5;' + textColor + 'm' + curLine + // set text color + text
                             '\033[000m' + '\n'); // reset colors + newline
        i++;
    }
};

// redraw screen
var redraw = function() {
    process.stdout.write('\u001B[2J\u001B[0;0f'); // clear terminal
    socket.emit('getChannelState', process.argv[2]); // FIXME
    readline.redraw();
};

process.stdin.setRawMode(true);

// handle keyboard events
process.stdin.on('readable', function() {
    var input;
    while (null !== (input = process.stdin.read())) {
        var keyHex = input.toString('hex');

        // ctrl + c, ctrl + q = quit
        if(keyHex === '03' || keyHex === '11') {
            process.stdout.write('\u001B[2J\u001B[0;0f'); // clear terminal
            process.exit(0);
        }

        // previous channel (alt + h) || (ctrl + p)
        else if(keyHex === '1b68' || keyHex === '10') {
            if(isNaN(chanNumber)) chanNumber = 0;
            else chanNumber--;

            if(chanNumber < 0)
                chanNumber = config.favoriteChannels.length - 1;

            server = config.favoriteChannels[chanNumber].server;
            chan = config.favoriteChannels[chanNumber].chan;
            hideJoinsParts = config.favoriteChannels[chanNumber].hideJoinsParts;
            nicks = {};

            readline.changePrompt(config.getPrompt(
                        getChanName(server, chan, chanNumber), chanNumber));
            redraw();
        }

        // next channel (alt + l) || (ctrl + n)
        else if(keyHex === '1b6c' || keyHex === '0e') {
            if(isNaN(chanNumber)) chanNumber = 0;
            else chanNumber++;

            if(chanNumber >= config.favoriteChannels.length)
                chanNumber = 0;

            server = config.favoriteChannels[chanNumber].server;
            chan = config.favoriteChannels[chanNumber].chan;
            hideJoinsParts = config.favoriteChannels[chanNumber].hideJoinsParts;
            nicks = {};

            readline.changePrompt(config.getPrompt(
                        getChanName(server, chan, chanNumber), chanNumber));
            redraw();
        }

        // jump to this channel (alt + 1-9)
        else if(keyHex.substring(0, 3) === '1b3' && !isNaN(keyHex[3])) {
            chanNumber = parseInt(keyHex.substring(3));

            server = config.favoriteChannels[chanNumber].server;
            chan = config.favoriteChannels[chanNumber].chan;
            hideJoinsParts = config.favoriteChannels[chanNumber].hideJoinsParts;
            nicks = {};

            readline.changePrompt(config.getPrompt(
                        getChanName(server, chan, chanNumber), chanNumber));
            redraw();
        }

        // else let vimrl handle
        else {
            readline.handleInput(input);
        }

        // DEBUG: uncomment this line to find the keycodes
        //console.log(keyHex.toString('hex'));
    }
});

var handleMessage = function(message) {
    // store nicklist
    if(message.type === 'nicklist') {
        for(var j = 0; j < message.nicks.length; j++) {
            nicks[message.nicks[j]] = true;
        }
        updateCompletions();
    } else if (message.type === 'searchResults') {
        if(message.type === 'urllist') {
            printLine({
                nick: '***',
                text: 'URL ' + message.id + ':' + message.text
            });
            readline.redraw();
        } else if(message.type === 'openurl') {
            var child = spawn('firefox', [message.text], {
                detached: true,
                stdio: [ 'ignore', 'ignore' , 'ignore' ]
            });
            child.unref();
            printLine({
                nick: '***',
                text: 'URL opened:' + message.text
            });
            readline.redraw();
        }
    } else {
        printLine(message);
        readline.redraw();

        if(message.type === 'join') {
            nicks[message.nick] = true;
            updateCompletions();
        } else if(message.type === 'part') {
            delete(nicks[message.nick]);
            updateCompletions();
        }
    }
};


// handle terminal resize
process.stdout.on('resize', function() {
    redraw();
});

var getPrompt = function(chanName, chanNumber) {
    var i;

    var chanNumberString = '';
    if(chanNumber === 0 || chanNumber) {
        chanNumberString = chanNumber + ' ';
    }

    // my prompt looks like: "42 #channame > here goes text"
    var normalPrompt = chanNumberString + chanName + ' > ';
    var insertPrompt = chanNumberString + chanName + ' > ';

    // config.*PromptColors are arrays containing for each character in
    // config.*Prompt which ANSI color code should be printed before that
    // character. This hack was needed because we may need to split the
    // prompt if a chat message is longer than our terminal is wide.
    //
    // In my case, i want the '>' character to change colors, depending on
    // which vi-mode we are in, here's how to do that:

    var normalPromptColors = [];
    var insertPromptColors = [];

    // fill arrays with empty strings
    for (i = 0; i < normalPrompt.length; i++) {
        normalPromptColors[i] = '';
    }
    for (i = 0; i < insertPrompt.length; i++) {
        insertPromptColors[i] = '';
    }

    // 2nd last char should be grey
    normalPromptColors[normalPrompt.length - 2] = '\033[38;5;242m';
    // 2nd last char should be white
    insertPromptColors[insertPrompt.length - 2] = '\033[38;5;252m';

    return {
        normalPrompt: normalPrompt,
        normalPromptColors: normalPromptColors,
        insertPrompt: insertPrompt,
        insertPromptColors: insertPromptColors
    };
};

var prompt = getPrompt(process.argv[2], 42);

// parse some select commands from input line
readline = vimrl(prompt, function(line) {
    if(line === '/bl' || line.substring(0, 4) === '/bl ') {
        // request backlog
        sendMsg({
            type: "command",
            server: server,
            message: "PRIVMSG *backlog " + chan + ' ' + line.substring(4)
        });
    } else if(line.substring(0, 4) === '/me ') {
        // irc ACTION message
        sendMsg({
            type: "action",
            message: line.substring(4),
            chan: chan,
            server: server,
            nick: config.myNick
        });
    } else if(line === '/names') {
        // request nick list
        printLine({
            type: 'nicklist',
            nicks: Object.keys(nicks)
        });
    } else if (line === '/ul') {
        // list urls in buffer
        sendMsg({
            type: "search",
            type: "urllist",
            skip: (parseInt(line.substring(3)) | 0),
            chan: chan,
            server: server,
            searchRE: config.urlRE_s,
            firstMatchOnly: false,
            onlyMatching: true
        });
    } else if (line === '/u' || line.substring(0, 3) === '/u ') {
        // open url
        sendMsg({
            type: "search",
            type: "openurl",
            skip: (parseInt(line.substring(3)) | 0),
            chan: chan,
            server: server,
            searchRE: config.urlRE_s,
            firstMatchOnly: true,
            onlyMatching: true
        });
    } else if(line.substring(0, 5) === '/say ') {
        // say rest of line
        sendMsg({
            type: "message",
            message: line.substring(5),
            chan: chan,
            server: server,
            nick: config.myNick
        });
    } else if(line[0] === '/') {
        // irc commands
        sendMsg({
            type: "command",
            server: server,
            message: line.substring(1)
        });
    } else {
        // send input line to jsiid
        sendMsg({
            type: 'message',
            chan: chan,
            server: server,
            message: line,
            nick: config.myNick
        });
    }
});

readline.gotoInsertMode();
