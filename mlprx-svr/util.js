module.exports = {
    rawHeadersToHash: (headers) => {
        let objHeaders = {};

        for(let i=0; i < headers.length; i++)
            if(i % 2 == 0) objHeaders[headers[i]] = headers[i+1]; 
        
        return objHeaders;
    }
}