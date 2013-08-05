'use strict';

window.PPG = (function (self) {
  var $body = $('body');
  
	$(window).on({
    ready: function(e) {
      
    },
	  load: function(e) {
      $body.addClass('visible');
	  }
	});
	
  return self;
}(window.PPG || {}));