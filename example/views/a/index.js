define((require, module, exports) => {

require('../../../lib/runtime');
require('l10n');


addEventListener('visibilitychange', e => {
  console.log('XXX', e.target.hidden);
});

});
