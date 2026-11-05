'use strict';
const P = require('../common/procs');
const { DIRS } = require('./env');

module.exports = async () => {
  for (const svc of ['order', 'payment', 'inventory']) P.killProcess(DIRS.runDir, svc);
};
