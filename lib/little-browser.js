;(function(define){define(function(require,exports,module){
'use strict';

/**
 * Dependencies
 */

var component = require('gaia-component');
var threads = require('threads');

/**
 * Simple logger
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
    this.getTitle = internal.getTitle.bind(internal);
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
    this.unloadHiddenFrames();
  },

  onVisible: function() {
    debug('visible');
  },

  getAvailableFrame: function() {
    return this.els.frames.find(el => el !== this.current)
      || this.addFrame();
  },

  fetchWindow: function(url) {
    debug('get window', url);
    if (this.frames[url]) return this.frames[url];

    var thread = threads.create({
      src: url,
      type: 'window',
      parentNode: this.el.shadowRoot
    });

    var client = threads.client('little-browser', { thread: thread });
    var frame = this.frames[url] = {
      el: thread.process,
      url: url,
      client: client
    };

    client.on('linkclicked', e => this.onLinkClicked(e));
    return frame;
  },

  getTitle: function() {
    debug('get title');
    if (!this.current) return;
    return this.current.client.call('querySelector', {
      selector: 'title',
      properties: ['textContent']
    }).then(el => el.textContent);
  },

  getMetaData: function(frame) {
    return frame.client.call('getMetaData');
  },

  navigate: function(url, options) {
    debug('navigate', url, options);
    if (url == null) return;
    if (this.current && url === this.current.el.src) return;

    var pushState = (options && options.pushState) !== false;
    var dir = (options && options.dir) || 'next';

    var prev = this.current;
    var next = this.fetchWindow(url);
    var nextFrom = { next: 1, prev: -1 }[dir || 1];
    var prevTo = nextFrom === 1 ? -1 : 1;


    this.unload(prev, prevTo);
    this.load(next, nextFrom);

    this.current = next;

    if (pushState) this.pushState(url, nextFrom);
    this.prerender();
  },

  load: function(frame, from) {
    if (!frame) return;
    this.transitionFrame(frame.el, from, 0);
    this.getMetaData(frame).then(metadata => {
      debug('metadata', metadata);
      this.metadata = metadata;
      this.dispatch('metadata', metadata);
    });
  },

  unload: function(frame, to) {
    debug('unload');
    if (!frame) return;
    this.transitionFrame(frame.el, 0, to);
    frame.client.off('*', this.onbridgeevent);
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

  atLastHistorySlot: function() {
    return this.historyIndex === this.historyLength -1;
  },

  atFirstHistorySlot: function() {
    return this.historyIndex === 0;
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
        if (this.frames[el.href]) return;
        var frame = this.fetchWindow(el.href);
        this.positionFrame(frame.el, 1);
      });
    });
  },

  dispatch: function(name, detail) {
    this.el.dispatchEvent(new CustomEvent(name, { detail: detail }));
  },

  transitionFrame: function(el, from, to) {
    debug('transition frame', el, from, to);
    return new Promise(resolve => {
      if (!el) return resolve();
      el.style.transitionDuration = '0ms';
      this.positionFrame(el, from);
      this.reflow = el.offsetTop;
      el.style.transitionDuration = '300ms';
      this.positionFrame(el, to);
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

  positionFrame: function(el, pos) {
    pos = normalizeDir(pos);
    el.style.transform = `translateX(${pos * 100}%)`;
    debug('frame positioned', el.style.transform, pos);
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

});})(typeof define=='function'&&define.amd?define
:(function(n,w){return typeof module=='object'?function(c){
c(require,exports,module);}:function(c){var m={exports:{}};c(function(n){
return w[n];},m.exports,m);w[n]=m.exports;};})('little-browser',this));
