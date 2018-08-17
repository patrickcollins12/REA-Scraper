strings = 
[
    "Offers In The High $600k's",
    "$1,650,000"
]

for (let index = 0; index < strings.length; index++) {
    const s = strings[index];
    console.log("%s --> %s", s, getPrice(s))
}



function getPrice(str) {

    let price = str.replace(/\,/gi,'')
    
    // High $300k's --> High $300000's
    let price2 = price.replace(/(\d\d\d)k\b/i,'$1000')
    
    // some doofus enters $350 000
    price = price2.replace(/ 000/,'000')

    console.log(price)
    price = price.match(/\d\d\d+/);
    
    if (price) {
        price = Number(price[0]) || 0
    } else {
        price=null
    }
    
    return price
}
