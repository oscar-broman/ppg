/* jshint camelcase:false, shadow:true, maxlen: 1000 */

'use strict';

var IDENT_VARIABLE  = 1;
var IDENT_REFERENCE = 2;
var IDENT_ARRAY     = 3;
var IDENT_REFARRAY  = 4;
var IDENT_FUNCTION  = 9;

var AMX_FLAG_DEBUG    =   0x02;  // symbolic info. available
var AMX_FLAG_COMPACT  =   0x04;  // compact encoding
var AMX_FLAG_BYTEOPC  =   0x08;  // opcode is a byte (not a cell)
var AMX_FLAG_NOCHECKS =   0x10;  // no array bounds checking; no STMT opcode
var AMX_FLAG_NTVREG   = 0x1000;  // all native functions are registered
var AMX_FLAG_JITC     = 0x2000;  // abstract machine is JIT compiled
var AMX_FLAG_BROWSE   = 0x4000;  // busy browsing
var AMX_FLAG_RELOC    = 0x8000;  // jump/call addresses relocated

var AMX_MAGIC   =  0xF1E0;
var DEBUG_MAGIC =  0XF1EF;

var AMX = function(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Expects buffer.');
  }

  var header = {
		magic:        buffer.readUInt16LE(4), // signature
		file_version: buffer.readUInt8(6),    // file format version
		amx_version:  buffer.readUInt8(7),    // required version of the AMX
		flags:        buffer.readInt16LE(8),  // flags
		defsize:      buffer.readInt16LE(10)  // size of a definition record
  };

  if (header.magic !== AMX_MAGIC) {
    throw new Error('Unsupported AMX magic (' + header.magic + ')');
  }

  if (header.defsize !== 8) {
    throw new Error('Unsupported defsize (' + header.defsize + ')');
  }

	var cod = buffer.readInt32LE(12); // initial value of COD - code block

	header.dat = buffer.readInt32LE(16) - cod; // initial value of DAT - data block
	header.hea = buffer.readInt32LE(20) - cod; // initial value of HEA - start of the heap
	header.stp = buffer.readInt32LE(24) - cod; // initial value of STP - stack top
	header.cip = buffer.readInt32LE(28); // initial value of CIP - the instruction pointer

	var offset_publics =   buffer.readInt32LE(32); // offset to the "public functions" table
	var offset_natives =   buffer.readInt32LE(36); // offset to the "native functions" table
	var offset_libraries = buffer.readInt32LE(40); // offset to the table of libraries
	var offset_pubvars =   buffer.readInt32LE(44); // the "public variables" table
	var offset_tags =      buffer.readInt32LE(48); // the "public tagnames" table
	var offset_nametable = buffer.readInt32LE(52); // name table

	var num_publics =   (offset_natives   - offset_publics)   / 8;
	var num_natives =   (offset_libraries - offset_natives)   / 8;
	var num_libraries = (offset_pubvars   - offset_libraries) / 8;
	var num_pubvars =   (offset_tags      - offset_pubvars)   / 8;
	var num_tags =      (offset_nametable - offset_tags)      / 8;

  header.namelength = buffer.readUInt16LE(offset_nametable);

  var nametable = readNametable(buffer, offset_nametable, cod);

	header.publics   = readHeaderTable(buffer, offset_publics, nametable, offset_nametable, num_publics);
	header.natives   = readHeaderTable(buffer, offset_natives, nametable, offset_nametable, num_natives);
	header.libraries = readHeaderTable(buffer, offset_libraries, nametable, offset_nametable, num_libraries);
	header.pubvars   = readHeaderTable(buffer, offset_pubvars, nametable, offset_nametable, num_pubvars);
	header.tags      = readHeaderTable(buffer, offset_tags, nametable, offset_nametable, num_tags);

  var size = buffer.readInt32LE(0);

  var code = new Buffer(size - cod);
  var debug = null;

  buffer.copy(code, 0, cod, size);

  // Is debug information included?
  if (header.flags & AMX_FLAG_DEBUG && size < buffer.length)
    debug = readDebugSection(buffer, size);

  this.header = header;
  this.code = code;
  this.debug = debug;
};

function readDebugSection(buffer, offset) {
  var debug = {
    magic:          buffer.readUInt16LE(offset + 4), // signature, must be 0xf1ef
    file_version:   buffer.readUInt8   (offset + 6), // file format version
    amx_version:    buffer.readUInt8   (offset + 7), // required version of the AMX
    flags:          buffer.readUInt16LE(offset + 8), // currently unused

    files: [],
    lines: {},
    symbols: [],
    tags: [],
    automatons: [],
    states: []
  };

  if (debug.magic !== DEBUG_MAGIC) {
    throw new Error('Unsupported AMX debug magic (' + debug.magic + ')');
  }

  var num_files =      buffer.readUInt16LE(offset + 10); // number of entries in the "file" table
  var num_lines =      buffer.readUInt16LE(offset + 12); // number of entries in the "line" table
  var num_symbols =    buffer.readUInt16LE(offset + 14); // number of entries in the "symbol" table
  var num_tags =       buffer.readUInt16LE(offset + 16); // number of entries in the "tag" table
  var num_automatons = buffer.readUInt16LE(offset + 18); // number of entries in the "automaton" table
  var num_states =     buffer.readUInt16LE(offset + 20); // number of entries in the "state" table

  offset += 22;

  for (var i = 0; i < num_files; i++) {
    var name = readString(buffer, offset + 4, 1024);

    debug.files.push({
      address: buffer.readUInt32LE(offset),
      name: name
    });

    offset += 4 + name.length + 1;
  }

  for (var i = 0; i < num_lines; i++) {
    debug.lines[buffer.readInt32LE(offset)] = buffer.readUInt32LE(offset + 4);

    offset += 8;
  }

  for (var i = 0; i < num_symbols; i++) {
    var symbol = {
      address:   buffer.readUInt32LE(offset),      // address in the data segment or relative to the frame
      tag:       buffer.readUInt16LE(offset + 4),  // tag for the symbol
      codestart: buffer.readUInt32LE(offset + 6),  // address in the code segment from which this symbol is valid (in scope)
      codeend:   buffer.readUInt32LE(offset + 10), // address in the code segment until which this symbol is valid (in scope)
      ident:     buffer.readUInt8   (offset + 14), // kind of symbol (function/variable)
      vclass:    buffer.readUInt8   (offset + 15), // class of symbol (global/local)
      dim:       buffer.readUInt16LE(offset + 16)  // number of dimensions
    };

    offset += 18;

    symbol.name = readString(buffer, offset, 64);

    offset += symbol.name.length + 1;

    if (symbol.dim) {
      var dim = [];

      for (var d = symbol.dim; d > 0; d--) {
        dim.push({
          tag: buffer.readUInt16LE(offset),
          size: buffer.readUInt32LE(offset + 2)
        });

        offset += 6;
      }

      symbol.dim = dim;
    } else {
      symbol.dim = [];
    }

    debug.symbols.push(symbol);
  }

  for (var i = 0; i < num_tags; i++) {
    var name = readString(buffer, offset + 2, 64);

    debug.tags.push({
      id: buffer.readUInt16LE(offset),
      name: name
    });

    offset += 2 + name.length + 1;
  }

  for (var i = 0; i < num_automatons; i++) {
    var name = readString(buffer, offset + 6, 64);

    debug.automatons.push({
      id: buffer.readUInt16LE(offset),
      address: buffer.readUInt32LE(offset + 2),
      name: name
    });

    offset += 6 + name.length + 1;
  }

  for (var i = 0; i < num_states; i++) {
    var name = readString(buffer, offset + 4, 64);

    debug.states.push({
      id: buffer.readUInt16LE(offset),
      automaton: buffer.readUInt16LE(offset + 2),
      name: name
    });

    offset += 4 + name.length + 1;
  }

  return debug;
}

function readString(buffer, offset, maxlength) {
  var string = buffer.toString('utf8', offset, offset + maxlength);

  string = string.substr(0, string.indexOf('\0'));

  return string;
}

function readNametable(buffer, offset, end) {
  while (!buffer.readUInt8(end - 1)) {
    --end;
  }

  var rawValues = buffer.toString('utf8', offset + 2, end);
  var values = rawValues.split('\0');
  var positions = [0];

  var re = /\0/g;
  var match;

  while (null !== (match = re.exec(rawValues))) {
    positions.push(match.index + 1);
  }

  return {
    values: values,
    positions: positions
  };
}

function readHeaderTable(buffer, offset, nametable, offset_nametable, count) {
  var table = [];

  offset_nametable += 2;

  for (var i = 0; i < count; i++) {
    table.push({
      value: buffer.readUInt32LE(offset),
      name: nametable.values[
              nametable.positions.indexOf(
                buffer.readUInt32LE(offset + 4) - offset_nametable
              )
            ]
    });

    offset += 8;
  }

  return table;
}

function addToNametable(nametable, headerTable) {
  for (var i = 0, len = headerTable.length; i < len; i++) {
    var name = headerTable[i].name;

    if (nametable.values[name] === undefined) {
      nametable.values[name] = nametable.length;

      nametable.length += name.length + 1;
    }
  }
}

AMX.prototype.build = function () {
  var header = this.header, code = this.code, debug = this.debug;
  var size = 56;

  size += 8 * header.publics.length;
  size += 8 * header.natives.length;
  size += 8 * header.libraries.length;
  size += 8 * header.pubvars.length;
  size += 8 * header.tags.length;

  var nametable = {
    length: 0,
    values: {}
  };

  size += 2;

  addToNametable(nametable, header.publics);
  addToNametable(nametable, header.natives);
  addToNametable(nametable, header.libraries);
  addToNametable(nametable, header.pubvars);
  addToNametable(nametable, header.tags);

  size += nametable.length;

  nametable = nametable.values;

  var cod = size;

  size += code.length;

  var buffer, debugsize, debuglines;

  if (debug) {
    debugsize = 22;
    debuglines = Object.keys(debug.lines).length;

    for (var i = 0, len = debug.files.length; i < len; i++) {
      var file = debug.files[i];

      debugsize += 4 + file.name.length + 1;
    }

    debugsize += debuglines * 8;

    for (var i = 0, len = debug.symbols.length; i < len; i++) {
      var symbol = debug.symbols[i];

      debugsize += 18 + symbol.name.length + 1 + symbol.dim.length * 6;
    }

    for (var i = 0, len = debug.tags.length; i < len; i++) {
      debugsize += 2 + debug.tags[i].name.length + 1;
    }

    for (var i = 0, len = debug.automatons.length; i < len; i++) {
      debugsize += 6 + debug.automatons[i].name.length + 1;
    }

    for (var i = 0, len = debug.states.length; i < len; i++) {
      debugsize += 4 + debug.states[i].name.length + 1;
    }

    buffer = new Buffer(size + debugsize);
  } else {
    buffer = new Buffer(size);
  }

  buffer.writeInt32LE(size, 0);
  buffer.writeUInt16LE(header.magic, 4);
  buffer.writeUInt8(header.file_version, 6);
  buffer.writeUInt8(header.amx_version, 7);
  buffer.writeUInt16LE(header.flags, 8);
  buffer.writeUInt16LE(header.defsize, 10);
  buffer.writeInt32LE(cod, 12);
  buffer.writeInt32LE(cod + header.dat, 16);
  buffer.writeInt32LE(cod + header.hea, 20);
  buffer.writeInt32LE(cod + header.stp, 24);
  buffer.writeInt32LE(header.cip, 28);

  var offset_publics = 56;
  var offset_natives = offset_publics + 8 * header.publics.length;
  var offset_libraries = offset_natives + 8 * header.natives.length;
  var offset_pubvars = offset_libraries + 8 * header.libraries.length;
  var offset_tags = offset_pubvars + 8 * header.pubvars.length;
  var offset_nametable = offset_tags + 8 * header.tags.length;

	buffer.writeInt32LE(offset_publics, 32);
  buffer.writeInt32LE(offset_natives, 36);
  buffer.writeInt32LE(offset_libraries, 40);
  buffer.writeInt32LE(offset_pubvars, 44);
  buffer.writeInt32LE(offset_tags, 48);
  buffer.writeInt32LE(offset_nametable, 52);

  for (var i = 0, len = header.publics.length; i < len; i++) {
    buffer.writeUInt32LE(header.publics[i].value, offset_publics + i * 8);
    buffer.writeUInt32LE(offset_nametable + 2 + nametable[header.publics[i].name], offset_publics + i * 8 + 4);
  }

  for (var i = 0, len = header.natives.length; i < len; i++) {
    buffer.writeUInt32LE(header.natives[i].value, offset_natives + i * 8);
    buffer.writeUInt32LE(offset_nametable + 2 + nametable[header.natives[i].name], offset_natives + i * 8 + 4);
  }

  for (var i = 0, len = header.libraries.length; i < len; i++) {
    buffer.writeUInt32LE(header.libraries[i].value, offset_libraries + i * 8);
    buffer.writeUInt32LE(offset_nametable + 2 + nametable[header.libraries[i].name], offset_libraries + i * 8 + 4);
  }

  for (var i = 0, len = header.pubvars.length; i < len; i++) {
    buffer.writeUInt32LE(header.pubvars[i].value, offset_pubvars + i * 8);
    buffer.writeUInt32LE(offset_nametable + 2 + nametable[header.pubvars[i].name], offset_pubvars + i * 8 + 4);
  }

  for (var i = 0, len = header.tags.length; i < len; i++) {
    buffer.writeUInt32LE(header.tags[i].value, offset_tags + i * 8);
    buffer.writeUInt32LE(offset_nametable + 2 + nametable[header.tags[i].name], offset_tags + i * 8 + 4);
  }

  var names = Object.keys(nametable);

  buffer.writeUInt16LE(header.namelength, offset_nametable);

  if (names.length) {
    buffer.write(names.join('\0') + '\0', offset_nametable + 2);
  }

  code.copy(buffer, cod);

  if (debug) {
    var offset = cod + code.length;

    buffer.writeUInt32LE(debugsize, offset);
    buffer.writeUInt16LE(debug.magic, offset + 4);
    buffer.writeUInt8   (debug.file_version, offset + 6);
    buffer.writeUInt8   (debug.amx_version, offset + 7);
    buffer.writeUInt16LE(debug.flags, offset + 8);

    buffer.writeUInt16LE(debug.files.length, offset + 10);
    buffer.writeUInt16LE(debuglines, offset + 12);
    buffer.writeUInt16LE(debug.symbols.length, offset + 14);
    buffer.writeUInt16LE(debug.tags.length, offset + 16);
    buffer.writeUInt16LE(debug.automatons.length, offset + 18);
    buffer.writeUInt16LE(debug.states.length, offset + 20);

    offset += 22;

    for (var i = 0, len = debug.files.length; i < len; i++) {
      var file = debug.files[i];

      buffer.writeUInt32LE(file.address, offset);
      buffer.write(file.name + '\0', offset + 4);

      offset += 4 + file.name.length + 1;
    }

    for (var o in debug.lines) {
      buffer.writeInt32LE(+o, offset);
      buffer.writeInt32LE(debug.lines[o], offset + 4);

      offset += 8;
    }

    for (var i = 0, len = debug.symbols.length; i < len; i++) {
      var symbol = debug.symbols[i];

      buffer.writeUInt32LE(symbol.address, offset);
      buffer.writeUInt16LE(symbol.tag, offset + 4);
      buffer.writeUInt32LE(symbol.codestart, offset + 6);
      buffer.writeUInt32LE(symbol.codeend, offset + 10);
      buffer.writeUInt8   (symbol.ident, offset + 14);
      buffer.writeUInt8   (symbol.vclass, offset + 15);
      buffer.writeUInt16LE(symbol.dim.length, offset + 16);

      offset += 18;

      buffer.write(symbol.name + '\0', offset);

      offset += symbol.name.length + 1;

      for (var j = 0; j < symbol.dim.length; j++) {
        var dim = symbol.dim[j];

        buffer.writeUInt16LE(dim.tag, offset);
        buffer.writeUInt32LE(dim.size, offset + 2);

        offset += 6;
      }
    }

    for (var i = 0, len = debug.tags.length; i < len; i++) {
      var tag = debug.tags[i];

      buffer.writeUInt16LE(tag.id, offset);
      buffer.write(tag.name + '\0', offset + 2);

      offset += 2 + tag.name.length + 1;
    }

    for (var i = 0, len = debug.automatons.length; i < len; i++) {
      var automaton = debug.automatons[i];

      buffer.writeUInt16LE(automaton.id, offset);
      buffer.writeUInt32LE(automaton.address, offset + 2);
      buffer.write(automaton.name + '\0', offset + 6);

      offset += 6 + automaton.name.length + 1;
    }

    for (var i = 0, len = debug.states.length; i < len; i++) {
      var state = debug.states[i];

      buffer.writeUInt16LE(state.id, offset);
      buffer.writeUInt16LE(state.automaton, offset + 2);
      buffer.write(state.name + '\0', offset + 4);

      offset += 4 + state.name.length + 1;
    }
  }

  return buffer;
};

AMX.IDENT_VARIABLE  = IDENT_VARIABLE;
AMX.IDENT_REFERENCE = IDENT_REFERENCE;
AMX.IDENT_ARRAY     = IDENT_ARRAY;
AMX.IDENT_REFARRAY  = IDENT_REFARRAY;
AMX.IDENT_FUNCTION  = IDENT_FUNCTION;

AMX.FLAG_DEBUG    = AMX_FLAG_DEBUG;
AMX.FLAG_COMPACT  = AMX_FLAG_COMPACT;
AMX.FLAG_BYTEOPC  = AMX_FLAG_BYTEOPC;
AMX.FLAG_NOCHECKS = AMX_FLAG_NOCHECKS;
AMX.FLAG_NTVREG   = AMX_FLAG_NTVREG;
AMX.FLAG_JITC     = AMX_FLAG_JITC;
AMX.FLAG_BROWSE   = AMX_FLAG_BROWSE;
AMX.FLAG_RELOC    = AMX_FLAG_RELOC;

AMX.AMX_MAGIC   = AMX_MAGIC;
AMX.DEBUG_MAGIC = DEBUG_MAGIC;

module.exports = AMX;