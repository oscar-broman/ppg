'use strict';

window.PPG = (function (self) {
  var socket = io.connect(location.protocol + '//' + location.hostname);
  var runId = 0;
  var running = false;
  
  $('#run-code').on('click', function(e) {
    self.clearOutput();
    
    running = true;
    
    $('#run-code').attr('disabled', true);
    $('#stop-run').removeAttr('disabled');
    
    socket.emit('run-code', {
      code: self.getEditorValue(),
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
  
  $('#output-prompt').on('keyup', function(e) {
    var $this = $(this);
    
    if (e.which === 13) {
      var val = $.trim($this.val());
      
      socket.emit('run-line', {
        code: val,
        runId: runId
      });
      
      $this.val('');
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
      } else if (e.which === 69) { // E
        $('#output-prompt').focus();
      }
    }
  });
  
  socket.on('connect', function() {
    $('#run-code').removeAttr('disabled');
  });
  
  socket.on('disconnect', function() {
    $('#run-code, #stop-run').attr('disabled', true);
    
    running = false;
  });
  
  socket.on('compiler-output', function(output) {
    if (output.runId !== runId) {
      return;
    }
    
    self.appendOutput(output.data);
  });
  
  socket.on('server-output', function(output) {
    if (output.runId !== runId) {
      return;
    }
    
    self.appendOutput(output.data);
  });
  
  socket.on('server-stopped', function() {
    running = false;
    
    $('#stop-run').attr('disabled', true);
    $('#run-code').removeAttr('disabled');
  });
  
  return self;
}(window.PPG || {}));