'use strict';

window.PPG = (function (self) {
  var DEFAULT_CODE =
    '#include <a_samp>\n' +
    '#include <ppg>\n\n' +
    'main() {\n\t\n}';
  
  var Range = ace.require('./range').Range;
	var editor = ace.edit('editor-field');
  var $files = $('#files');

  editor.setTheme('ace/theme/textmate');
  editor.setBehavioursEnabled(false);
  
  if (!window.localStorage) {
    alert('Please update your browser.');
    
    return;
  }
  
  self.updateFileList = function() {
    $files
      .empty()
      .append(
        $('<a href="#" class="list-group-item newfile"/>')
          .data('name', null)
          .text('New file')
          .toggleClass('active', self.activeFile === null)
      );
    
    for (var name in self.files) {
      if (self.files.hasOwnProperty(name)) {
        var file = self.files[name];
        
        $files.append(
          $('<a href="#" class="list-group-item"/>')
            .data('name', name)
            .text(name)
            .toggleClass('active', self.activeFile === name)
        );
      }
    }
  };

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
  
  self.getEditorCursor = function() {
    var c = editor.selection.getCursor();
    
    return [c.row, c.column];
  };

  self.setEditorFocus = function() {
    editor.focus();
  };
  
  if (localStorage.files) {
    self.files = JSON.parse(localStorage.files);
  } else {
    self.files = {
      demo: {
        code:
          '#include <a_samp>\n' +
          '#include <ppg>\n' +
          '\n' +
          '/*\n' +
          '  Shortcuts:\n' +
          '    * Ctrl+Shift+R - run the code\n' +
          '    * Ctrl+Shift+S - stop the server\n' +
          '    * Ctrl+Shift+F - switch focus between the editor and the prompt at the bottom\n' +
          '*/\n' +
          '\n' +
          'main() {\n' +
          '    SetTimer("Test", 150, true);\n' +
          '    \n' +
          '    Test();\n' +
          '}\n' +
          '\n' +
          'forward Test();\n' +
          'public Test() {\n' +
          '    static i = 0;\n' +
          '    \n' +
          '    if (++i < 6) {\n' +
          '        printf("hello %d", i);\n' +
          '    } else if (i == 6) {\n' +
          '        print("\\nType this in the prompt below and press enter:\\n  print(\\"test!\\")");\n' +
          '    }\n' +
          '}'
      }
    };
  }
  
  self.activeFile = localStorage.activeFile || null;
  
  if (self.activeFile) {
    editor.setValue(self.files[self.activeFile].code);
    editor.clearSelection();
    
    if (self.files[self.activeFile].cursor) {
      editor.moveCursorTo.apply(editor, self.files[self.activeFile].cursor);
    }
  } else if (localStorage.editorText) {
    editor.setValue(localStorage.editorText);
    editor.clearSelection();
  } else if (self.files.demo) {
    self.activeFile = 'demo';
    editor.setValue(self.files[self.activeFile].code);
    editor.clearSelection();
  }
  
  self.setEditorFocus();
  self.updateFileList();
  
  $('#save').on({
    click: function(e) {
      if (!self.activeFile) {
        self.activeFile = prompt('Filename') || null;
        
        if (!self.activeFile) {
          return false;
        }
        
        if (self.files[self.activeFile] && !confirm('The file already exists. Overwrite?')) {
          self.activeFile = null;
          
          return false;
        }
      }
      
      self.files[self.activeFile] = {
        code: self.getEditorValue(),
        cursor: self.getEditorCursor()
      };
      
      self.updateFileList();
      
      return false;
    }
  });
  
  $files.on('click', 'a', function(e) {
    var name = $(this).data('name');
    
    if (self.activeFile === null) {
      var val = self.getEditorValue();
      
      if (val && val !== DEFAULT_CODE && confirm('Save the current code?')) {
        $('#save').trigger('click');
      }
    } else {
      var code = self.getEditorValue();
      
      self.files[self.activeFile].cursor = self.getEditorCursor();
      
      if (code !== self.files[self.activeFile].code) {
        if (confirm('Save the current code?')) {
          $('#save').trigger('click');
        }
      }
    }
    
    self.activeFile = name;
    
    if (self.activeFile) {
      editor.setValue(self.files[self.activeFile].code);
      editor.clearSelection();
      
      if (self.files[self.activeFile].cursor) {
        editor.moveCursorTo.apply(editor, self.files[self.activeFile].cursor);
      }
      
      self.setEditorFocus();
    } else {
      editor.setValue(
        DEFAULT_CODE
      );
      editor.clearSelection();
      editor.moveCursorTo(4, 1);
      self.setEditorFocus();
    }
    
    self.updateFileList();
  });

	$(window).on({
	  unload: function(e) {
      if (self.activeFile) {
        self.files[self.activeFile].cursor = self.getEditorCursor();
        
        localStorage.setItem('editorText', '');
        localStorage.setItem('activeFile', self.activeFile);
      } else {
        localStorage.setItem('editorText', self.getEditorValue());
        localStorage.setItem('activeFile', '');
      }
      
      localStorage.setItem('files', JSON.stringify(self.files));
	  },
    beforeunload: function(e) {
      var code = self.getEditorValue();
      
      if (self.activeFile === null) {
        if (!code || code === DEFAULT_CODE) {
          return;
        }
      } else {
        if (code === self.files[self.activeFile].code) {
          return;
        }
      }
      
      return 'Your unsaved changes will be lost!';
    }
	});

  return self;
}(window.PPG || {}));