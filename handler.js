// Lambda main
module.exports.todo = (event, context, callback) => {

  // TODO. Don't be lazy bastard, turn this into a module.
  var rea = require('./todo.js');

  // Exit early while it runs async
  callback(null, "Running now.");
};