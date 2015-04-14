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
  },

  getMetaData: function() {
    debug('get metadata');
    var els = document.querySelectorAll('meta[property]');
    var meta = [].map.call(els, el => pick(el, {
      attributes: ['content', 'property']
    }));

    meta = toObject(meta);
    meta.title = document.title;
    return meta;
  },

  pushState: function(value) {
    debug('push state', value);
    history.pushState({}, '', value);

    // Not fired nativiely by history api
    window.dispatchEvent(new Event('pushstate'));
  }
});

/**
 * Propagate link clicks
 */

addEventListener('click', e => {
  var link = e.target.closest('a');
  if (!link) return;
  debug('link click', e);
  e.preventDefault();
  service.broadcast('linkclicked', pick(link, {
    properties: ['href'],
    attributes: ['rel']
  }));
}, true);

addEventListener('submit', e => {
  var form = e.target;
  debug('form submit', form);
  e.preventDefault();
  service.broadcast('submit', {
    method: form.method,
    action: form.action,
    params: serializeForm(form)
  });
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

function serializeForm(form) {
  var result = '?';
  [].forEach.call(form.elements, el => {
    if (el.name) result += (el.name + '=' + el.value);
  });
  return result;
}

function toObject(metadata) {
  var result = {};

  metadata.forEach(item => {
    var path = item.property.split(':');
    var level = result;
    var prev;
    var key;

    path.forEach(k => {
      key = k;
      level[key] = level[key] || {};
      prev = level;
      level = level[key];
    });

    prev[key] = item.content;
  });

  return result;
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){'use strict';return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('little-browser-runtime',this));
