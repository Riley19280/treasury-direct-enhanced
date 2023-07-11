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

function tableToJson(table) {
    const tableHeaders = Array.from(table.querySelectorAll('th')).map(c => c.textContent.toLowerCase().replace(/ /g, '_'))

    const data = []

    table.querySelectorAll('tr').forEach((tableRow) => {
        const cells = tableRow.querySelectorAll('td')

        const cellContents = Array.from(cells).map(c => c.textContent)

        if(cellContents.length !== tableHeaders.length) return

        const datapoint = {}

        for(let i = 0; i < tableHeaders.length; i++) {
            if(tableHeaders[i] === '') continue
            datapoint[tableHeaders[i]] = cellContents[i]
        }

        data.push(datapoint)

    })

    return data
}

function objectToTable(objects) {
    if (objects.length === 0) return '<table></table>'

    let str = '<table class="border">'

    str += '<tr>'
    Object.keys(objects[0]).map(key => {
        if(key[0] === '_') return
        str += `<th>${key.split('_').map(x => x.charAt(0).toUpperCase()+ x.slice(1)).join(' ')}</th>`
    })
    str += '</tr>'

   objects.map((o, idx) => {
    str += `<tr class="${idx % 2 === 0 ? 'altrow1' : 'altrow2'} ${o._classes}">`
    Object.entries(o).map(([key, val]) => {
        if(key[0] === '_') return

       str += `<td>${val}</td>`
    })
    str += '</tr>'
   })


    str += '</table>'
    return str
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

    const url  = `https://www.treasurydirect.gov/TA_WS/securities/auctioned?pagesize=50&type=${purchaseType.filter}&format=json`
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

            const number = datapoint ? datapoint[purchaseType.datapoint_field] : undefined
        
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


if(
    document.querySelector('title').textContent ==='Current Holdings - Summary' && 
    document.querySelector('h3').textContent === 'Treasury Bills'
) {
    chrome.storage.local.set({ 
        current_bill_holdings: {
            data: tableToJson(document.querySelectorAll('table')[1]),
            timestamp: (new Date).getTime()
        } 
    })
}


if(
    document.querySelector('title').textContent ==='Current Holdings - Pending Transactions - Summary List' && 
    document.querySelector('h3').textContent === 'Pending Purchases'
) {
    
    chrome.storage.local.set({ 
        pending_certificate_of_indebtedness: {
            data: tableToJson(document.querySelectorAll('table')[0]),
            timestamp: (new Date).getTime()
        },
        pending_marketable_securities: {
            data: tableToJson(document.querySelectorAll('table')[1]),
            timestamp: (new Date).getTime()
        },
        pending_savings_bonds: {
            data: tableToJson(document.querySelectorAll('table')[2]),
            timestamp: (new Date).getTime()
        },
        pending_reinvestments: {
            data: tableToJson(document.querySelectorAll('table')[3]),
            timestamp: (new Date).getTime()
        },
    }).then(() => {
        'Saved data'
    })
    .catch(err => console.error(err)) 
}

if(
    document.querySelector('title').textContent ==='BuyDirect Marketables' && 
    document.querySelector('h1 + p').textContent === 'Purchase a Treasury Bill.'
) {
    const topMargin = document.querySelector('table').offsetTop - document.querySelector('#content').offsetTop
    document.querySelector('#content').style.display = 'flex'

    document.querySelector('#content form').style.width = '730px'
    document.querySelector('#content').style.width = 'auto'

    document.querySelector('head style').insertAdjacentHTML('beforeend', `\n #content tr.highlight { background-color: yellow; }`)

    document.querySelector('#content').insertAdjacentHTML('beforeend', `<div id="tbill-ladder" style="margin-left: 6px; margin-top: ${topMargin}px; flex-grow: 1; min-width: 200px;"></div>`)

    const requiredDataKeys = [
        'current_bill_holdings',
        'pending_reinvestments',
        'pending_marketable_securities'
    ]

    chrome.storage.local.get(requiredDataKeys)
    .then((result) => {
        const failedKeys = []
        
        for(const key of requiredDataKeys) {
            if(!result[key]) {
                document.querySelector('#tbill-ladder').insertAdjacentHTML('afterbegin', `<div>Missing required data: ${key.split('_').map(x => x.charAt(0).toUpperCase()+ x.slice(1)).join(' ')}</div>`)
            }
        }

        if(failedKeys.length !== 0) return

        function computeTBillLadder() {
            document.querySelector('#tbill-ladder').childNodes.forEach(x => x.remove())

            let normalizedAggergate = []

            result.current_bill_holdings.data.map(x => {
                normalizedAggergate.push({
                    term: x.term,
                    issue_date: x.issue_date,
                    maturity_date: x.maturity_date,
                })
            })
    
            result.pending_marketable_securities.data.map(x => {
                normalizedAggergate.push({
                    term: x.security_type.replace(/ Bill$/, ''),
                    issue_date: x.issue_date,
                    maturity_date: x.maturity_date,
                })
            })

            const selected = document.querySelector('table').querySelector('td input:checked')
            if(selected) {
                const cells = Array.from(selected.parentElement.parentElement.querySelectorAll('td'))
                normalizedAggergate.push({
                    term: cells[0].textContent,
                    issue_date: cells[2].textContent,
                    maturity_date: cells[3].textContent,
                    _classes: 'highlight'
                })
            }
    
            normalizedAggergate = normalizedAggergate.sort((a,b) => DateTime.fromFormat(a.maturity_date, 'MM-dd-yyyy').toMillis() >  DateTime.fromFormat(b.maturity_date, 'MM-dd-yyyy').toMillis() ? 1 : -1)
    
            if(normalizedAggergate.length > 1) normalizedAggergate[0].date_diff = 'N/A'
            for(let i = 1; i < normalizedAggergate.length; i++) {
                let dateDiff =luxon.Interval.fromDateTimes(DateTime.fromFormat(normalizedAggergate[i - 1].maturity_date, 'MM-dd-yyyy'), DateTime.fromFormat(normalizedAggergate[i].maturity_date, 'MM-dd-yyyy'))
                    .toDuration(['years', 'months', 'days'])
                    .toObject()
    
                for(let key of Object.keys(dateDiff)) {
                    if(dateDiff[key] === 0)
                    delete dateDiff[key]
                }
    
                dateDiff = luxon.Duration.fromObject(dateDiff).toHuman()

                if(dateDiff === '') {
                    dateDiff = '0 days'
                }

                normalizedAggergate[i].date_diff = dateDiff
            }
    
            document.querySelector('#tbill-ladder').insertAdjacentHTML('afterbegin', objectToTable(normalizedAggergate))
        }
        
        document.querySelector('table').addEventListener('click', (evt) => {
            if(evt.srcElement?.parentElement?.parentElement?.nodeName === 'TR') {
                computeTBillLadder()
            }
        })
        computeTBillLadder()
    })
}