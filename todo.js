"use strict"

// var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing
var log = require('loglevel');
const Airsync = require("./airtableSync");

log.setLevel("debug")


// Table name that is being updated
const scheduleTable = "Todo";

////////////////////////////////////////////
// daysSince today
Date.prototype.daysSince = function() {
    var date = new Date(this.valueOf());
    var today = new Date();
    return (today-date)/(60*60*24*1000);
}

// Table name that is being updated
const tableName = "Todo";
const viewName = "All Todos (Combined)"

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
    const utc_hr = new Date().getUTCHours();
    const utc_day = new Date().getUTCDay();

    records.forEach(function (record) {
        let priority = record["Priority"]        
        let bbo = record["Bring back on"] 
        let sinceDate
        let since

        ///////////////////
        // Auto deprioritise after specific days

        // Default strategy is to use the LM date for deprioritisation
        let lm  = new Date(record["Last Modified"])
        sinceDate = lm

        // LM can get stale when used with BBO.
        // if BBO is newer than LM, then use it. 
        // Otherwise we stick with LM
        if (bbo) {
            let bbot  = new Date(bbo + "T00:00:00+1000")
            if (bbot > lm ) {
                sinceDate = bbot
            }
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
        // UTC:  00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
        // AEST: 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08 09 10

        if (priority == "Tomorrow" ) {
            if (18 <= utc_hr && utc_hr <= 19) {
                log.info("Tomorrow => Today: " + record.id + " " + utc_hr )
                let note = record["Automation Log"]??""
                note += `${today}: Promoted from Tomorrow to Today\n`
                let obj = {"Priority":"Today","Automation Log":note}
                Airsync.updateAirtableObj(tableName, obj, record.id)
            }
        }

        /////////////////////
        // update Priority from Monday to Tomorrow between after 11am Sunday morning
        // UTC:  00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
        // AEST: 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08 09 10
        if (priority == "Monday" && utc_day == 0 && utc_hr > 0 ) { // prod
        // if (priority == "Monday" && utc_day == 6 && utc_hr > 0 ) { // dev
            log.info(`Monday: ${record.id} ${utc_day} ${utc_hr}` )
            let note = record["Automation Log"] ?? ""
            note += `${today}: Promoted from Monday to Tomorrow\n`
            let obj = {"Priority":"Tomorrow","Automation Log":note}
            Airsync.updateAirtableObj(tableName, obj, record.id)
        }

    });
    log.info(`AirTable records. Retrieved: ${records.length}. Updated: ${updates}` )
})