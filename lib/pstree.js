var childProcess = require('child_process');

function parseProcessList(plist, processes) {
  var reParse = false;

  plist.forEach(function(row) {
    var match = row.match(/^\s*(\d+)\s+(\d+)\s*$/);

    if (match) {
      var pid, ppid;

      pid = +match[1];
      ppid = +match[2];

      if (processes.indexOf(pid) === -1 &&
          processes.indexOf(ppid) !== -1) {
        processes.push(pid);

        reParse = true;
      }
    }
  });

  return reParse;
}

//  TODO: Windows compatibility
exports.kill = function killProcessTree(pid, fn) {
  childProcess.exec('ps -A -o pid,ppid', function(err, stdout, stderr) {
    if (err) return fn(err);
    if (stderr) return fn(new Error(stderr));

    if (!stdout || !(stdout = stdout.trim())) {
      return fn(new Error('Empty output from ps command.'));
    }
    
    var children = [pid];
    var plist = stdout.split('\n');
    var reParse = true;

    while (reParse) {
      reParse = parseProcessList(plist, children);
    }
    
    // Freeze them
    children.forEach(function(pid) {
      try {
        process.kill(pid, 'SIGSTOP');
      } catch (e) {}
    });
    
    // Kill them
    children.forEach(function(pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (e) {}
    });
    
    fn(null);
  });
};