define(function(require, exports, module) {

/**
 * Dependencies
 */

require('gaia-header');
require('../lib/little-browser');

var threads = require('threads');

/**
 * Micro logger
 * @type {Function}
 */
var debug = 0 ? console.log.bind(console,'[app]'):()=>{};

var els = {
  webview: document.querySelector('little-browser'),
  header: document.querySelector('gaia-header'),
  title: document.querySelector('gaia-header h1'),
  buttons: []
};

var pageClient = null;
var nav;


els.header.addEventListener('action', () => {
  if (nav.link === 'referrer') {
    setUrl(els.webview.referrer);
    // els.webview.navigate(els.webview.referrer, { dir: 'back');
  }
});

els.webview.addEventListener('linkclicked', e => {
  debug('link clicked', e);
  setUrl(e.detail.href);
});

addEventListener('hashchange', updateWebview);

function setUrl(url) {
  location.hash = `/${pathname(url)}`;
}

function updateWebview() {
  debug('update web view');
  var origin = location.origin;
  var pathname = location.pathname;
  var hash = location.hash.replace('#/', '');
  var src = origin + pathname + hash;
  els.webview.navigate(src);
  updateHeader();
  debug('navigated webview', src);
}

// Initial page
updateWebview();


els.webview.addEventListener('localized', updateHeader);

function updateHeader() {
  updateButtons();
  updateTitle();
}

function updateTitle() {
  els.webview.getTitle().then(title => {
    debug('got title', title);
    els.title.textContent = title;
  });
}

function updateButtons() {
  els.webview.getMetaData().then(result => {
    var meta = toObject(result);
    debug('got metadata', meta);
    nav = meta.navigation;
    addActions(meta.action);
    els.header.action = nav && nav.type;

    pageClient = meta.service ? threads.client(meta.service) : null;
  });
}

function pathname(url) {
  var a = document.createElement('a');
  a.href = url;
  return a.pathname.replace(location.pathname, '');
}

function addActions(metadata) {
  els.buttons.forEach(el => el.remove());
  els.buttons = [];

  for (var key in metadata) {
    var el = document.createElement('a');
    var action = metadata[key];

    if (action.link) el.href = `#/${action.link}`;

    if (action.icon) el.dataset.icon = action.icon;
    else el.textContent = action.title;

    if (action.on) {
      for (var event in action.on) {
        el.addEventListener(event, serviceCaller(action.on[event]));
      }
    }

    els.header.appendChild(el);
    els.buttons.push(el);
  }
}

function serviceCaller(method) {
  return function() {
    pageClient.call(method);
  };
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

});
