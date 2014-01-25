'use strict';

window.PPG = (function (self) {
  var Range = ace.require('./range').Range;
	var editor = ace.edit('editor-field');
  
  editor.setTheme('ace/theme/textmate');
  editor.setBehavioursEnabled(false);
  
  if (window.localStorage && localStorage.editorText) {
    editor.setValue(localStorage.editorText || '');
    editor.clearSelection();
  }
  
  self.startEditorSession = function(text) {
    var session = ace.createEditSession(text || '', mode);
    
    session.setMode('ace/mode/c_cpp');
    session.setUseSoftTabs(false);
    session.setFoldStyle('markbeginend');
    
    editor.setSession(session);
    editor.clearSelection();
  };
  
  self.getEditorValue = function() {
    return editor.getValue();
  };
  
  self.setEditorFocus = function() {
    editor.focus();
  };
  
	$(window).on({
	  unload: function(e) {
      localStorage.setItem('editorText', self.getEditorValue());
	  }
	});
	
  return self;
}(window.PPG || {}));