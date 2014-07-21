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

var DISABLED_NATIVES = [
  'SendRconCommand', 'sendstring', 'sendpacket', 'listenport'
];

var ALLOWED_COMPILER_FLAGS = [
  'dataAlignment', 'outputAsm', 'compactEncoding', 'codepage', 'debugLevel',
  'optimizationLevel', 'stackHeapSize', 'skipLines', 'tabsize',
  'verbosityLevel', 'disableWarning', 'requireSemicolons',
  'requireParentheses'
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

function compilerFlagOverrides(info, socket, flags) {
  var reCompilerFlag = /^\/\/@pawncc (\w+)\s*=\s*(\S+)\s*$/gm;
  var match;

  while ((match=reCompilerFlag.exec(info.code))) {
    var key = match[1];
    var value = match[2];

    if (ALLOWED_COMPILER_FLAGS.indexOf(key) === -1) {
      socket.emit('compiler-output', {
        runId: info.runId,
        data: 'Notice: Compiler option not in whitelist: ' + key + '\n'
      });
    }

    try {
      value = JSON.parse(value);
    } catch (e) {
      continue;
    }

    if (['string', 'number', 'boolean'].indexOf(typeof value) === -1) {
      continue;
    }

    flags[key] = value;
  }

  return flags;
}

io.sockets.on('connection', function(socket) {
  var activeServer = null;
  var activeRunId = null;
  var isCompiling = false;

  socket.on('compile-lst', function(info) {
    if (isCompiling) {
      socket.emit('compiler-output', {
        runId: info.runId,
        data: 'Error: A compiler process is running. Please wait a couple seconds.'
      });

      return;
    }

    if (activeServer && activeServer.term && activeServer.term.pid) {
      pstree.kill(activeServer.term.pid, function(err) {});

      activeServer = null;
    }

    activeRunId = info.runId;
    isCompiling = true;

    var flags = compilerFlagOverrides(info, socket, {
      debugLevel: 2,
      requireSemicolons: true,
      requireParentheses: true,
      tabsize: 4,
      includeDirectory: 'include',
      outputLst: true,
      outputMacros: true
    });

    pawnCompiler.compile(new Buffer('' + info.code), flags, function(err, errors, outputFile, otherErrors, macroReplacements) {
      isCompiling = false;

      if (info.runId !== activeRunId) {
        return;
      }

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

        socket.emit('compiler-errors', {
          runId: info.runId,
          data: errors
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
          failed: true,
          data: 'Error: ' + err.message +
                ' (' + (err.code || 'no error code') + ')\n'
        });

        return;
      }

      fs.readFile(outputFile, {
        encoding: 'utf-8'
      }, function(err, data) {
        var pos = data.lastIndexOf('#file ' + outputFile.replace(/\.lst$/, '.pwn'));

        if (pos === -1) {
          socket.emit('compiler-output', {
            runId: info.runId,
            failed: true,
            data: 'Error: Unexpected output.'
          });

          return;
        }

        data = data.substr(pos + 7 + outputFile.length);

        macroReplacements = macroReplacements.filter(function(repl) {
          return (repl.file === 'input');
        });

        socket.emit('compiler-lst', {
          runId: info.runId,
          data: data,
          macroReplacements: macroReplacements
        });
      });
    });
  });

  socket.on('compile-asm', function(info) {
    if (isCompiling) {
      socket.emit('compiler-output', {
        runId: info.runId,
        data: 'Error: A compiler process is running. Please wait a couple seconds.'
      });

      return;
    }

    if (activeServer && activeServer.term && activeServer.term.pid) {
      pstree.kill(activeServer.term.pid, function(err) {});

      activeServer = null;
    }

    activeRunId = info.runId;
    isCompiling = true;

    var flags = compilerFlagOverrides(info, socket, {
      debugLevel: 2,
      requireSemicolons: true,
      requireParentheses: true,
      tabsize: 4,
      includeDirectory: 'include',
      outputAsm: true,
      outputMacros: true
    });

    pawnCompiler.compile(new Buffer('' + info.code), flags, function(err, errors, outputFile, otherErrors, macroReplacements) {
      isCompiling = false;

      if (info.runId !== activeRunId) {
        return;
      }

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

        socket.emit('compiler-errors', {
          runId: info.runId,
          data: errors
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
          failed: true,
          data: 'Error: ' + err.message +
                ' (' + (err.code || 'no error code') + ')\n'
        });

        return;
      }

      fs.readFile(outputFile, {
        encoding: 'utf-8'
      }, function(err, data) {
        var pos = data.lastIndexOf('; file ' + outputFile.replace(/\.asm$/, '.pwn'));

        if (pos === -1) {
         socket.emit('compiler-output', {
           runId: info.runId,
           failed: true,
           data: 'Error: Unexpected output.'
         });

         return;
        }

        data = data.substr(pos + 8 + outputFile.length);

        socket.emit('compiler-asm', {
          runId: info.runId,
          data: data
        });
      });
    });
  });

  socket.on('run-code', function(info) {
    if (activeServers > 20) {
      socket.emit('compiler-output', {
        runId: info.runId,
        failed: true,
        data: 'Error: Too many active servers. Please wait.'
      });

      return;
    }

    if (isCompiling) {
      socket.emit('compiler-output', {
        runId: info.runId,
        failed: true,
        data: 'Error: A compiler process is running. Please wait a couple seconds.'
      });

      return;
    }

    if (activeServer && activeServer.term && activeServer.term.pid) {
      pstree.kill(activeServer.term.pid, function(err) {});

      activeServer = null;
    }

    activeRunId = info.runId;
    isCompiling = true;

    var flags = compilerFlagOverrides(info, socket, {
      debugLevel: 2,
      requireSemicolons: true,
      requireParentheses: true,
      tabsize: 4,
      includeDirectory: 'include'
    });

    pawnCompiler.compile(new Buffer('' + info.code), flags, function(err, errors, outputFile, otherErrors) {
      isCompiling = false;

      if (info.runId !== activeRunId) {
        return;
      }

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

        socket.emit('compiler-errors', {
          runId: info.runId,
          data: errors
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
          failed: true,
          data: 'Error: ' + err.message +
                ' (' + (err.code || 'no error code') + ')\n'
        });

        return;
      }

      // TODO: async
      var amx = new AMX(fs.readFileSync(outputFile)), disabled = [];

      amx.header.natives.forEach(function(f) {
        if (DISABLED_NATIVES.indexOf(f.name) !== -1) {
          disabled.push(f.name);
          f.name = 'random';
        }
      });

      if (disabled.length) {
        socket.emit('server-output', {
          runId: info.runId,
          data: '\nWarning: Disabled native function(s) used: ' +
                disabled.join(', ') + '.\n\n'
        });
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
          activeServer = server;

          var killServer = function () {
            if (server && server.term && server.term.pid) {
              pstree.kill(server.term.pid, function(err) {});
            }
          };

          var disconnectCallback = function() {
            killServer();
          };

          socket.on('disconnect', disconnectCallback);

          var killTimeout = setTimeout(function() {
            killTimeout = null;

            killServer();
          }, 120000);

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
            killServer();
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
              if (err.code === 'EIO') {
                return;
              }

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

                  socket.emit('server-output', {
                    runId: info.runId,
                    data: 'Server started.\n\n'
                  });
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

              var msg = '\nServer stopped.';

              if (killTimeout !== null) {
                clearTimeout(killTimeout);
              } else {
                msg = '\nServer killed (max time exceeded).';
              }

              socket.emit('server-output', {
                runId: info.runId,
                data: msg
              });

              socket.emit('server-stopped', {
                runId: info.runId
              });
            });
        }
      );
    });
  });
});
