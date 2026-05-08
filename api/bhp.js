function cleanReg(reg) {
  return reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Check secret token
  const token = req.query.token || req.headers['x-api-token'];
  if (!token || token !== process.env.SECRET_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorised.' });
  }

  const reg = cleanReg(req.query.reg || '');

  if (!reg || reg.length < 2 || reg.length > 8) {
    return res.status(400).json({ success: false, error: 'Please provide a valid UK registration plate.' });
  }

  try {
    const prompt = `You are a UK vehicle data assistant. Find the BHP (brake horsepower) for the UK vehicle with registration plate: ${reg}.

Search for "${reg} BHP UK vehicle registration" and look at results from sites like rapidcarcheck.co.uk, totalcarcheck.co.uk, or checkcardetails.co.uk to find the vehicle details.

Return ONLY a valid JSON object with no other text, no markdown, no backticks:
{"make":"manufacturer","model":"model name","year":"year","bhp":"number only","engine":"e.g. 2.0L","fuel":"Petrol or Diesel or Electric","found":true}

If you cannot find BHP data, return:
{"found":false,"reason":"brief explanation"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Anthropic API error');
    }

    let jsonText = '';
    for (const block of data.content) {
      if (block.type === 'text') {
        jsonText = block.text.replace(/```json|```/g, '').trim();
        break;
      }
    }

    if (!jsonText) throw new Error('No text response from AI');

    const result = JSON.parse(jsonText);

    if (!result.found) {
      return res.status(404).json({
        success: false,
        error: result.reason || `Could not find BHP data for ${reg}.`,
        reg
      });
    }

    const vehicleName = [result.make, result.model].filter(Boolean).join(' ') || 'Vehicle';
    const speakText = `${result.year ? result.year + ' ' : ''}${vehicleName}, ${result.bhp} brake horsepower${result.fuel ? ', ' + result.fuel : ''}.`;

    return res.status(200).json({
      success: true,
      reg,
      bhp: result.bhp,
      make: result.make || null,
      model: result.model || null,
      year: result.year || null,
      fuel: result.fuel || null,
      engine: result.engine || null,
      speakText
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: `Server error: ${err.message}`,
      reg
    });
  }
};
