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

  try {
    // Step 1: Get basic DVLA data (£0.02)
    const dvlaRes = await fetch(`https://api.checkcardetails.co.uk/vehicledata/vehicleregistration?v=${reg}`, {
      headers: { 'Authorization': `Bearer ${process.env.CCD_API_KEY}` }
    });
    const dvlaData = await dvlaRes.json();

    if (!dvlaRes.ok || dvlaData.error) {
      return res.status(404).json({ success: false, error: `Vehicle not found: ${reg}`, reg });
    }

    // Step 2: Get spec data including BHP (£0.04)
    const specRes = await fetch(`https://api.checkcardetails.co.uk/vehicledata/vehiclespecdata?v=${reg}`, {
      headers: { 'Authorization': `Bearer ${process.env.CCD_API_KEY}` }
    });
    const specData = await specRes.json();

    const make = dvlaData.make || '';
    const model = dvlaData.model || '';
    const year = dvlaData.yearOfManufacture || '';
    const fuel = dvlaData.fuelType || '';
    const bhp = specData.bhp || specData.powerBhp || specData.power_bhp || null;
    const engine = specData.engineSize || specData.engineCapacity
      ? `${(specData.engineSize || specData.engineCapacity / 1000).toFixed(1)}L`
      : null;

    if (!bhp) {
      return res.status(404).json({
        success: false,
        error: `Found the vehicle (${year} ${make} ${model}) but BHP data is unavailable.`,
        reg, make, model, year, fuel
      });
    }

    const vehicleName = [make, model].filter(Boolean).join(' ') || 'Vehicle';
    const speakText = `${year ? year + ' ' : ''}${vehicleName}, ${bhp} brake horsepower${fuel ? ', ' + fuel.toLowerCase() : ''}.`;

    return res.status(200).json({
      success: true,
      reg, bhp, make, model, year, fuel, engine, speakText
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: `Server error: ${err.message}`, reg });
  }
};
