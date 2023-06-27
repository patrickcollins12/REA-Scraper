// Airtable Object Instantiations

const Airtable = require("airtable");
const Bottleneck = require("bottleneck");

class AirtableTableSync {

    constructor({ apiKey, baseKey, table, requestsPerSecond=4 }) {

        Airtable.configure({ apiKey: apiKey })

        this.base = Airtable.base(baseKey)
        this.table = this.base(table)
        this.baseKey = baseKey;

        // sets up the bottlenecking objects
        this.createBottlenecks(requestsPerSecond)

        // Logging variables
        this.numQueued = 0;
        this.numInserted = 0;
        this.numUpdated = 0;
        this.numIgnored = 0;
    }

    // Retrieves an entire Airtable table
    async getAirtable(queryParams) {
        // let dicSelect = this.bottleneckDict["Select"]; // Pulls up the throttled version of an Airtable select
        let testx = this

        return new Promise((resolve, reject) => {
            
            // let recordDic = {};
            // let uniqueIdDic = {};
            
            let recordsAll = []
            let rawRecordsAll = []

            console.log("testx:" + testx.throttledSelect)
            

            let sClause = testx.throttledSelect(queryParams);
            console.log("here")
            console.log("sClause:"+sClause)

            let throttledEach = this.limiter.wrap(sClause.eachPage);
            console.log("throttledEach:"+throttledEach)

            throttledEach(function page(records, next) {
                console.log("here2")
                rawRecordsAll.push(records)
                records.forEach(function (record) {
                    fields = record["fields"]
                    fields["id"] = record['id']
                    recordsAll.push(fields)

                });
                next();
            }, function complete(err) {
                if (err) {
                    console.error("getAirtable() error for", this.baseKey, ":", err);
                    reject(err);
                } else {
                    // resolve([recordsAll, rawRecordsAll]);
                    resolve(recordsAll);
                }
            });
        });
    }

    // Adds an airtable `obj` to the Airtable with the name `baseName`
    async insertAirtableObj(obj) {
        // let dicCreate = this.bottleneckDict["Create"]; // Pulls up the throttled version of an Airtable create

        return new Promise(function (resolve, reject) {
            this.throttledCreate(obj, function (err, record) {
                if (err) {
                    // Sometimes airtable's servers mess up and an operation needs to reprocess
                    if (err.statusCode === 503) {
                        console.error("An operation has been requeued");
                        console.error(`${this.numQueued++} operations have been queued`);
                        resolve(insertAirtableObj(obj)); // Basically just calls itself again and hope it works this time
                    } else {
                        console.error("insertAirtableObj() error for", this.baseKey, ":", err);
                        console.error("Attempted to add", obj);
                        reject(err);
                    }
                } else {
                    resolve(record.getId());
                }
            });
        });
    }

    // Updates an airtable object with the unique `id` in the Airtable with name `baseName` with `obj`
    async updateAirtableObj (obj, id) {
        // let dicUpdate = this.bottleneckDict["Update"];

        return new Promise(function (resolve, reject) {
            this.throttledUpdate(id, obj, function (err, record) {
                if (err) {
                    // Some more airtable error catching
                    if (err.statusCode === 503) {
                        console.error("An operation has been requeued");
                        console.error(`${this.numQueued++} operations have been queued`);
                        resolve(updateAirtableObj(obj, id)); // Trying again
                    } else {
                        console.error("updateAirtableObj() error for", this.baseKey, ":", err);
                        console.error("Attempted to update", id, "with", obj);
                        reject(err);
                    }
                } else {
                    resolve(record.fields);
                }
            });
        });
    }

    // Contains the rerouting logic to see if we insert the `obj` or update it instead
    async upsertAirtableObj (obj, uniqueIDs, cachedTable) {
        // Notice that this is the same key generation technique as `getAirtable()`
        let tableKey = '';
        uniqueIDs.forEach(function (colName) {
            tableKey += obj[colName];
        });

        // Using the `tableKey`, checks whether or not it's saved in memory (`cachedTable`)
        let searchObject = cachedTable[0][tableKey];

        if (typeof searchObject === "undefined") { // Doesn't exist; add it
            this.numInserted++; // Used for logging
            return insertAirtableObj(obj);
        } else if (this.objectEquals(searchObject, obj, cachedTable[2])) { // Object in cache is the same as `obj`, skip it
            // console.log("Skipping/equals:\n",searchObject,"\n",obj,"\n-------\n")

            this.numIgnored++; // Used for logging
            return searchObject;
        } else { // Object in cache is different from `obj`, update it
            this.numUpdated++; // Used for loggingß
            // console.log("Updating:\n",searchObject,"\n",obj,"\n-------\n")
            return updateAirtableObj(obj, cachedTable[1][tableKey]);
        }
    }

    // Useful logging variables
    getUpsertionStats () {
        return [this.numInserted, this.numUpdated, this.numIgnored]
    }

    // When running two syncing scripts in tandem using the same library in the same directory,
    // logging variables need to be overwritten
    resetUpsertionStats () {
        this.numQueued = 0;
        this.numInserted = 0;
        this.numUpdated = 0;
        this.numIgnored = 0;
    }

    // The function to create the throttled versions of Airtable methods
    createBottlenecks(requestsPerSecond) {
        // Bottlenecking instantiations
        this.limiter = new Bottleneck({minTime: 1000/requestsPerSecond});
        
        this.throttledCreate = this.limiter.wrap(this.table.create);
        this.throttledUpdate = this.limiter.wrap(this.table.update);
        this.throttledSelect = this.limiter.wrap(this.table.select);
    }


    // Iterates over the "effective fields" in which comparisons will be made
    // This is to ensure overwrites do NOT occur when certain fields still need to be finalized
    objectEquals(oldObj, newObj, effectiveFields) {
        let oldVals = [];
        let newVals = [];

        effectiveFields.forEach(function (key) {
            oldVals.push(oldObj[key]);
        });
        effectiveFields.forEach(function (key) {
            newVals.push(newObj[key]);
        });

        // The following code is just an array.equals comparison
        for(let i = 0; i < oldVals.length; i++) {
            if (! this.flexibleEquals(oldVals[i], newVals[i])) {
                return false;
            }
        }
        // console.log("Returning true: same object")
        // console.log("----------------")

        return true;
    }

    // Because of how Airtable functions, some "different" fields are technically the same
    flexibleEquals (oldVal, newVal) {
        return (
            oldVal === newVal || 
            (oldVal === false && newVal === null) ||
            (oldVal === false && newVal === 0) ||
            (oldVal === null && newVal === false) ||
            (oldVal === undefined && newVal === false) || 
            (oldVal === undefined && newVal === null) 
            
            )

    }
        
}

module.exports = AirtableTableSync;
