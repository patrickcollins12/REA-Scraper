var request = require('request');

// i.monthlyRepayment = r(t.loanType, t.loanTerm, t.interestRate, i.loanAmount)),
function pmt(t, e, i, n) {
        var o = 12
          , s = e * o // 20 * 12 = 240
          , r = i / (100 * o)  // 5.05 / (100 * 12) = .004
          , a = n * r * Math.pow(1 + r, s) / (Math.pow(1 + r, s) - 1) // Math.pow(1+.004, 240) / Math.pow(1+.004,240)-1
          , l = Math.round(100 * a) / 100 // Math.round(100 * a) / 100
          , h = n * r;
        return "Principal + interest" === t ? Number(l.toFixed(0)) : Number(h.toFixed(0))
}

function cashFlow(propertyValue, weeklyRent) {
	// propertyValue = 451500
	// weeklyRent = 400
	
	let depositPercent = 0.2
	let interestRate = 5.05
	let loanTerm = 20
	
	let loanAmount = propertyValue - (depositPercent * propertyValue)
	let monthlyRepayment = pmt("Interest only", loanTerm, interestRate, loanAmount)
	let monthlyRent = 52 * weeklyRent / 12
	let cashFlow = monthlyRent - monthlyRepayment

	// console.log( `monthlyRepayment ${monthlyRepayment}` );
	// console.log( `monthlyRent ${monthlyRent}` );
	// console.log( `cashFlow ${cashFlow}` );
	return cashFlow;
}

let mystr = `
Fitzgibbon
Zillmere
Aspley
Taigum
Banyo
Nudgee
Geebung
Carseldine
The Gap
Virginia
Northgate
`

suburbs = mystr.replace(/^\s*\n/gm,'').replace(/\n$/gm,'').split('\n');

for (var a in suburbs ){
	getREAMetaData(suburbs[a])
}

function getREASuburbData(suburb,state,postcode,desc) {
	suburb = encodeURIComponent(suburb.toUpperCase());
	state  = encodeURIComponent(state.toUpperCase());	
	url = `https://investor-api.realestate.com.au/states/${state}/suburbs/${suburb}/postcodes/${postcode}.json?embed=suburb_geo`
	console.error(url);
	
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var info = JSON.parse(body);
			firstElem = info[Object.keys(info)[0]]; 
			// console.log(JSON.stringify(firstElem));
			var im = firstElem['property_types']['HOUSE']['bedrooms']['3']['investor_metrics'];

			var cf = cashFlow(im['median_sold_price'], im['median_rental_price']);
			im['cash_flow'] = cf.toFixed(2)*1.0;

			// console.log(im);
			arr = [ 
				'annual_growth',
				'median_sold_price', 
				'median_rental_price',
				'rental_yield',
				'rental_demand',
				'cash_flow',

				'sold_properties',				
				'sold_properties_five_years_ago',
				'median_sold_price_five_years_ago', 
				'rental_properties',
			]
			var x = [desc]
			for (var i = 0; i < arr.length; i++) {
				col = arr[i]
				val = im[col]
				if (col === "annual_growth" || col === "rental_yield") {
					val *= 100;
					val = val.toFixed(2);
					val = val + '%'
				}
				x.push(val);
			}
			// console.log(desc);
			console.log(x.join('\t'))
			// console.log()
			
			// console.log(`${im['median_sold_price']},`)
		}
	});
}


function getREAMetaData(suburb) {
	suburb = encodeURIComponent(suburb.toLowerCase());
	let url = `https://suggest.realestate.com.au/smart-suggest?query=${suburb}%20QLD&n=1&regions=false&src=rui`
	
	request(url, function (error, response, body) {
		if (!error && response.statusCode == 200) {
			var info = JSON.parse(body);
			try {
				elem      = info.suggestions[0];
				suburb    = elem['locality'];
				state     = elem['subdivision'];
				desc      = elem['displayValue'];
				postcode  = elem['postcode'];
				getREASuburbData(suburb,state,postcode,desc);
			    // curl -s -I 'https://investor-api.realestate.com.au/states/VIC/suburbs/DARRAWEIT%20GUIM/postcodes/3756.json?embed=suburb_geo'
				
			}
			catch(error){
				console.log("Error:",url, info);				
			}

		}
	  
	});
}