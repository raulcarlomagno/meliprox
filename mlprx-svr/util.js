module.exports = {
    rawHeadersToHash: (headers) => {
        let objHeaders = {};

        for(let i=0; i < headers.length; i++)
            if(i % 2 == 0) objHeaders[headers[i]] = headers[i+1]; 
        
        return objHeaders;
    },

    millisecToStr: (milliseconds) => {
        let numberEnding = (number) => (number > 1) ? 's' : '';
    
        var temp = Math.floor(milliseconds / 1000);
    
        var years = Math.floor(temp / 31536000);
        if (years) {
            return years + ' year' + numberEnding(years);
        }
        var days = Math.floor((temp %= 31536000) / 86400);
        if (days) {
            return days + ' day' + numberEnding(days);
        }
        var hours = Math.floor((temp %= 86400) / 3600);
        if (hours) {
            return hours + ' hour' + numberEnding(hours);
        }
        var minutes = Math.floor((temp %= 3600) / 60);
        if (minutes) {
            return minutes + ' minute' + numberEnding(minutes);
        }
        var seconds = temp % 60;
        if (seconds) {
            return seconds + ' second' + numberEnding(seconds);
        }
        return 'less than a second';
    }
}