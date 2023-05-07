"use strict"

var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing
var log = require('loglevel');
const Airsync = require("./airtableSync");

// log.trace(msg)
// log.debug(msg)
// log.info(msg)
// log.warn(msg)
// log.error(msg)
// This disables all logging below the given level, so that 
// after a log.setLevel("warn") call log.warn("something") or 
// log.error("something") will output messages, 
// but log.info("something") will not.
log.setLevel("debug")

// Table name that is being updated
const tableName = "Todo";
const viewName = "Main TODO (personal)"

// Airtable can only run 5 operations per second (supposedly)
// 15 per second runs fine though
Airsync.createBottlenecks(tableName); 

const tableIdentifiers = ["Todo"];
let queryParams = {
    "view":"Main TODO (BOTH)",
    "fields": ["Todo","Category","Priority","done","Bring back on","Last Modified"]
};
let tableEffectives = ["Todo", "Category","Priority"];

Airsync.getAirtable(tableName, queryParams, tableIdentifiers, tableEffectives)
.then(function(values) {
    log.info(values)
    log.info("AirTable records retrieved:", values.length)
    // for (var key in records){
    //     let record = records[key]
    //     if (record['done'] != true ){
    //         log.info(records[key] );
    //     }
        
    //   }
    // records.forEach(function (record) {
    //     log.info(record)
    // });

})