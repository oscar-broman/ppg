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
  var $prompt = $output.find('.prompt input');

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

  var promptHistory = [];
  var promptHistoryIdx = null;

  if (localStorage.ppgPromptHistory) {
    promptHistory = JSON.parse(localStorage.ppgPromptHistory);
  }

  $prompt.on({
    keydown: function(e) {
      if (e.which === 38) {
        if (!promptHistory.length) {
          return false;
        }

        if (promptHistoryIdx === null) {
          promptHistoryIdx = 0;
        } else {
          promptHistoryIdx = Math.min(promptHistoryIdx + 1, promptHistory.length - 1);
        }

        $prompt.val(promptHistory[promptHistoryIdx]);

        return false;
      } else if (e.which === 40) {
        if (!promptHistory.length) {
          return false;
        }

        if (promptHistoryIdx === null) {
          promptHistoryIdx = 0;
        } else {
          promptHistoryIdx = Math.max(promptHistoryIdx - 1, 0);
        }

        $prompt.val(promptHistory[promptHistoryIdx]);

        return false;
      }
    },
    keyup: function(e) {
      if (e.which === 13) {
        var val = $.trim($prompt.val());

        promptHistory.splice(0, 0, val);
        promptHistoryIdx = null;

        while (promptHistory.length > 100) {
          promptHistory.pop();
        }

        socket.emit('run-line', {
          code: val,
          runId: runId
        });

        $prompt.val('');

        localStorage.ppgPromptHistory = JSON.stringify(promptHistory);
      }
    }
  });

  $(window).on('keydown', function(e) {
    if (e.shiftKey && (e.metaKey || e.ctrlKey)) {
      if (e.which === 82) { // R
        $('#run-code').trigger('click');

        return false;
      } else if (e.which === 83) { // S
        $('#stop-run').trigger('click');

        return false;
      } else if (e.which === 70) { // F
        if ($prompt.is(':focus')) {
          self.setEditorFocus();
        } else {
          $prompt.focus();
        }

        return false;
      }
    }
  });

  return self;
}(window.PPG || {}));