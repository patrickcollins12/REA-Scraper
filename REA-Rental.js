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
log.setLevel("info")

// Table name that is being updated
const tableName = "Properties";

// Airtable can only run 5 operations per second (supposedly)
// 15 per second runs fine though
Airsync.createBottlenecks(tableName); 

const tableIdentifiers = ["Property", "Location"];
const tableEffectives = ["Property", "Location", "Buy or Rent", "First Date", "Last Date", "Bed", "BR", "Link", "Rent", "Price History"];
let atdata = [];

Airsync.getAirtable(tableName, tableIdentifiers, tableEffectives)
.then(function(values) {
	atdata = values
	let len = Object.values(atdata[1]).length;
	log.info("AirTable records retrieved:", len)
	fetchREAdata(atdata);
	log.trace(atdata);
})

let suburbs = {
	'Banyo':  'QLD 4014',
	'Aspley': 'QLD 4034',
	'Underwood': 'QLD 4119',
};

function fetchREAdata() {
	for (const suburb in suburbs) {	
		const postcode = suburbs[suburb]
		callListingPage(suburb,postcode,1)
	}
}

function callListingPage(suburb,postcode,page) {

	let url = `https://www.realestate.com.au/rent/property-house-in-${suburb}%2c+${postcode}/list-${page}?includeSurrounding=false`

	// var regex = /\, ${suburb}.*/
	return request(url, function (error, response, html) {
		if (!error && response.statusCode == 200) {

			// Property name looks like this:
			//     30 Hutton Road, Aspley, QLD, 4013
			// We just want the street
			//     30 Hutton Road
			let regex = new RegExp('\, ' + suburb + '.*', "gi");

			let $ = cheerio.load(html);
			let articles = $('#searchResultsTbl > article')

			// If this page contains more than one article, 
			// then we should check the next page
			if (articles.length > 0) {
				callListingPage(suburb,postcode,page+1)
			}

			// debug
			log.info("page %s for %s, %s: %d results (%s)",page,suburb, postcode,articles.length, url)

			articles.each(function(i, element){
				
				log.debug("-------")

				let a = $(this).find('div .listingInfo');
				let img = $(this).find('div.photoviewer a img').attr('data-src');
				let address = $(this).find('div.listingInfo a.name').text();
				let price = $(this).find('div.listingInfo p.priceText').text();
				let bed = $(this).find('div.listingInfo dl dt.rui-icon-bed').next().text();
				let bth = $(this).find('div.listingInfo dl dt.rui-icon-bath').next().text();
				let listingUrl = $(this).find('div.vcard h2 a').attr('href');
				listingUrl = 'https://www.realestate.com.au'+listingUrl

				address = address.replace(regex, '');

				let advertised_price = price
				// remove $350 per week, weekly, p.w, p.w., p/w, 
				price = price.match(/\d\d\d+/);
				if (price) {
					price = Number(price[0])
				}

				let newobj = {}
			
				newobj["Property"] = address
				newobj["Location"] = suburb
				newobj["Buy or Rent"] = "Rent"
				newobj["Bed"] = Number(bed)
				newobj["BR"] = Number(bth)
				newobj["Link"]= listingUrl
				newobj["Rent"]= price
				newobj["Source"]= "REA Scraper"

				// ---------------------
				// DATE HISTORY CAPTURE

				// Get the current date in UTC
				// -> '2018-07-31T18:41:06.440Z'
				// -> '2018-07-31'
				let today = new Date().toJSON().split('T')[0]
				let firstDate;

				// Logic goes here for existing airTable entries:
				var ee = null
				if ( address+suburb in atdata[0]) {
					ee = atdata[0][address+suburb]
					firstDate = ee['First Listed']
				}

				// if there was no firstDate in the existing 
				// entry, then we need to set it
				if ( ! firstDate ) {
					firstDate = today
				}

				newobj["First Listed"] = firstDate
				newobj["Last Listed"] = today

				// ---------------------
				// PRICE HISTORY CAPTURE
				// if the price is new or has changed capture the history
				let price_day = today + ":$" + price

				if (!ee || 
					! 'Price History' in ee || 
					! ee['Price History'] || 
					ee['Price History'] === ""
				) {
					log.trace("Yeah gotta instantiate:", price_day)
					newobj["Price History"]= price_day
				}

				// If the new price is zero, null or false, then skip it
				else if (!price) { 
					// skip it
				}

				// if the rents are different store a history
				else if (ee['Rent'] !== price) {
					log.trace("Price Day:", price_day)
					log.trace("Old Rent:", ee['Rent'], typeof(ee['Rent']))
					log.trace("New Rent:", price, typeof(price))
					newobj["Price History"] = ee['Price History'] + "\n" + price_day
				}
					

				// LOG AND UPDATE IT!
				log.debug(newobj)
				
				// If airtable record was marked as manually entered then 
				// don't update it under any circumstance
				if (ee && ee['Source'] === "Manually Entered") {
					log.debug("Skipping entry because it was previously Manually Entered")
				} else {
					Airsync.upsertAirtableObj(tableName, newobj, tableIdentifiers, atdata)
					log.debug("updating AT with new entry")
				}

			});
		} else {
			log.error("Failed to fetch %s",error)
		}
	});
}

