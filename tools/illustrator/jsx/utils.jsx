/**
 * ExtendScript utilities for JSON communication with Node.js.
 * ExtendScript lacks native JSON, so we provide manual implementations.
 */

function readJSON(filePath) {
  var f = new File(filePath);
  if (!f.exists) return null;
  f.open('r');
  var content = f.read();
  f.close();
  try {
    return eval('(' + content + ')');
  } catch (e) {
    return null;
  }
}

function writeJSON(filePath, obj) {
  var f = new File(filePath);
  f.open('w');
  f.write(jsonStringify(obj));
  f.close();
}

function jsonStringify(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'number') return isNaN(obj) ? 'null' : String(obj);
  if (typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'string') {
    return '"' + obj
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') + '"';
  }
  if (obj instanceof Array) {
    var items = [];
    for (var i = 0; i < obj.length; i++) {
      items.push(jsonStringify(obj[i]));
    }
    return '[' + items.join(',') + ']';
  }
  if (typeof obj === 'object') {
    var pairs = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        pairs.push('"' + key + '":' + jsonStringify(obj[key]));
      }
    }
    return '{' + pairs.join(',') + '}';
  }
  return String(obj);
}

// Shared constants
var ARMADO_INPUT = '/tmp/armado_input.json';
var ARMADO_OUTPUT = '/tmp/armado_output.json';

function cmToPoints(cm) { return cm * 28.3465; }
function pointsToCm(points) { return points / 28.3465; }

// Red color detection (from ARMADO.jsx)
var CUT_LINE_COLOR = { r: 227, g: 19, b: 27, tolerance: 50 };

function isRedColor(color) {
  if (!color) return false;
  var r, g, b;
  if (color.typename === 'RGBColor') {
    r = color.red; g = color.green; b = color.blue;
  } else if (color.typename === 'CMYKColor') {
    r = 255 * (1 - color.cyan / 100) * (1 - color.black / 100);
    g = 255 * (1 - color.magenta / 100) * (1 - color.black / 100);
    b = 255 * (1 - color.yellow / 100) * (1 - color.black / 100);
  } else return false;

  var tol = CUT_LINE_COLOR.tolerance;
  var redMatch = Math.abs(r - CUT_LINE_COLOR.r) < tol;
  var greenMatch = Math.abs(g - CUT_LINE_COLOR.g) < tol;
  var blueMatch = Math.abs(b - CUT_LINE_COLOR.b) < tol;
  var isPureRed = (r > 200 && g < 50 && b < 50);

  return (redMatch && greenMatch && blueMatch) || isPureRed;
}

function findRedBoundary(items) {
  var bounds = null;
  function checkItem(item) {
    if (item.typename === 'PathItem' && item.stroked && isRedColor(item.strokeColor)) {
      var b = item.geometricBounds;
      if (!bounds) bounds = [b[0], b[1], b[2], b[3]];
      else {
        bounds[0] = Math.min(bounds[0], b[0]);
        bounds[1] = Math.max(bounds[1], b[1]);
        bounds[2] = Math.max(bounds[2], b[2]);
        bounds[3] = Math.min(bounds[3], b[3]);
      }
    } else if (item.typename === 'CompoundPathItem' && item.pathItems.length > 0) {
      var fp = item.pathItems[0];
      if (fp.stroked && isRedColor(fp.strokeColor)) {
        var b = item.geometricBounds;
        if (!bounds) bounds = [b[0], b[1], b[2], b[3]];
        else {
          bounds[0] = Math.min(bounds[0], b[0]);
          bounds[1] = Math.max(bounds[1], b[1]);
          bounds[2] = Math.max(bounds[2], b[2]);
          bounds[3] = Math.min(bounds[3], b[3]);
        }
      }
    } else if (item.typename === 'GroupItem') {
      for (var i = 0; i < item.pageItems.length; i++) checkItem(item.pageItems[i]);
    }
  }
  for (var i = 0; i < items.length; i++) checkItem(items[i]);
  return bounds;
}

function getSelectionBounds(items) {
  var bounds = null;
  for (var i = 0; i < items.length; i++) {
    var b = items[i].geometricBounds;
    if (!bounds) bounds = [b[0], b[1], b[2], b[3]];
    else {
      bounds[0] = Math.min(bounds[0], b[0]);
      bounds[1] = Math.max(bounds[1], b[1]);
      bounds[2] = Math.max(bounds[2], b[2]);
      bounds[3] = Math.min(bounds[3], b[3]);
    }
  }
  return bounds;
}
