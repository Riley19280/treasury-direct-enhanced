var DateTime = luxon.DateTime;

function extractTerms(term) {
    const matches = term.match(/[0-9]+\-\w+/g)

    if(matches.length === 0) {
        throw new Error(`Unable to match term type and duration for term ${term}`)
    }
    
    return matches.map(match => {
        const [termDuration, termType] = match.toLowerCase().split('-', 2)
        return {
            termType,
            termDuration,
        }
    })
}

function calculateMaturityDate(issueDate, terms) {
    let maturityDate = DateTime.fromFormat(issueDate, 'MM-dd-yyyy')

    terms.map(({ termType, termDuration }) => {
        maturityDate = maturityDate.plus({[termType]: termDuration})
    })

    return maturityDate.toFormat('MM-dd-yyyy')
}

function getSecurityTermsIndexForTable(table) {
    return Array.from(table.querySelectorAll('th'))
    .findIndex(th => {
        return [
            th.textContent.match(/Security Type/i) !== null,
            th.textContent.match(/Product Term/i) !== null,
            th.textContent.match(/Product Type/i) !== null,
        ].some(x => x)
    })
}

function addMaturityDateToTable(table) {
    const headers = Array.from(table.querySelectorAll('th'))

    const issueDateIndex = headers.findIndex(th => {
        return th.textContent.match(/issue date/i)
    })

    const securityTermsIndex = getSecurityTermsIndexForTable(table)

    const maturityDateIndex = headers.findIndex(th => {
        return th.textContent.match(/maturity date/i)
    })

    if(issueDateIndex === -1 || securityTermsIndex === -1 || maturityDateIndex !== -1) return

    // Add Header
    const issueHeader = headers[issueDateIndex]
    issueHeader.insertAdjacentHTML('afterend', '<th>Maturity Date</th>')
    
    table.querySelectorAll('tr').forEach((tableRow) => {
        const cells = tableRow.querySelectorAll('td')

        // If the lengths do not match, then we are probably dealing with a generic status message and not actual columns
        if(cells.length !== headers.length) return

        const terms = extractTerms(cells[securityTermsIndex].textContent)
        const issueDate = cells[issueDateIndex].textContent

        const matureDate = calculateMaturityDate(issueDate, terms)

        cells[issueDateIndex].insertAdjacentHTML('afterend', `<td>${matureDate}</td>`)
    })
}

async function addLastRateToTables() {
    const buyPageType = document.querySelector('h1 + p')?.textContent.replace('Purchase a ', '').replace(/[^\w ]/g, '').toLowerCase()

    const purchaseType = (() => {
        switch(buyPageType) {
            case 'treasury bill': 
                return {
                    filter: 'Bill',
                    datapoint_field: 'highInvestmentRate',
                    datapoint_field_name: 'High Investment Rate',
                }
            case 'treasury note': 
                return {
                    filter: 'Note',
                    datapoint_field: 'interestRate',
                    datapoint_field_name: 'Interest Rate',
                }
            case 'treasury bond': 
                return {
                    filter: 'Bond',
                    datapoint_field: 'interestRate',
                    datapoint_field_name: 'Interest Rate',
                }
            case 'frn': 
                return {
                    filter: 'FRN',
                    datapoint_field: 'highDiscountMargin',
                    datapoint_field_name: 'High Discount Margin',
                }
            case 'treasury tips': 
                return {
                    filter: 'TIPS',
                    datapoint_field: 'highYield',
                    datapoint_field_name: 'High Yield',
                }
            case 'cmb': 
            return {
                filter: 'CMB',
                datapoint_field: 'highInvestmentRate',
                datapoint_field_name: 'High Investment Rate',
            }
            default:
                return null
        }
    })()

    if(!purchaseType) return

    const url  = `https://www.treasurydirect.gov/TA_WS/securities/auctioned?pagesize=20&type=${purchaseType.filter}&format=json`
    const key = `${purchaseType.filter}-auctions`
    
    const data = await chrome.storage.local.get([key])
    .then((result) => {
        if(result[key] && result[key].timestamp + (1000 * 60 * 60) > (new Date).getTime() ) {
            console.info('Got results from cache')
            return result[key].data
        }
        
        return fetch(url)
        .then(data => data.json())
        .then((data) => {
            return chrome.storage.local.set({ [key]: {data, timestamp: (new Date).getTime()} })
            .then(() => {
                return data
            });
        })
    })

    Array.from(document.querySelectorAll('table')).map(table => {
        const headers = Array.from(table.querySelectorAll('th'))

        const securityTermsIndex = getSecurityTermsIndexForTable(table)
        
        if(securityTermsIndex === -1) return

        const headerText = purchaseType.datapoint_field_name

        headers[headers.length - 1].insertAdjacentHTML('afterend', `<th>${headerText}</th>`)

        document.querySelector('table').querySelectorAll('tr').forEach((tableRow) => {
            const cells = tableRow.querySelectorAll('td')

            // If the lengths do not match, then we are probably dealing with a generic status message and not actual columns
            if(cells.length !== headers.length) return

            const rawTermText = cells[securityTermsIndex].textContent

            const datapoint = data.find(d => d.securityTerm.toLowerCase() === rawTermText.toLowerCase())

            const number = datapoint[purchaseType.datapoint_field]
        
            cells[cells.length - 1].insertAdjacentHTML('afterend', `<td>${number ? parseFloat(number).toFixed(datapoint.competitiveBidDecimals) + '%' : ''}</td>`)
        })
    }) 
}

// Process all tables on a page
Array.from(document.querySelectorAll('table')).map(t => {
    addMaturityDateToTable(t)
})

addLastRateToTables()

// We are on the buy confirmation page
if(document.querySelector('title').textContent === 'BuyDirect - Confirmation') {
    let productType

    document.querySelector('table').querySelectorAll('tr').forEach((tableRow) => {
        const cells = tableRow.querySelectorAll('td')

        const [field, value] = Array.from(cells).map(c => c.textContent)

        if(field === 'Product Type:') {
            productType = value
        }

        if(field === 'Issue Date:') {
            let issueDate = value

            const terms = extractTerms(productType)
            const matureDate = calculateMaturityDate(issueDate, terms)

            tableRow.insertAdjacentHTML('afterend', `<tr><td class="alignrighttop"><strong>Maturity Date:</strong></td><td colspan="3">${matureDate}</td></tr>`)
        }
    })
}
