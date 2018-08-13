// Lambda main
module.exports.rea = (event, context, callback) => {

  // TODO. Don't be lazy bastard, turn this into a module.
  var rea = require('./REA-ListingDates');

  // Exit early while it runs async
  callback(null, "Running now.");
};