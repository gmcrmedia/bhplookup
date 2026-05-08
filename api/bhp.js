function cleanReg(reg) {
  return reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

async function callAnthropic(messages, tools) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      ...(tools ? { tools } : {}),
      messages
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Anthropic error');
  return data;
}

function extractText(data) {
  for (const block of data.content || []) {
    if (block.type === 'text' && block.text.trim()) return block.text.trim();
  }
  return '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = req.query.token || req.headers['x-api-token'];
  if (!token || token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorised.' });
  }

  const reg = cleanReg(req.query.reg || '');
  if (!reg || reg.length < 2 || reg.length > 8) {
    return res.status(400).json({ success: false, error: 'Please provide a valid UK registration plate.' });
  }

  try {
    const searchData = await callAnthropic([{
      role: 'user',
      content: `Search for UK vehicle registration ${reg} and find its BHP, make, model, year and fuel type. Use rapidcarcheck.co.uk, totalcarcheck.co.uk or checkcardetails.co.uk.`
    }], [{ type: 'web_search_20250305', name: 'web_search' }]);

    const searchResult = extractText(searchData);

    if (!searchResult) {
      return res.status(404).json({ success: false, error: 'No search results returned.', reg });
    }

    const extractData = await callAnthropic([{
      role: 'user',
      content: `From this vehicle information, extract the data as JSON only. No explanation, no markdown, just the raw JSON object.\n\nVehicle info:\n${searchResult}\n\nRequired JSON format (use null if unknown):\n{"make":"Ford","model":"Focus","year":"2019","bhp":"150","fuel":"Petrol","found":true}\n\nIf no BHP was found:\n{"found":false,"reason":"why not found"}`
    }]);

    let jsonText = extractText(extractData).replace(/```json|```/g, '').trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    const result = JSON.parse(jsonText);

    if (!result.found) {
      return res.status(404).json({ success: false, error: result.reason || `Could not find BHP for ${reg}.`, reg });
    }

    const name = [result.year, result.make, result.model].filter(Boolean).join(' ');
    const speakText = `${name}, ${result.bhp} brake horsepower${result.fuel ? ', ' + result.fuel : ''}.`;

    return res.status(200).json({ success: true, reg, bhp: result.bhp, make: result.make || null, model: result.model || null, year: result.year || null, fuel: result.fuel || null, speakText });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, reg });
  }
};
