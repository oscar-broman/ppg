'use strict';

window.PPG = (function (self) {
  var $body = $('body');
  var $app = $('.app');
  var $editor = $app.find('.main > .editor');
  var $documentList = $app.find('.document-list');

  var lintErrors = [];
  var cm = CodeMirror($editor.get(0), {
    autoCloseBrackets: true,
    autofocus: true,
    dragDrop: true,
    foldGutter: true,
    gutters: [
      'CodeMirror-linenumbers',
      'CodeMirror-lint-markers',
      'CodeMirror-foldgutter'
    ],
    highlightSelectionMatches: true,
    indentUnit: 4,
    indentWithTabs: true,
    lineNumbers: true,
    lineWrapping: false,
    matchBrackets: true,
    showCursorWhenSelecting: true,
    smartIndent: true,
    tabSize: 4,
    theme: 'default pawn',
    lint: {
      getAnnotations: function() {
        return lintErrors.map(function(err) {
          return {
            from: CodeMirror.Pos(err.startLine - 1, 0),
            to: CodeMirror.Pos(err.endLine - 1, 0),
            message: err.message,
            severity: err.type
          };
        });
      }
    }
  });

  var saveTimeout = null;

  function setSaveTimeout() {
    if (saveTimeout !== null) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(function() {
      saveTimeout = null;

      saveDocuments();
    }, 250);
  }

  cm.on('change', setSaveTimeout);
  cm.on('cursorActivity', setSaveTimeout);

  var demoDoc = new CodeMirror.Doc(
    [
      '#include <a_samp>',
      '#include <ppg>',
      '',
      '/*',
      '	Shortcuts:',
      '	  Ctrl+Shift+R - run the code',
      '	  Ctrl+Shift+S - stop the server',
      '	  Ctrl+Shift+F - switch focus between the editor and the prompt at the bottom',
      '*/',
      '',
      'main() {',
      '	SetTimer("Test", 150, true);',
      '	',
      '	Test();',
      '}',
      '',
      'forward Test();',
      'public Test() {',
      '	static i = 0;',
      '	',
      '	if (++i < 6) {',
      '		printf("hello %d", i);',
      '	} else if (i == 6) {',
      '		print("\\nType this in the prompt below and press enter:\\n  print(\\"test!\\")");',
      '	}',
      '}'
    ].join('\n'),
    'text/x-pawn'
  );

  var newDoc = new CodeMirror.Doc(
    [
      '#include <a_samp>',
      '#include <ppg>',
      '',
      'main() {',
      '\t',
      '}'
    ].join('\n'),
    'text/x-pawn'
  );

  newDoc.setCursor({
    line: 4,
    ch: 1
  });

  var activeDoc = 0;
  var docs;

  loadDocuments();

  setActiveDocument(findActiveDoc() || 1);

  var lintWidgets = [];

  self.clearEditorErrors = function() {
    lintErrors = [];

    CodeMirror.startLinting(cm);
  };

  self.setEditorErrors = function(errors) {
    lintErrors = errors;
    docs[activeDoc].errors = errors;

    CodeMirror.startLinting(cm);
  };

  function setActiveDocument(doc) {
    var save = false;

    if (doc === 0) {
      var name;
      var taken = false;

      do {
        if (taken) {
          name = prompt(
            'Error: A document with that name already exists.\n\n' +
            'Please specify another name:'
          );
        } else {
          name = prompt('Document name:');
        }

        taken = false;

        if (!name || !(name = name.trim())) {
          return;
        }

        for (var i = 0; i < docs.length; i++) {
          if (docs[i].name === name) {
            taken = true;
          }
        }
      } while (taken);

      doc = docs.push({
        name: name,
        uid: +new Date(),
        cmDoc: newDoc.copy()
      }) - 1;

      save = true;
    }

    activeDoc = doc;
    cm.swapDoc(docs[doc].cmDoc);

    if (docs[doc].errors) {
      lintErrors = docs[doc].errors;
    } else {
      lintErrors = [];
    }

    CodeMirror.startLinting(cm);

    syncDocumentList();

    if (save) {
      saveDocuments();
    }
  }

  function syncDocumentList() {
    $documentList.empty();

    docs.forEach(function(doc, idx) {
      $documentList.append(
        $('<a class="list-group-item" href="#"/>')
          .text(doc.name)
          .toggleClass('active', idx === activeDoc)
          .toggleClass('new-doc', idx === 0)
          .data('doc-idx', idx)
      );
    });
  }

  var saveRev = +localStorage.ppgSaveRevision || 0;

  setInterval(function () {
    if (saveRev !== +localStorage.ppgSaveRevision) {
      var activeUid = docs[activeDoc].uid;

      loadDocuments();

      var foundDoc = null;

      for (var i = 0; i < docs.length; i++) {
        if (docs[i].uid === activeUid) {
          foundDoc = i;

          break;
        }
      }

      if (foundDoc === null)
        foundDoc = findActiveDoc();

      setActiveDocument(foundDoc);

      syncDocumentList();
    }
  }, 100);

  function saveDocuments() {
    var plainDocs = [];

    docs.forEach(function(doc, idx) {
      if (idx === 0) {
        return;
      }

      plainDocs.push({
        name: doc.name,
        errors: doc.errors || [],
        uid: doc.uid,
        value: doc.cmDoc.getValue(),
        cursor: doc.cmDoc.getCursor(),
        selection: doc.cmDoc.sel,
        scrollLeft: doc.cmDoc.scrollLeft,
        scrollTop: doc.cmDoc.scrollTop,
        history: doc.cmDoc.getHistory()
      });
    });

    saveRev = (+localStorage.ppgSaveRevision || 0) + 1;

    localStorage.ppgSaveRevision = saveRev;
    localStorage.ppgDocuments = JSON.stringify(plainDocs);
    localStorage.ppgActiveDoc = docs[activeDoc].uid;
  }

  function findActiveDoc() {
    if (localStorage.ppgActiveDoc) {
      var uid = +localStorage.ppgActiveDoc;

      for (var i = 0; i < docs.length; i++) {
        if (docs[i].uid === uid) {
          return i;
        }
      }
    }

    return null;
  }

  function loadDocuments() {
    var plainDocs = JSON.parse(localStorage.ppgDocuments || '[]');

    saveRev = +localStorage.ppgSaveRevision || 0;

    docs = [{
      name: 'New document'
    }];

    if (localStorage.files) {
      var files = JSON.parse(localStorage.files);
      var time = +new Date();
      var i = 0;

      for (var key in files) {
        if (!files.hasOwnProperty(key)) {
          continue;
        }

        docs.push({
          name: key,
          errors: [],
          uid: time + (++i),
          cmDoc: new CodeMirror.Doc(files[key].code, 'text/x-pawn')
        });
      }

      localStorage.filesBak = localStorage.files;
      localStorage.removeItem('files');
    }

    plainDocs.forEach(function (doc) {
      var cmDoc = new CodeMirror.Doc(doc.value, 'text/x-pawn');

      cmDoc.setHistory(doc.history);
      cmDoc.setCursor(doc.cursor);
      cmDoc.setSelections(doc.selection.ranges, doc.selection.primIndex);
      cmDoc.setHistory(doc.history);
      cmDoc.scrollLeft = doc.scrollLeft;
      cmDoc.scrollTop = doc.scrollTop;

      docs.push({
        name: doc.name,
        errors: doc.errors,
        uid: doc.uid,
        cmDoc: cmDoc
      });
    });

    if (docs.length === 1) {
      docs.push({
        name: 'demo',
        uid: +new Date(),
        cmDoc: demoDoc.copy()
      });
    }
  }

  function deleteDocument(doc) {
    docs.splice(doc, 1);

    if (docs.length === 1) {
      docs.push({
        name: 'demo',
        uid: +new Date(),
        cmDoc: demoDoc.copy()
      });
    }

    if (activeDoc >= docs.length) {
      activeDoc = docs.length - 1;
    } else if (activeDoc >= doc) {
      activeDoc = Math.max(1, activeDoc - 1);
    }

    setActiveDocument(activeDoc);
    saveDocuments();
  }

  $documentList.on('click mouseup contextmenu', 'a', function(e) {
    if (e.type === 'contextmenu') {
      return false;
    }

    var doc = $(this).data('doc-idx');

    if (e.type === 'mouseup' && e.which === 3) {
      if (doc !== 0 && confirm('Delete the document "' + docs[doc].name + '"?')) {
        deleteDocument(doc);
      }
    } else if (e.type === 'click') {
      setActiveDocument(doc);
    }

    cm.focus();

    return false;
  });

  self.updateEditorSize = function() {
    cm.setSize('100%', '100%');
  };

  self.getCurrentCode = function() {
    return cm.getValue();
  };

  $(window).on({
    load: function(e) {
      cm.on('change', function() {
        if (lintErrors.length) {
          self.clearEditorErrors();
          docs[activeDoc].errors = [];
        }
      });
    },
    resize: function(e) {
      self.updateEditorSize();
    },
    unload: function(e) {
      saveDocuments();
    }
  });

  return self;
}(window.PPG || {}));