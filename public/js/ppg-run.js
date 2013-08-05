'use strict';

window.PPG = (function (self) {
  var socket = io.connect(location.protocol + '//' + location.hostname);
  var runId = 0;
  
  $('#run-code').on('click', function(e) {
    self.clearOutput();
    
    socket.emit('run-code', {
      code: self.getEditorValue(),
      runId: ++runId,
      options: {
        
      }
    });
  });
  
  socket.on('connect', function() {
    $('#run-btn button').removeAttr('disabled');
  });
  
  socket.on('disconnect', function() {
    $('#run-btn button').attr('disabled', true);
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
  
  return self;
}(window.PPG || {}));