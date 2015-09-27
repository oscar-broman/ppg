'use strict';

window.PPG = (function (self) {
  var socket = io.connect(location.protocol + '//' + location.host);
  var runId = 0;
  var running = false;
  var $app = $('.app');
  var $output = $app.find('.output');
  var $outputScroller = $output.find('.scroller');
  var $compilerOutput = $output.find('.compiler-output');
  var $compilerOutputLst = $output.find('.compiler-output-lst');
  var $compilerOutputAsm = $output.find('.compiler-output-asm');
  var $serverLog = $output.find('.server-log');
  var $prompt = $output.find('.prompt input');
  var $runButtons = $('#run-code,#compile-lst,#compile-asm,#compile-macros');
  var $stopButton = $('#stop-run');
  var $outputFields = $output.find('.server-log,.compiler-output,.compiler-output-lst,.compiler-output-asm')
  var activeMode = null;
  var lastInput = null;
  var macroStep, numMacroSteps;

  function clearOutput() {
    $outputFields.hide().empty();
    $serverLog.show();
    $output.find('.macro-stepper').hide();
  }

  $('#run-code').on('click', function(e) {
    clearOutput();
    self.clearEditorErrors();

    running = true;
    $runButtons.attr('disabled', true);
    $stopButton.attr('disabled', true);

    activeMode = 'run';

    socket.emit('run-code', {
      code: self.getCurrentCode(),
      runId: ++runId,
      options: {

      }
    });
  });

  $('#compile-lst').on('click', function(e) {
    $runButtons.attr('disabled', true);
    $stopButton.attr('disabled', true);

    clearOutput();

    activeMode = 'lst';

    socket.emit('compile-lst', {
      code: self.getCurrentCode(),
      runId: ++runId
    });
  });

  $('#compile-asm').on('click', function(e) {
    $runButtons.attr('disabled', true);
    $stopButton.attr('disabled', true);

    clearOutput();

    activeMode = 'asm';

    socket.emit('compile-asm', {
      code: self.getCurrentCode(),
      runId: ++runId
    });
  });

  $('#compile-macros').on('click', function(e) {
    $runButtons.attr('disabled', true);
    $stopButton.attr('disabled', true);

    clearOutput();

    activeMode = 'macros';

    lastInput = self.getCurrentCode();

    socket.emit('compile-lst', {
      code: lastInput,
      runId: ++runId
    });
  });

  function setMacroStep(idx) {
    var dir = macroStep - idx;
    macroStep = Math.max(1, Math.min(idx, numMacroSteps));

    $('.macro-stepper .current-step').text([macroStep, numMacroSteps].join(' / '));

    $('.compiler-output-lst .repl-line').each(function() {
      var $this = $(this);
      var step = +$this.data('step');

      $this
        .toggleClass('behind', step < macroStep)
        .toggleClass('active', step === macroStep)
        .toggleClass('ahead', step > macroStep)
        .toggleClass('dir-left', step === macroStep && dir < 0)
        .toggleClass('dir-right', step === macroStep && dir > 0)
    });

    if (macroStep !== 1 && macroStep !== numMacroSteps) {
      var scrollerTop = $outputScroller.scrollTop();
      var scrollerHeight = $outputScroller.height();
      var activeTop = $output.find('.repl-line.active').position().top + scrollerTop;

      if (activeTop < scrollerTop + 60) {
        $outputScroller.scrollTop(activeTop - 60);
      } else if (activeTop > scrollerTop + scrollerHeight - 40) {
        $outputScroller.scrollTop(activeTop - scrollerHeight + 40);
      }
    }
  };

  $('.macro-stepper .forward').on({
    click: function() {
      setMacroStep(macroStep + 1);
    }
  });

  $('.macro-stepper .backward').on({
    click: function() {
      setMacroStep(macroStep - 1);
    }
  });

  function escape(str) {
    return str.replace(/&/g,'&amp;')
              .replace(/</g,'&lt;')
              .replace(/"/g,'&quot;')
              .replace(/'/g,'&#039;')
              .replace(/</g,'&lt;');
  }

  socket.on('compiler-lst', function(output) {
    if (output.runId !== runId) {
      return;
    }

    $runButtons.removeAttr('disabled');

    $compilerOutputLst.show();

    if (activeMode === 'macros') {
      var outputNode = $compilerOutputLst.get(0);
      var rawLines = lastInput.split('\n').map(function(line) {
        return line || ' ';
      });
      var lines = rawLines.map(function(line) {
        return [];
      });

      var step = 1;
      var lastIdx = output.macroReplacements.length - 1;

      output.macroReplacements.forEach(function(repl, i) {
        var l = repl.line - 1;

        var line = rawLines[l];

        rawLines[l] = line.substr(0, repl.col) + repl.replacement + line.substr(repl.col + repl.start_len);

        line = escape(line.substr(0, repl.col)) +
               '<span class="repl">' +
               '<span class="old">' + escape(line.substr(repl.col, repl.start_len)) + '</span>' +
               '<span class="new">' + escape(repl.replacement) + '</span>' +
               '</span>' +
               escape(line.substr(repl.col + repl.start_len));

        var classes = ['repl-line', 'ahead'];

        if (!lines[l].length) {
          classes.push('first');
        }

        if (i === lastIdx || output.macroReplacements[i + 1].line !== repl.line) {
          classes.push('last');
        }

        line = '<span class="' + classes.join(' ') + '" data-step="' + (++step) + '">' + line + '</span>';

        lines[l].push(line);
      });

      numMacroSteps = ++step === 2 ? 1 : step;
      macroStep = 1;

      lines.forEach(function(line, l) {
        if (line.length === 0) {
          lines[l] = '<span class="line">' + escape(rawLines[l]) + '</span>';
        } else {
          lines[l] = lines[l].join('');
        }
      });

      outputNode.innerHTML = lines.join('');

      $output.find('.macro-stepper').show();

      setMacroStep(1);
    } else {
      CodeMirror.runMode(output.data, 'text/x-pawn', $compilerOutputLst.get(0));
    }
  });

  socket.on('compiler-asm', function(output) {
    if (output.runId !== runId) {
      return;
    }

    $runButtons.removeAttr('disabled');

    $compilerOutputAsm.show();

    output.data = output.data.replace(/; line ([0-9a-f]+)/gi, function(match, lineNumber) {
      return '; line ' + parseInt(lineNumber, 16);
    });

    CodeMirror.runMode(output.data, 'text/x-pawn-asm', $compilerOutputAsm.get(0));
  });

  $('#stop-run').on('click', function(e) {
    socket.emit('stop-run', {
      runId: runId
    });
  });

  socket.on('connect', function() {
    $runButtons.removeAttr('disabled');
    $stopButton.attr('disabled', true);
  });

  socket.on('disconnect', function() {
    $runButtons.attr('disabled', true);
    $stopButton.attr('disabled', true);

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

    if (output.failed) {
      running = false;

      $runButtons
        .removeAttr('disabled')
        .removeClass('running');
      $('#stop-run').attr('disabled', true);
    }
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

    $runButtons
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
        if (!$('#run-code').attr('disabled')) {
          $('#run-code').trigger('click');
        }

        return false;
      } else if (e.which === 83) { // S
        if (!$('#stop-run').attr('disabled')) {
          $('#stop-run').trigger('click');
        }

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