"use strict"

var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing
var log = require('loglevel');
const AirtableTableSync = require('./AirtableTableSync');

log.setLevel("debug")

let base = new AirtableTableSync({
    apiKey:"keyvjbVyJKBdcU2qR", 
    base:"appceewzmZJYSMZKm",
    table:"Todo"
});

let selectParams = {
    "view":"Main TODO (BOTH)",
    "fields": ["Todo","Category","Priority","done","Bring back on","Last Modified","Automation Log"]
}

base.getAirtable(selectParams).then(function(records) {
    let updates=0
    console.log(records)
    records.forEach(function (record) {
        // console.log(record)
    })
})

process.exit()

////////////////////////////////////////////
// daysSince today
Date.prototype.daysSince = function() {
    var date = new Date(this.valueOf());
    var today = new Date();
    return (today-date)/(60*60*24*1000);
}

// Table name that is being updated
const tableName = "Todo";
const viewName = "Main TODO (BOTH)"

const tableIdentifiers = ["Todo"];
let queryParams = {
    "view":viewName,
    "fields": ["Todo","Category","Priority","done","Bring back on","Last Modified","Automation Log"]
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
                let today = (new Date()).toLocaleDateString();
                let msg = `${today}: From ${fromPriority} to ${toPriority} because ${days} days elapsed\n` 
                log.info(msg)
                console.log("")
                let note = record["Automation Log"]??""
                note += msg
                let obj = {"Priority":toPriority,"Automation Log":note}
                Airsync.updateAirtableObj(tableName, obj, record.id)
                updates++
            }
        }

        // update(   1, "Urgent",    "Today")
        // update(   1, "Today",     "Very soon") 
        // update(   1, "Very soon", "Soon")
        // update(   1, "Soon",      "Some day")
        // update(   1, "Some day",  "Stale?")


        // update(   5, "Urgent",    "Today")
        // update(   5, "Today",     "Very soon") 
        // update(   5, "Very soon", "Soon")
        // update(   5, "Soon",      "Some day")
        // update(   5, "Some day",  "Stale?")

        update(   2, "Urgent",    "Today")
        update(   4, "Today",     "Very soon") 
        update(   20, "Very soon", "Soon")
        update( 2*30, "Soon",      "Some day")
        update( 4*30, "Some day",  "Stale?")

    });
    log.info("AirTable records retrieved:", records.length)
    log.info("AirTable records updated:", updates)

})