'use strict';

var path = require('path');
var express = require('express');
var http = require('http');
var socketio = require('socket.io');
var sampServer = require('samp-server');
var pawnCompiler = require('samp-server/lib/pawn-compiler');
var AMX = require('./amx');
var fs = require('fs');

var app = express();
var server = http.createServer(app);
var io = socketio.listen(server);

var FORBIDDEN_NATIVES = [
  'fopen', 'fclose', 'ftemp', 'fremove', 'fwrite', 'fread', 'fputchar',
  'fgetchar', 'fblockwrite', 'fblockread', 'fseek', 'flength', 'fexist',
  'fmatch', 'sendstring', 'sendpacket', 'listenport', 'SendRconCommand'
];

app.start = app.listen = function() {
  return server.listen.apply(server, arguments);
};

var serverBinary, activeServers = 0;

if (process.platform === 'win32' || process.platform === 'darwin') {
  serverBinary = 'samp-server.exe';
} else {
  serverBinary = 'samp03svr';
}

serverBinary = path.resolve(__dirname, '..', 'bin', 'server', serverBinary);

app.use(express.static('public'));

io.sockets.on('connection', function(socket) {
  socket.on('run-code', function(info) {
    if (activeServers > 2) {
      socket.emit('compiler-output', {
        runId: info.runId,
        data: 'Error: Too many active servers. Please wait.'
      });

      return;
    }

    pawnCompiler.compile(new Buffer('' + info.code), {
      debugLevel: 2,
      requireSemicolons: true,
      requireParentheses: true,
      tabsize: 4
    }, function(err, errors, outputFile) {
      if (errors && errors.length) {
        errors.forEach(function(error) {
          error.file = 'input';
        });

        socket.emit('compiler-output', {
          runId: info.runId,
          data: errors.join('\n') + '\n'
        });
      }

      if (err) {
        socket.emit('compiler-output', {
          runId: info.runId,
          data: 'Error: ' + err.message +
                ' (' + (err.code || 'no error code') + ')\n'
        });

        return;
      }

      // TODO: async
      var amx = new AMX(fs.readFileSync(outputFile)), forbidden = null;

      amx.header.natives.forEach(function(f) {
        if (FORBIDDEN_NATIVES.indexOf(f.name) !== -1) {
          forbidden = f;
        }
      });

      if (forbidden !== null) {
        socket.emit('server-output', {
          runId: info.runId,
          data: '\nError: Forbidden native function used ' +
                '(' + forbidden.name + ').'
        });

        return;
      }

      sampServer.tempServer(
        outputFile, {
          binary: serverBinary,
          maxTime: 5000 // WARNING: if removed, stop on socket disconnect
        }, function(err, server) {
          if (err) {
            socket.emit('server-output', {
              runId: info.runId,
              data: 'Error: ' + err.message + ' ( ' + err.code + ')\n'
            });

            return;
          }

          var beginOutput = false, onlyBlank = true;

          activeServers++;

          server
            .on('error', function(err) {
              socket.emit('server-output', {
                runId: info.runId,
                data: 'Error: ' + err.message + ' ( ' + err.code + ')\n'
              });
            })
            .on('output', function(data) {
              if (data.indexOf('Number of vehicle models') !== -1) {
                return;
              }

              if (!beginOutput) {
                if (data.indexOf('Loaded 0 filterscripts.') !== -1) {
                  beginOutput = true;
                }

                return;
              }

              if (onlyBlank) {
                if (data.trim().length) {
                  onlyBlank = false;
                } else {
                  return;
                }
              }

              socket.emit('server-output', {
                runId: info.runId,
                data: data.replace(/\r/g, '') + '\n'
              });
            })
            .on('stop', function(timeout) {
              activeServers--;

              var msg = '\nThe server stopped.';

              if (timeout) {
                msg = '\nThe server was killed (max time exceeded).';
              }

              socket.emit('server-output', {
                runId: info.runId,
                data: msg
              });
            })
            .start();
        }
      );
    });
  });
});

app.start(7070);
