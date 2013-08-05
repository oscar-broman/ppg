'use strict';

window.PPG = (function (self) {
  var $outputScroller = $('#output .scroller');
  var $outputPrompt = $('#output .prompt');
  var $outputField = $('#output-field');
  
  $outputPrompt.on('keyup', function(e) {
    if (e.which === 13 && $.trim($(this).val())) {
      alert('Not implemented yet.');
    }
  });
  
  self.appendOutput = function(text) {
    var $text = $('<span/>');
    
    // lol
    $text.text(text);
    
    $outputField.append($text);
    
    $outputScroller.scrollTop(
      $outputScroller[0].scrollHeight - $outputScroller.height()
    );
    
    return $text;
  };
  
  self.clearOutput = function() {
    $outputField.empty();
  };
  
  return self;
}(window.PPG || {}));