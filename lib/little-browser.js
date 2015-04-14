;(function(define){define(function(require,exports,module){
'use strict';

/**
 * Dependencies
 */

var component = require('gaia-component');
var threads = require('threads');

/**
 * Simple logger
 *
 * @type {Function}
 */

var debug = 0 ? console.log.bind(console, '[little-browser]') : function() {};

/**
 * Register the element.
 *
 * @return {Element} constructor
 */

var LittleBrowserProtoype = {

  /**
   * Called when the element is first created.
   *
   * Here we create the shadow-root and
   * inject our template into it.
   *
   * @private
   */

  created: function() {
    debug('created');
    this.setupShadowRoot();

    // Use a private class so not
    // to expose internal details
    var internal = new Private(this);

    // Expose some APIs publically
    this.getMetaData = internal.getMetaData.bind(internal);
    this.navigate = internal.navigate.bind(internal);
    this.back = internal.back.bind(internal);
    this.forward = internal.forward.bind(internal);
    this.history = internal.history;
  },

  attrs: {},

  template: `
    <div class="inner">
      <content></content>
    </div>

    <style>

      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;

        position: absolute;
      }

      iframe {
        position: absolute;
        left: 0;
        top: 0;

        width: 100%;
        height: 100%;

        border: 0;
        border-right: solid 1px #ddd;
      }

    </style>`
};

/**
 * Internal API
 */

function Private(el) {
  this.el = el;


  this.frames = {};
  this.maxHistory = 10;
  this.historyIndex = -1;
  this.history = [];
  this.current = null;

  this.els = {
    inner: this.el.shadowRoot.querySelector('.inner')
  };

  this.onbridgeevent = this.onbridgeevent.bind(this);
  addEventListener('visibilitychange', e => this.onVisibilityChange(e));
}

Private.prototype = {
  onVisibilityChange: function(e) {
    if (e.target.hidden) this.onHidden();
    else this.onVisible();
  },

  onHidden: function() {
    debug('hidden');
    // this.unloadHiddenFrames();
  },

  onVisible: function() {
    debug('visible');
  },

  getFrame: function(url) {
    debug('get frame', url);
    url = parseUrl(url);

    if (this.frames[url.file]) return this.frames[url.file];

    var thread = threads.create({
      src: url.full,
      type: 'window',
      parentNode: this.el.shadowRoot
    });

    var client = threads.client('little-browser', { thread: thread });
    var frame = this.frames[url.file] = {
      el: thread.process,
      client: client,
      loaded: false,
      url: url
    };

    client.on('linkclicked', e => this.onLinkClicked(e));
    client.on('submit', e => this.onFormSubmit(e));
    return frame;
  },

  getMetaData: function(frame) {
    debug('get meta data', frame);
    return frame.client.call('getMetaData');
  },

  navigate: function(url, options) {
    debug('navigate', url, options);
    var currentUrl = this.current && this.current.url.full;

    if (url == null) return;
    if (url == currentUrl) return;

    if (this.isPreviousState(url)) return this.back();
    if (this.isNextState(url)) return this.forward();

    debug('navigating %s -> %s', currentUrl, url);

    var pushState = (options && options.pushState) !== false;
    var dir = options && options.dir || 'next';

    var next = this.getFrame(url);
    var prev = this.current;

    // Sometimes we may be recycling an existing
    // frame but the hash may have changed,
    // in which case we want to update it.
    // This shouldn't cause the iframe to refresh.
    if (next.url.full !== url) {
      next.client.call('pushState', url);
      next.url = parseUrl(url);
    }

    var nextFrom = { next: 1, prev: -1 }[dir || 1];
    var prevTo = nextFrom === 1 ? -1 : 1;

    this.unload(prev, prevTo);
    this.load(next, nextFrom);

    this.current = next;
    this.el.src = url;

    if (pushState) this.pushState(url, nextFrom);

    this.prerender();
    this.dispatch('navigate');
  },

  load: function(frame, from) {
    if (!frame) return;
    debug('load', frame, from);
    var duration = this.firstLoad() ? 0 : null;
    this.transitionFrame(frame, from, 0, { duration: duration });
    this.getMetaData(frame).then(metadata => {
      debug('metadata', metadata);
      this.metadata = metadata;
      frame.loaded = true;
      this.dispatch('changed', metadata);
    });
  },

  unload: function(frame, to) {
    debug('unload');
    if (!frame) return;
    this.transitionFrame(frame, 0, to);
  },

  back: function() {
    if (this.atFirstHistorySlot()) return;
    var current = this.history[this.historyIndex];
    var record = this.history[--this.historyIndex];
    var dir = { '-1': 'prev', '1': 'next' }[0 - current.fromPos];
    debug('back', this.historyIndex, dir);
    this.navigate(record.url, { dir: dir, pushState: false });
  },

  forward: function() {
    if (this.atLastHistorySlot()) return;
    var record = this.history[++this.historyIndex];
    var dir = { '-1': 'prev', '1': 'next' }[record.fromPos];
    debug('forward', this.historyIndex, dir);
    this.navigate(record.url, { dir: dir, pushState: false });
  },

  isPreviousState: function(url) {
    var prev = this.history[this.historyIndex - 1];
    return prev && prev.url === url;
  },

  isNextState: function(url) {
    var next = this.history[this.historyIndex + 1];
    return next && next.url === url;
  },

  atLastHistorySlot: function() {
    return this.historyIndex === this.historyLength -1;
  },

  atFirstHistorySlot: function() {
    return this.historyIndex === 0;
  },

  firstLoad: function() {
    return !this.history.length;
  },

  pushState: function(url, from) {

    // Wipe any future history slots
    this.history.splice(this.historyIndex + 1);

    this.history.push({
      url: url,
      fromPos: from
    });

    // Cap history length
    if (this.history.length > this.maxHistory) this.history.shift();
    else this.historyIndex++;

    debug('push state', this.historyIndex, this.history);
  },

  onbridgeevent: function(data, name) {
    debug('bridge event', name, data);
    this.dispatch(name, data);
  },

  prerender: function() {
    this.current.client.call('querySelectorAll', {
      selector: 'link[rel=prerender]',
      properties: ['href']
    }).then(els => {
      debug('prerendering', els);
      els.forEach(el => {
        var frame = this.getFrame(el.href);
        if (frame === this.current) return;
        if (frame.loaded) return;
        this.positionFrame(frame, 1);
      });
    });
  },

  dispatch: function(name, detail) {
    this.el.dispatchEvent(new CustomEvent(name, { detail: detail }));
  },

  transitionFrame: function(frame, from, to, options) {
    debug('transition frame', frame, from, to);
    return new Promise(resolve => {
      if (!frame) return resolve();
      var duration = options && options.duration != null || 300;
      var el = frame.el;
      el.style.transitionDuration = '0ms';
      this.positionFrame(frame, from);
      this.reflow = el.offsetTop;
      el.style.transitionDuration = duration + 'ms';
      this.positionFrame(frame, to);
      el.addEventListener('transitionend', function fn() {
        el.removeEventListener('transitionend', fn);
        resolve();
      });
    });
  },

  onLinkClicked: function(data) {
    debug('link click', data);
    this.navigate(data.href, { dir: data.rel });
  },

  onFormSubmit: function(data) {
    debug('form submit', data);
    this.navigate(data.action + data.params);
  },

  positionFrame: function(frame, pos) {
    pos = normalizeDir(pos);
    frame.el.style.transform = `translateX(${pos * 100}%)`;
    frame.positioned = true;
    debug('frame positioned', frame.el.style.transform, pos);
  },

  unloadHiddenFrames: function() {
    for (var url in this.frames) {
      var frame = this.frames[url];
      if (frame !== this.current) {
        frame.el.remove();
      }
    }
  },

  loadUnloadedFrames: function() {
    // this.frames.forEach(frame => {
    //   if (frame !== current) {
    //   }
    // });
  }
};

/**
 * Register the element
 */

module.exports = component.register('little-browser', LittleBrowserProtoype);

/**
 * Utils
 */

function normalizeDir(value) {
  return rtl() ? 0 - value : value;
}

function rtl() {
  return document.dir === 'rtl';
}

function parseUrl(url) {
  var a = document.createElement('a');
  a.href = url;
  return {
    full: url,
    origin: a.origin,
    pathname: a.pathname,
    search: a.search,
    hash: a.hash,
    file: a.origin + a.pathname,
    hashless: a.origin + a.pathname + a.search
  };
}

});})(typeof define=='function'&&define.amd?define
:(function(n,w){return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('little-browser',this));
