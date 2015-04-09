define((require, module, exports) => {

/**
 * Dependencies
 */

var threads = require('threads');

require('../../../lib/runtime');
require('l10n');

threads.service('add-view', {
  submit: () => {
    document.body.innerHTML = 'submitted';
  }
});

});
