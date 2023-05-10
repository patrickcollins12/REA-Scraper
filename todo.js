"use strict"

var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing
var log = require('loglevel');
const Airsync = require("./airtableSync");

log.setLevel("debug")

// Table name that is being updated
const tableName = "Todo";
const viewName = "Main TODO (BOTH)"

// Airtable can only run 5 operations per second (supposedly)
// 15 per second runs fine though
Airsync.createBottlenecks(tableName); 

// daysSince today
Date.prototype.daysSince = function() {
    var date = new Date(this.valueOf());
    var today = new Date();
    return (today-date)/(60*60*24*1000);
}

const tableIdentifiers = ["Todo"];
let queryParams = {
    "view":viewName,
    "fields": ["Todo","Category","Priority","done","Bring back on","Last Modified"]
};

Airsync.getAirtable(tableName, queryParams, tableIdentifiers)
.then(function(records) {
    let updates=0

    records.forEach(function (record) {
        let priority = record["Priority"]        
        let bbo = record["Bring back on"] 
        let sinceDate
        let since

        if (bbo) {
            sinceDate  = new Date(bbo + "T00:00:00+1000")
        } else {
            sinceDate  = new Date(record["Last Modified"])
        }
        since = sinceDate.daysSince() 

        function update(days, fromPriority, toPriority) {
            if (since > days && priority == fromPriority) {
                log.info(record)
                log.info("Since Date: " + sinceDate + ", Since:"+since)
                log.info(`Updating ${record.id} from ${fromPriority} to ${toPriority} because ${days} days elapsed`)
                console.log("")
                Airsync.updateAirtableObj(tableName,{"Priority":toPriority}, record.id)
                updates++
            }
        }

        update(   2, "Urgent",    "Today")
        update(   4, "Today",     "Very soon") 
        update(   20, "Very soon", "Soon")
        update( 2*30, "Soon",      "Some day")
        update( 4*30, "Some day",  "Stale?")

    });
    log.info("AirTable records retrieved:", records.length)
    log.info("AirTable records updated:", updates)

})