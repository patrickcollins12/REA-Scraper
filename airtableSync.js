// Airtable Object Instantiations
const Airtable = require("airtable");
Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: "keyvjbVyJKBdcU2qR" 
});


// REA
// staging: apphLFyiIHkh3ohH1
// prod: appDWv1JeWJBv6euz
// const base = Airtable.base("appDWv1JeWJBv6euz");

// TODO
// prod: appceewzmZJYSMZKm
// staging: app6OHIziVUJsCdSy
const base = Airtable.base("app6OHIziVUJsCdSy");

// Other module imports
const Bottleneck = require("bottleneck");

// Bottlenecking instantiations
const bottleneckDict = {};
const limiter = new Bottleneck({minTime: 1000/15});

// Logging variables
let numQueued = 0;
let numInserted = 0;
let numUpdated = 0;
let numIgnored = 0;

module.exports = {
    // Retrieves an entire Airtable with the name `baseName` and `uniqueIDs` are the column names used to create a unique key mapping
    getAirtable: function (baseName, queryParams, uniqueIDs, effectiveFields) {
        let dicSelect = bottleneckDict[baseName + "Select"]; // Pulls up the throttled version of an Airtable select

        return new Promise(async function (resolve, reject) {
            // let recordDic = {};
            // let uniqueIdDic = {};
            let recordsAll = []

            let sClause = await dicSelect(queryParams);
            let throttledEach = limiter.wrap(sClause.eachPage);

            throttledEach(function page(records, next) {
                
                records.forEach(function (record) {
                    fields = record["fields"]
                    fields["id"] = record['id']
                    recordsAll.push(fields)
                    // let recordKey = '';

                    // // Creates the dictionary key by just appending the values of each column together in order
                    // uniqueIDs.forEach(function (colName) {
                    //     recordKey += record.fields[colName];
                    // });

                    // effectiveFields.forEach(function (field) {
                    //     if (!record.fields[field]) {
                    //         record.fields[field] = false;
                    //     }
                    // });

                    // recordDic[recordKey] = record.fields; // Mapping to the actual record data
                    // uniqueIdDic[recordKey] = record.id; // Mapping to the unique record ID because Airtable loves dealing with record IDs

                });
                next();
            }, function complete(err) {
                if (err) {
                    console.error("getAirtable() error for", baseName, ":", err);
                    reject(err);
                } else {
                    // resolve([recordDic, uniqueIdDic, effectiveFields]);
                    resolve(recordsAll);
                }
            });
        });
    },

    // Adds an airtable `obj` to the Airtable with the name `baseName`
    insertAirtableObj: async function (baseName, obj) {
        let dicCreate = bottleneckDict[baseName + "Create"]; // Pulls up the throttled version of an Airtable create

        return new Promise(function (resolve, reject) {
            dicCreate(obj, function (err, record) {
                if (err) {
                    // Sometimes airtable's servers mess up and an operation needs to reprocess
                    if (err.statusCode === 503) {
                        console.error("An operation has been requeued");
                        console.error(`${numQueued++} operations have been queued`);
                        resolve(module.exports.insertAirtableObj(baseName, obj)); // Basically just calls itself again and hope it works this time
                    } else {
                        console.error("insertAirtableObj() error for", baseName, ":", err);
                        console.error("Attempted to add", obj);
                        reject(err);
                    }
                } else {
                    resolve(record.getId());
                }
            });
        });
    },

    // Updates an airtable object with the unique `id` in the Airtable with name `baseName` with `obj`
    updateAirtableObj: async function (baseName, obj, id) {
        let dicUpdate = bottleneckDict[baseName + "Update"];

        return new Promise(function (resolve, reject) {
            dicUpdate(id, obj, function (err, record) {
                if (err) {
                    // Some more airtable error catching
                    if (err.statusCode === 503) {
                        console.error("An operation has been requeued");
                        console.error(`${numQueued++} operations have been queued`);
                        resolve(module.exports.updateAirtableObj(baseName, obj, id)); // Trying again
                    } else {
                        console.error("updateAirtableObj() error for", baseName, ":", err);
                        console.error("Attempted to update", id, "with", obj);
                        reject(err);
                    }
                } else {
                    resolve(record.fields);
                }
            });
        });
    },

    // Contains the rerouting logic to see if we insert the `obj` or update it instead
    upsertAirtableObj: async function (baseName, obj, uniqueIDs, cachedTable) {
        // Notice that this is the same key generation technique as `getAirtable()`
        let tableKey = '';
        uniqueIDs.forEach(function (colName) {
            tableKey += obj[colName];
        });

        // Using the `tableKey`, checks whether or not it's saved in memory (`cachedTable`)
        let searchObject = cachedTable[0][tableKey];

        if (typeof searchObject === "undefined") { // Doesn't exist; add it
            numInserted++; // Used for logging
            return module.exports.insertAirtableObj(baseName, obj);
        } else if (this.objectEquals(searchObject, obj, cachedTable[2])) { // Object in cache is the same as `obj`, skip it
            // console.log("Skipping/equals:\n",searchObject,"\n",obj,"\n-------\n")

            numIgnored++; // Used for logging
            return searchObject;
        } else { // Object in cache is different from `obj`, update it
            numUpdated++; // Used for loggingß
            // console.log("Updating:\n",searchObject,"\n",obj,"\n-------\n")
            return module.exports.updateAirtableObj(baseName, obj, cachedTable[1][tableKey]);
        }
    },

    // Useful logging variables
    getUpsertionStats: function () {
        return [numInserted, numUpdated, numIgnored]
    },

    // When running two syncing scripts in tandem using the same library in the same directory,
    // logging variables need to be overwritten
    resetUpsertionStats: function () {
        numQueued = 0;
        numInserted = 0;
        numUpdated = 0;
        numIgnored = 0;
    },

    // The function to create the throttled versions of Airtable methods
    createBottlenecks: function (baseName) {
        let bottleneckCreate = limiter.wrap(base(baseName).create);
        let bottleneckUpdate = limiter.wrap(base(baseName).update);
        let bottleneckSelect = limiter.wrap(base(baseName).select);

        // Stores all of these new functions in a dictionary so it's fast to pull them up and use them later
        bottleneckDict[baseName + "Create"] = bottleneckCreate;
        bottleneckDict[baseName + "Update"] = bottleneckUpdate;
        bottleneckDict[baseName + "Select"] = bottleneckSelect;
    },


    // Iterates over the "effective fields" in which comparisons will be made
    // This is to ensure overwrites do NOT occur when certain fields still need to be finalized
    objectEquals: function (oldObj, newObj, effectiveFields) {
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
    },

    // Because of how Airtable functions, some "different" fields are technically the same
    flexibleEquals: function (oldVal, newVal) {
        return (
            oldVal === newVal || 
            (oldVal === false && newVal === null) ||
            (oldVal === false && newVal === 0) ||
            (oldVal === null && newVal === false) ||
            (oldVal === undefined && newVal === false) || 
            (oldVal === undefined && newVal === null) 
            
            )

    }

};
