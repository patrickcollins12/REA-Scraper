var request = require('request');
var cheerio = require('cheerio');

url = 
'https://www.realestate.com.au/rent/property-house-with-3-bedrooms-in-aspley%2c+qld+4034/list-1?maxBeds=3&includeSurrounding=false&persistIncludeSurrounding=true&source=location-search'

var regex = /\, Aspley.*/
var suburb = 'Aspley'

request(url, function (error, response, html) {
	if (!error && response.statusCode == 200) {
		console.log('Got it');
		var $ = cheerio.load(html);
		$('#searchResultsTbl > article').each(function(i, element){
			var a = $(this).find('div .listingInfo');
			var dee = $(this).find('div.listingInfo a.name').text();
			var price = $(this).find('div.listingInfo p.priceText').text();
			var bed = $(this).find('div.listingInfo dl dt.rui-icon-bed').next().text();
			var bth = $(this).find('div.listingInfo dl dt.rui-icon-bath').next().text();
			var url = $(this).find('div.vcard h2 a').attr('href');
			url = 'https://www.realestate.com.au'+url
			// var b = $('a .name');
			dee = dee.replace(regex, '');
			// console.log(dee);
			// console.log('price: ', price);
			// console.log('beds ', bed);
			// console.log('bath ', bth);
			// console.log('url ', 'https://www.realestate.com.au'+url);
			//
			data = [dee,suburb, price, bed, bth, url]
			console.log(data.join('\t'))
		});
	}
});

