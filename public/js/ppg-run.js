'use strict';

window.PPG = (function (self) {
  var socket = io.connect(location.protocol + '//' + location.hostname);
  var runId = 0;
  var running = false;
  var $app = $('.app');
  var $output = $app.find('.output');
  var $outputScroller = $output.find('.scroller');
  var $compilerOutput = $output.find('.compiler-output');
  var $serverLog = $output.find('.server-log');

  function clearOutput() {
    $compilerOutput.hide().empty();
    $serverLog.empty();
  }

  $('#run-code').on('click', function(e) {
    clearOutput();
    self.clearEditorErrors();

    running = true;
    $('#run-code,#stop-run').attr('disabled', true);

    socket.emit('run-code', {
      code: self.getCurrentCode(),
      runId: ++runId,
      options: {

      }
    });
  });

  $('#stop-run').on('click', function(e) {
    socket.emit('stop-run', {
      runId: runId
    });
  });

  socket.on('connect', function() {
    $('#run-code').removeAttr('disabled');
    $('#stop-run').attr('disabled', true);
  });

  socket.on('disconnect', function() {
    $('#run-code').attr('disabled', true);
    $('#stop-run').attr('disabled', true);

    running = false;
  });

  socket.on('compiler-output', function(output) {
    if (output.runId !== runId) {
      return;
    }

    $('#run-code,#stop-run')
      .addClass('running')
      .removeAttr('disabled');

    if (!output.data.trim()) {
      $compilerOutput.hide();
    } else {
      $compilerOutput
        .show()
        .append(
          $('<span/>').text(output.data)
        );
    }

    $outputScroller.scrollTop(
      $outputScroller[0].scrollHeight - $outputScroller.height()
    );
  });

  socket.on('compiler-errors', function(output) {
    if (output.runId !== runId) {
      return;
    }

    self.setEditorErrors(output.data);
  });

  socket.on('server-output', function(output) {
    if (output.runId !== runId) {
      return;
    }

    $('#run-code,#stop-run')
      .addClass('running')
      .removeAttr('disabled');

    $serverLog.append(
      $('<span/>').text(output.data)
    );

    $outputScroller.scrollTop(
      $outputScroller[0].scrollHeight - $outputScroller.height()
    );
  });

  socket.on('server-stopped', function(output) {
    if (output.runId !== runId) {
      return;
    }

    running = false;

    $('#run-code')
      .removeAttr('disabled')
      .removeClass('running');
    $('#stop-run').attr('disabled', true);
  });

  return self;
}(window.PPG || {}));