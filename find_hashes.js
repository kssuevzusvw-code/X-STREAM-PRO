const axios = require('axios');
axios.get('https://www.eporner.com/video-oUNTY1bPIaR/', {headers: {'User-Agent': 'Mozilla/5.0'}})
.then(r => {
    const matches = r.data.match(/hash\s*[:=]\s*['"]([^'"]+)['"]/gi);
    console.log("Matches:", matches);
});
