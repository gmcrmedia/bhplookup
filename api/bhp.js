function cleanReg(reg) {
  return reg.replace(/[^A-Z0-9]/gi, '').toUpperCase();
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

  // --- debug: confirm env vars are present ---
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 7) : 'MISSING';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for the BHP of UK registered vehicle with number plate ${reg}. Look on sites like rapidcarcheck.co.uk, totalcarcheck.co.uk or checkcardetails.co.uk.

Return ONLY a JSON object, no other text, no markdown:
{"make":"Ford","model":"Focus","year":"2019","bhp":"150","fuel":"Petrol","found":true}

If BHP cannot be found return:
{"found":false,"reason":"brief reason"}`
        }]
      })
    });

    const raw = await response.text();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: 'Anthropic API error',
        status: response.status,
        raw: raw.substring(0, 500),
        hasKey,
        keyPrefix,
        reg
      });
    }

    const data = JSON.parse(raw);

    let jsonText = '';
    for (const block of data.content) {
      if (block.type === 'text' && block.text.trim()) {
        jsonText = block.text.replace(/```json|```/g, '').trim();
        break;
      }
    }

    if (!jsonText) {
      return res.status(500).json({ success: false, error: 'No text in AI response', contentTypes: data.content.map(b => b.type), reg });
    }

    const result = JSON.parse(jsonText);

    if (!result.found) {
      return res.status(404).json({ success: false, error: result.reason || `Could not find BHP for ${reg}.`, reg });
    }

    const name = [result.year, result.make, result.model].filter(Boolean).join(' ');
    const speakText = `${name}, ${result.bhp} brake horsepower${result.fuel ? ', ' + result.fuel : ''}.`;

    return res.status(200).json({ success: true, reg, bhp: result.bhp, make: result.make || null, model: result.model || null, year: result.year || null, fuel: result.fuel || null, speakText });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, stack: err.stack.substring(0, 300), hasKey, keyPrefix, reg });
  }
};
