const twilio = require('twilio');

module.exports = async function(req, res) {
  console.log('Method:', req.method);
  console.log('Body:', req.body);
  
  if (req.method === 'GET') {
    return res.json({ message: 'SMS endpoint working', time: new Date() });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const message = req.body.Body || 'Hello!';
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(`You said: ${message}`);
    
    res.setHeader('Content-Type', 'text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
};
