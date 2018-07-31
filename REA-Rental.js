"use strict"

var request = require('request') // for requests
var cheerio = require('cheerio') // for html parsing

const airsync = require("./airtableSync");

// Table names that are being updated
const tableName = "Properties";

// Airtable can only run 5 operations per second (supposedly)
// 15 per second runs fine though
airsync.createBottlenecks(tableName); 

const tableIdentifiers = ["Property"];
const tableEffectives = ["Property", "Location", "Buy or Rent", "Bed", "BR", "Link", "Rent"];

airsync.getAirtable(tableName, tableIdentifiers, tableEffectives)
.then(function(atdata) {
	let len = Object.values(atdata[1]).length;
	console.log("AirTable records retrieved:", len)
	// fetchREAdata();
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
			console.warn("page %s for %s, %s: %d results (%s)",page,suburb, postcode,articles.length, url)

			articles.each(function(i, element){
				
				let a = $(this).find('div .listingInfo');
				let img = $(this).find('div.photoviewer a img').attr('data-src');
				let dee = $(this).find('div.listingInfo a.name').text();
				let price = $(this).find('div.listingInfo p.priceText').text();
				let bed = $(this).find('div.listingInfo dl dt.rui-icon-bed').next().text();
				let bth = $(this).find('div.listingInfo dl dt.rui-icon-bath').next().text();
				let listingUrl = $(this).find('div.vcard h2 a').attr('href');
				listingUrl = 'https://www.realestate.com.au'+listingUrl

				dee = dee.replace(regex, '');

				let advertised_price = price
				// remove $350 per week, weekly, p.w, p.w., p/w, 
				price = price.match(/\d\d\d+/) || "";

				console.log("-------")
				console.log(dee);
				console.log('price: "%s" (%s)', price, advertised_price);
				console.log('beds ', bed);
				console.log('bath ', bth);
				console.log('img ', img);
				console.log('url ', listingUrl);
				//
				// let data = [dee,suburb, advertised_price, price, bed, bth, listingUrl]
				// console.log(data.join('\t'))
			});
		} else {
			console.error("Failed to fetch %s",error)
		}
	});
}

