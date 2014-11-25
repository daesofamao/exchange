
var utils = this;

exports.createRandomId = function() {
  var randomId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    //generate an RFC4122 version 4 compliant unique random id
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
	});
	return randomId;
}

exports.stripWhiteSpaceFromEnds = function(s) {
  return s.replace(/^\s+|\s+$/g, "");
}

exports.normalizeSymbol = function(s) {
  return utils.stripWhiteSpaceFromEnds(s.toString().toUpperCase());
}

exports.roundTo2Decimals = function(num) {
  num = Number(num);
  return + (Math.round(num + "e+2")  + "e-2");
}

exports.monetize = function(num) {
  num = Number(num);
  return '$' + (num.toFixed(2));
}

