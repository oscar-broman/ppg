'use strict';

window.PPG = (function (self) {
  var $body = $('body');
  var $app = $('.app');
  var $editor = $app.find('.main > .editor');
  var $output = $app.find('.main > .output');
  var $outputSeparator = $output.find('.separator');
  var toolbarHeight = $app.find('.main > .toolbar').height();

  var separatorDrag = null;

  if (localStorage.outputHeight) {
    $output.height(localStorage.outputHeight);
    $editor.css('bottom', +localStorage.outputHeight);
  } else {
    localStorage.outputHeight = 300;
  }

	$(window).on({
	  load: function(e) {
      requestAnimationFrame(function() {
        $body.addClass('visible');
        self.updateEditorSize();
      });
	  },
    mousemove: function(e) {
      if (separatorDrag !== null) {
        var clientY = Math.max(100 + toolbarHeight, e.clientY - separatorDrag);

        var height = $(window).height() - clientY;

        $output.height(height);

        height = $output.height();

        $output.height(height);
        $editor.css('bottom', height);

        localStorage.outputHeight = height;

        self.updateEditorSize();
      }
    },
    mouseup: function(e) {
      separatorDrag = null;
    }
	});

  $outputSeparator.on({
    mousedown: function(e) {
      separatorDrag = e.offsetY;

      e.preventDefault();
    }
  });

  return self;
}(window.PPG || {}));