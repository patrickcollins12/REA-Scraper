"use strict"

var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing
var log = require('loglevel');
const Airsync = require("./airtableSync");

log.setLevel("debug")


// Table name that is being updated
const scheduleTable = "Todo";

// Airsync.getAirtable(scheduleTable, {}, tableIdentifiers)
// .then(function(records) {
//     let updates=0
//     console.log(records)
//     records.forEach(function (record) {
//         // console.log(record)
//     })
// })

// process.exit()

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

// Airtable can only run 5 operations per second (supposedly)
// 15 per second runs fine though
Airsync.createBottlenecks(tableName); 

const tableIdentifiers = ["Todo"];
let queryParams = {
    "view":viewName,
    "fields": ["Todo","Category","Priority","done","Bring back on","Last Modified","Automation Log"]
};

// go through the "Todo" > "Main TODO (BOTH)" view, record-at-a-time
Airsync.getAirtable(tableName, queryParams, tableIdentifiers)
.then(function(records) {
    let updates=0
    let today = (new Date()).toLocaleDateString();

    records.forEach(function (record) {
        let priority = record["Priority"]        
        let bbo = record["Bring back on"] 
        let sinceDate
        let since

        ///////////////////
        // Auto deprioritise after specific days
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

        // how many days before deprioritising to the next Priority
        update(   2, "Urgent",    "Today")
        update(   4, "Today",     "Very soon") 
        update(   20, "Very soon", "Soon")
        update( 2*30, "Soon",      "Some day")
        update( 4*30, "Some day",  "Stale?")

        /////////////////////
        // update Priority from Tomorrow to Today between 4-6am AEST
        if (priority == "Tomorrow") {
            // process.env.TZ = 'Australia/Sydney'
            const utc_hr = new Date().getUTCHours();
            
            // 12pm AEST =  2am UTC (0200)
            //  9pm AEST = 11am UTC (1100)
            //  4am AEST =  6pm UTC (1800)
            //  5am AEST =  7pm UTC (1900)
            //  6am AEST =  8pm UTC (2000)

            if (18 <= utc_hr && utc_hr <= 19) {
                log.info("Tomorrow => Today: " + record.id + " " + utc_hr )
                let note = record["Automation Log"]??""
                note += `${today}: Promoted from Tomorrow to Today\n`
                let obj = {"Priority":"Today","Automation Log":note}
                Airsync.updateAirtableObj(tableName, obj, record.id)
            }
        }

    });
    log.info("AirTable records retrieved:", records.length)
    log.info("AirTable records updated:", updates)

})