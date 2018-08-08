'use strict';
var log = require('loglevel');
log.setLevel("info")

module.exports.rea = (event, context, callback) => {
  var rea = require('./REA-ListingDates');

  callback(null, "Running now.");
};


module.exports.hello = (event, context, callback) => {

  // console.log("Testing")
  // log.warn("Blah")
  // console.log(context)
  // console.log(event)

  // const response = {
  //   statusCode: 200,
  //   body: JSON.stringify({
  //     message: 'Go Serverless v1.0! Your function executed successfully!',
  //     input: event,
  //   }),
  // };

  callback(null, "Worked great.");

};
