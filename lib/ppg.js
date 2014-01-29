'use strict';

var path = require('path');
var express = require('express');
var http = require('http');
var socketio = require('socket.io');
var sampServer = require('samp-server');
var pawnCompiler = require('samp-server/lib/pawn-compiler');
var wineProxy = require('samp-server/lib/wine-proxy');
var AMX = require('./amx');
var fs = require('fs');
var async = require('async');
var pstree = require('./pstree');

var app = express();
var server = http.createServer(app);
var io = socketio.listen(server, {
  log: false
});

var FORBIDDEN_NATIVES = [
//  'fopen', 'fclose', 'ftemp', 'fremove', 'fwrite', 'fread', 'fputchar',
//  'fgetchar', 'fblockwrite', 'fblockread', 'fseek', 'flength', 'fexist',
//  'fmatch', 'sendstring', 'sendpacket', 'listenport', 'SendRconCommand'
];

var reStripNonPrintable = /[^\x20-\x7E]/;

app.start = app.listen = function() {
  return server.listen.apply(server, arguments);
};

var serverBinary, windowsBinary, activeServers = 0, activePlugins = [];

var isWindows = (process.platform === 'win32');

if (process.platform === 'win32' || process.platform === 'darwin') {
  windowsBinary = true;
  serverBinary = 'samp-server.exe';
} else {
  windowsBinary = false;
  serverBinary = 'samp03svr';
}

fs.readdirSync('plugins').forEach(function(file) {
  var ext = path.extname(file).toLowerCase();

  file = path.resolve('plugins', file);

  if (!windowsBinary && ext === '.so') {
    activePlugins.push(file);
  } else if (windowsBinary && ext === '.dll') {
    activePlugins.push(file);
  }
});

serverBinary = path.resolve(__dirname, '..', 'bin', 'server', serverBinary);

app.use(express.static('public'));

var operations = [];

var includePath = path.resolve('include').replace(/[\/\\]+$/, '');

if (!isWindows && windowsBinary) {
  operations.push(function(fn) {
    wineProxy.convertPath('w', includePath, function(err, path) {
      if (err) return fn(err);

      includePath = path.replace(/[\/\\]+$/, '');

      fn(null);
    });
  });
}

async.series(operations, function(err) {
  if (err) throw err;

  app.start(7070);
});

io.sockets.on('connection', function(socket) {
  socket.on('run-code', function(info) {
    if (activeServers > 20) {
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
      tabsize: 4,
      includeDirectory: 'include'
    }, function(err, errors, outputFile, otherErrors) {
      if (errors && errors.length) {
        errors.forEach(function(error) {
          error.file = 'input';
        });

        errors = errors.filter(function(error) {
          if (error.message === 'symbol is never used: "TODO"') {
            return false;
          }

          return true;
        });

        socket.emit('compiler-output', {
          runId: info.runId,
          data: errors.join('\n') + '\n'
        });
      }

      if (otherErrors && otherErrors.length) {
        socket.emit('compiler-output', {
          runId: info.runId,
          data: otherErrors.join('\n') + '\n'
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

      var inputBasename = path.basename(outputFile, '.amx') + '.pwn';

      if (amx.debug) {
        amx.debug.files.forEach(function(file) {
          if (file.name.replace(/.+[\/\\]/, '') === inputBasename) {
            file.name = 'input.pwn';
          } else {
            file.name = file.name.replace(includePath, 'include');
          }

          file.name = file.name.replace(/\\/g, '/');
        });
      }

      amx = amx.build();

      // TODO: async
      fs.writeFileSync(outputFile, amx);

      sampServer.tempServer(
        outputFile, {
          binary: serverBinary,
          plugins: activePlugins,
          maxLogSize: 10240,
          filterscripts: [
            path.resolve(__dirname, '..', 'bin', 'server', 'fix_OnRconCommand')
          ]
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

          var disconnectCallback = function() {
            server.stop();
          };

          socket.on('disconnect', disconnectCallback);

          var killTimeout = setTimeout(function () {
            killTimeout = null;

            if (server && server.term && server.term.pid) {
              pstree.kill(server.term.pid, function(err) {});
            }
          }, 60000);

          var outputLines = 0;

          var runLineCallback = function(lineInfo) {
            if (lineInfo.runId !== info.runId) {
              return;
            }

            var code = lineInfo.code.replace(reStripNonPrintable, '');

            socket.emit('server-output', {
              runId: info.runId,
              data: '> ' + code + '\n'
            });

            server.send('runcode ' + code);
          };

          socket.on('run-line', runLineCallback);

          var stopRunCallback = function() {
            server.stop();
          };

          socket.on('stop-run', stopRunCallback);

          fs.writeFile(
            path.join(server.cwd, 'scriptfiles', 'ppg-gm.amx'),
            amx,
            function(err) {
              server.start();
            }
          );

          server
            .on('error', function(err) {
              socket.emit('server-output', {
                runId: info.runId,
                data: 'Error: ' + err.message + (
                  err.code ? ' (' + err.code + ')\n' : '\n'
                )
              });
            })
            .on('output', function(data) {
              if (outputLines++ > 10000) {
                if (outputLines > 10001) {
                  return;
                }

                try {
                  server.logTail.pause();
                  server.logTail.close();
                  pstree.kill(server.child.pid, function(err) {});
                } catch (e) {}

                socket.emit('server-output', {
                  runId: info.runId,
                  data: '\n\nError: Output limit exceeded\n'
                });

                return;
              }

              if (data.indexOf('Number of vehicle models') !== -1) {
                return;
              }

              if (!beginOutput) {
                if (data.indexOf('Loaded 1 filterscripts.') !== -1) {
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
              socket.removeListener('run-line', runLineCallback);
              socket.removeListener('stop-run', stopRunCallback);
              socket.removeListener('disconnect', disconnectCallback);

              activeServers--;

              var msg = '\nThe server stopped.';

              if (killTimeout !== null) {
                clearTimeout(killTimeout);
              } else {
                msg = '\nThe server was killed (max time exceeded).';
              }

              socket.emit('server-output', {
                runId: info.runId,
                data: msg
              });

              socket.emit('server-stopped');
            });
        }
      );
    });
  });
});
