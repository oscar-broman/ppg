'use strict';

window.PPG = (function (self) {
  var $body = $('body');
  var $app = $('.app');
  var $output = $app.find('.main > .output');
  var $outputSeparator = $output.find('.separator');

  var separatorDrag = null;

  if (localStorage.outputHeight) {
    $output.height(localStorage.outputHeight);
  }

	$(window).on({
	  load: function(e) {
      requestAnimationFrame(function() {
        $body.addClass('visible');
      });
	  },
    mousemove: function(e) {
      if (separatorDrag !== null) {
        var height = $(window).height() - e.clientY + separatorDrag;

        $output.height(height);

        height = $output.height();

        $output.height(height);

        localStorage.outputHeight = height;
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