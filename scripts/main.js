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

function addMaturityDateToTable(table) {
    const headers = Array.from(table.querySelectorAll('th'))

    const issueDateIndex = headers.findIndex(th => {
        return th.textContent.match(/issue date/i)
    })

    const securityTermsIndex = headers.findIndex(th => {
        return [
            th.textContent.match(/Security Type/i) !== null,
            th.textContent.match(/Product Term/i) !== null,
            th.textContent.match(/Product Type/i) !== null,
        ].some(x => x)
    })

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

// Attempt to add maturity dates to all tables that have the correct
Array.from(document.querySelectorAll('table')).map(t => addMaturityDateToTable(t))

// We are on the buy confirmation page
if(document.querySelector('title').textContent === 'BuyDirect - Confirmation') {
    let productType
    let issueDate

    document.querySelector('table').querySelectorAll('tr').forEach((tableRow) => {
        const cells = tableRow.querySelectorAll('td')

        const [field, value] = Array.from(cells).map(c => c.textContent)

        if(field === 'Product Type:') {
            productType = value
        }

        if(field === 'Issue Date:') {
            issueDate = value

            const terms = extractTerms(productType)

            const matureDate = calculateMaturityDate(issueDate, terms)

            tableRow.insertAdjacentHTML('afterend', `<tr><td class="alignrighttop"><strong>Maturity Date:</strong></td><td colspan="3">${matureDate}</td></tr>`)
        }
    })
}
