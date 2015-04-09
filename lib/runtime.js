;(function(define){define(function(require,exports,module){
'use strict';

/**
 * Dependencies
 */

var threads = require('threads');

/**
 * Locals
 */

var debug = 0 ? console.log.bind(console, '[runtime]') : function() {};
var isIframe = window.parent != window;

if (!isIframe) return;

// little-browser can pass the client
// uuid in window.name so that the
// server can connect straight away
// var client = window.name;
// if (client) server.connect(client);

var service = threads.service('little-browser', {
  querySelector: options => {
    debug('querySelector', options);
    var el = document.querySelector(options.selector);
    if (!el) return null;
    return pick(el, options);
  },

  querySelectorAll: options => {
    debug('querySelectorAll', options);
    var els = document.querySelectorAll(options.selector);
    return [].map.call(els, el => pick(el, options));
  }
});

/**
 * Propagate link clicks
 */

addEventListener('click', e => {
  debug('link click', e);
  var link = e.target.closest('a');
  if (!link) return;
  e.preventDefault();
  service.broadcast('linkclicked', pick(link, {
    properties: ['href'],
    attributes: ['rel']
  }));
}, true);

/**
 * Dispatch 'localized' event
 */

var l10n = navigator.mozL10n;
if (!l10n || l10n.readyState === 'complete') service.broadcast('localized');
addEventListener('localized', () => service.broadcast('localized'));

/**
 * Utils
 */

function pick(el, options) {
  var props = options.properties || [];
  var attrs = options.attributes || [];
  var result = {};
  attrs.forEach(attr => result[attr] = el.getAttribute(attr));
  props.forEach(prop => result[prop] = el[prop]);
  return result;
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('little-browser-runtime',this));
