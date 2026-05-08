const https = require('https');
const http = require('http');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        ...options.headers
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

function extractBHP(html) {
  const patterns = [
    /bhp[^0-9]*([0-9]+)/i,
    /([0-9]+)\s*bhp/i,
    /"bhp"\s*:\s*"?([0-9]+)"?/i,
    /brake.horsepower[^0-9]*([0-9]+)/i,
    /power[^0-9]*([0-9]+)\s*bhp/i,
    /([0-9]+)\s*PS/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1] && parseInt(m[1]) > 20 && parseInt(m[1]) < 2000) {
      return m[1];
    }
  }
  return null;
}

function extractField(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function cleanReg(reg) {
  return reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const reg = cleanReg(req.query.reg || '');

  if (!reg || reg.length < 2 || reg.length > 8) {
    return res.status(400).json({ success: false, error: 'Please provide a valid UK registration plate.' });
  }

  const sources = [
    `https://www.rapidcarcheck.co.uk/free-check/?reg_plate=${reg}`,
    `https://totalcarcheck.co.uk/FreeCheck?vrm=${reg}`,
    `https://www.checkcardetails.co.uk/cardetails/${reg}`,
  ];

  let lastError = null;

  for (const url of sources) {
    try {
      const { body } = await fetchUrl(url);

      const bhp = extractBHP(body);

      if (bhp) {
        const make = extractField(body, [
          /"make"\s*:\s*"([^"]+)"/i,
          /Make[^>]*>([A-Z][a-zA-Z]+)/,
          /<td[^>]*>Make<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
          /manufacturer[^>]*>([^<]{2,20})</i,
        ]);

        const model = extractField(body, [
          /"model"\s*:\s*"([^"]+)"/i,
          /Model[^>]*>([A-Z][a-zA-Z0-9 ]+)/,
          /<td[^>]*>Model<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
        ]);

        const year = extractField(body, [
          /"year"\s*:\s*"?([12][0-9]{3})"?/i,
          /Year[^0-9]*([12][0-9]{3})/,
          /(20[0-2][0-9]|19[0-9]{2})/,
        ]);

        const fuel = extractField(body, [
          /"fuel"\s*:\s*"([^"]+)"/i,
          /Fuel[^>]*>\s*(Petrol|Diesel|Electric|Hybrid)/i,
          /(Petrol|Diesel|Electric|Hybrid)/i,
        ]);

        const engine = extractField(body, [
          /([0-9]\.[0-9]+)\s*[Ll]itre/,
          /([0-9]\.[0-9]+)L/,
          /"engineSize"\s*:\s*"?([0-9]+)"?/i,
        ]);

        const vehicleName = [make, model].filter(Boolean).join(' ') || 'Vehicle';
        const speakText = `${year ? year + ' ' : ''}${vehicleName} — ${bhp} brake horsepower${fuel ? ', ' + fuel : ''}.`;

        return res.status(200).json({
          success: true,
          reg: reg,
          bhp: bhp,
          make: make || null,
          model: model || null,
          year: year || null,
          fuel: fuel || null,
          engine: engine || null,
          speakText,
          source: url
        });
      }
    } catch (err) {
      lastError = err.message;
      continue;
    }
  }

  return res.status(404).json({
    success: false,
    error: `Could not find BHP data for ${reg}. The registration may be incorrect, or the vehicle data is unavailable.`,
    reg
  });
};
