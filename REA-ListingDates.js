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

const tableIdentifiers = ["ID"];
let tableEffectives = ["Address", "Location","Buy or Rent", "Source",
					   "Rent","Listing Price","First Listed", 
				       "Last Listed", "Bed", "BR", "Link", "Price History"];

let atdata = [];

Airsync.getAirtable(tableName, tableIdentifiers, tableEffectives)
.then(function(values) {
	atdata = values
	let len = Object.values(atdata[1]).length;
	log.info("AirTable records retrieved:", len)
	fetchREAdata(atdata);
	log.info(atdata);
})

let suburbs = {
	'Banyo':  'QLD+4014',
	'Aspley': 'QLD+4034',
	'Underwood': 'QLD+4119',
	'Geebung': 'QLD+4034',
	'Zillmere': 'QLD+4034',
	'Darra': 'QLD+4076'
};

function fetchREAdata() {
	for (const suburb in suburbs) {	
		const postcode = suburbs[suburb]

		// this will recursively call itself until no more pages
		callListingPage(suburb,postcode,1,"Rent")
		callListingPage(suburb,postcode,1,"Buy")
		// callBuyListingPage(suburb,postcode,1)
	}
}

function callListingPage(suburb,postcode,page,rent_or_buy) {
	let rb = rent_or_buy.toLowerCase();
	let url = `https://www.realestate.com.au/${rb}/`+
			  `property-house-in-${suburb}%2c+${postcode}/list-${page}?`+
			  `includeSurrounding=false`

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
				callListingPage(suburb,postcode,page+1,rent_or_buy)
			}

			// info: this page listing call
			log.info("page %s for %s, %s: %d results (%s)",page,suburb, postcode,articles.length, url)

			articles.each(function(i, element){
				
				log.debug("-------")

				let a = $(this).find('div .listingInfo');
				let img = $(this).find('div.photoviewer a img').attr('data-src');
				let address = $(this).find('div.listingInfo a.name').text();
				let priceTitle = $(this).find('div.listingInfo p.priceText').attr('title');
				let price = $(this).find('div.listingInfo p.priceText').text();
				let bed = $(this).find('div.listingInfo dl dt.rui-icon-bed').next().text();
				let bth = $(this).find('div.listingInfo dl dt.rui-icon-bath').next().text();
				let listingUrl = $(this).find('div.vcard h2 a').attr('href');
				listingUrl = 'https://www.realestate.com.au'+listingUrl

				// get the id from
				// ?propertyname-12354353
				let id = listingUrl.match(/-(\d+)/)
				if ( id ) {
					id = id[1]
					// console.log("ID:: 1 %s %s",id, listingUrl)
				} else {
					console.error("Missing ID for %s", listingUrl)
				}

				address = address.replace(regex, '');

				// <p class="priceText" title="3 B/R $450 p/w 1 week free rent">...p/w 1 week free rent</p>
				// <p class="priceText">$450 p.w.</p>
				if (priceTitle) {
					price = priceTitle
				}
				let advertised_price = price

				// match $350 per week, weekly, p.w, p.w., p/w,
				// match $350,000 or more
				if (rent_or_buy === "Buy") {
					price = price.replace(/\,/,'')

					// some doofus enters $350 000
					price = price.replace(/ 000/,'000')
				}

				price = price.match(/\d\d\d+/);
				if (price) {
					price = Number(price[0]) || 0
				} else {
					price=null
				}
				log.debug("price %s from %s", price, advertised_price)

				// now start populating our newobj for comparison against airtable
				let newobj = {}

				newobj["ID"] = id
				newobj["Address"] = address
				newobj["Location"] = suburb
				newobj["Buy or Rent"] = rent_or_buy
				newobj["Bed"] = Number(bed)
				newobj["BR"] = Number(bth)
				newobj["Link"]= listingUrl
				newobj["Source"]= "REA Scraper"

				if (rent_or_buy==="Buy") {
					newobj["Listing Price"]= price
				} else {
					newobj["Rent"]= price
				}

				// ---------------------
				// DATE HISTORY CAPTURE

				// Get the current date in UTC
				// -> '2018-07-31T18:41:06.440Z'
				// -> '2018-07-31'
				let today = new Date().toJSON().split('T')[0]
				let firstDate;

				// Logic goes here for existing airTable entries:
				var ee = {}
				if ( id in atdata[0]) {
					ee = atdata[0][id]
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
				let price_day
				if (price >0){
					price_day = today + ":$" + price
				} else {
					price_day = today + ":" + price
				}

				// oldPrice from AT could be 'false', 350 or 350000
				let oldPrice = (rent_or_buy==="Rent") ? ee['Rent']:ee['Listing Price']

				// if there is no price_history in the table, 
				// then just store the current price
				if (!ee || 
					! 'Price History' in ee || 
					! ee['Price History'] || 
					ee['Price History'] === ""
				) {
					// log.trace("Yeah gotta instantiate:", price_day)
					newobj["Price History"]= price_day
				}

				// if the prices are truly different store a history
				else {

					// Cleanup. Make duplicate entries like this:
					// 2018-08-04:$null
					// 2018-08-04:$null
					// 2018-08-05:$null
					// to this:
					// 2018-08-04:null
					let eeph = ee['Price History']
					let eephs = eeph.split('\n');
					let eephnew = [];
					
					for (let i = 0; i < eephs.length; i++) {
						let ee0 = eephs[i]
						ee0 = ee0.replace('\$null','null')

						// store the 0th entry regardless
						if (i==0) {
							eephnew.push(ee0)
						}

						// test every subsequent entry
						else {
							const p_1 = eephs[i-1].split(':')
							const p0  = eephs[i].split(':')
							// record different entries
							if (p_1[1] !== p0[1]) {
								// if they're not the same, then record the last one
								eephnew.push(ee0)
							}
						}

					}

					newobj['Price History'] = eephnew.join('\n')

					if (! Airsync.flexibleEquals(oldPrice,price)) {
						newobj["Price History"] = newobj['Price History'] + "\n" + price_day +"added"
					} 

					// if historical prices are the same then just leave it.
					// else {
						// newobj["Price History"]= ee["Price History"]
					// }

				}
					

				// LOG AND UPDATE IT!
				
				// If airtable record was marked as manually entered then 
				// don't update it under any circumstance
				if (ee && ee['Source'] === "Manually Entered") {
					log.debug("Skipping entry because it was previously Manually Entered")
				} else {
					Airsync.upsertAirtableObj(tableName, newobj, tableIdentifiers, atdata)
					.then( function(values) {
						log.debug(newobj)
						let [inserted,updated,skipped] = Airsync.getUpsertionStats()
						log.info("%s %s",address,suburb);
						log.info("new %s, updated %s, skipped %s",inserted,updated,skipped);
					})
				}

			});
		} else {
			log.error("Failed to fetch %s",error)
		}
	});
}
