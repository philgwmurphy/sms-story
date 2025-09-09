const { Redis } = require('@upstash/redis');
const twilio = require('twilio');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function(req, res) {
  if (req.method === 'GET') {
    try {
      const today = new Date().toISOString().split('T')[0];
      const storyKey = `story:${today}`;
      const countKey = `count:${today}`;
      
      const currentStory = await redis.get(storyKey) || "No story started yet today!";
      const messageCount = await redis.get(countKey) || 0;
      
      return res.json({
        message: 'SMS endpoint working',
        date: today,
        currentStory: currentStory,
        messageCount: parseInt(messageCount),
        messagesRemaining: 50 - parseInt(messageCount)
      });
    } catch (error) {
      return res.json({ message: 'SMS endpoint working', error: 'Redis connection issue' });
    }
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const fromNumber = req.body.From;
    const messageBody = req.body.Body?.trim();
    
    if (!messageBody) {
      return sendTwiMLResponse(res, "Please send a message to add to the story!");
    }
    
    // Validate message
    const validation = await validateMessage(fromNumber, messageBody);
    if (!validation.isValid) {
      return sendTwiMLResponse(res, validation.error);
    }
    
    // Add to story
    const updatedStory = await addToStory(fromNumber, messageBody);
    
    return sendTwiMLResponse(res, updatedStory);
    
  } catch (error) {
    console.error('Error:', error);
    return sendTwiMLResponse(res, "Something went wrong. Please try again!");
  }
};

async function validateMessage(fromNumber, message) {
  // Character limit check
  if (message.length > 75) {
    return { 
      isValid: false, 
      error: `Message too long! Please keep it under 75 characters. (You sent ${message.length})` 
    };
  }
  
  if (message.length < 1) {
    return { 
      isValid: false, 
      error: "Please send a message to add to the story!" 
    };
  }
  
  // Rate limiting check
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  
  // Check if user sent message in last 10 minutes
  const lastMessageKey = `last:${fromNumber}`;
  const lastMessageTime = await redis.get(lastMessageKey);
  
  if (lastMessageTime) {
    const lastTime = new Date(lastMessageTime);
    if (lastTime > tenMinutesAgo) {
      const waitMinutes = Math.ceil((lastTime.getTime() + 10 * 60 * 1000 - now.getTime()) / 60000);
      return { 
        isValid: false, 
        error: `Please wait ${waitMinutes} more minute(s) before adding to the story.` 
      };
    }
  }
  
  // Check daily message limit
  const today = now.toISOString().split('T')[0];
  const dailyCountKey = `count:${today}`;
  const currentCount = await redis.get(dailyCountKey) || 0;
  
  if (parseInt(currentCount) >= 50) {
    return { 
      isValid: false, 
      error: "Today's story is complete! Check back tomorrow for a new story." 
    };
  }
  
  return { isValid: true };
}

async function addToStory(fromNumber, newMessage) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  // Get current story
  const storyKey = `story:${today}`;
  const currentStory = await redis.get(storyKey) || "";
  
  // Build new story
  let updatedStory;
  if (currentStory) {
    updatedStory = currentStory + " " + newMessage;
  } else {
    updatedStory = newMessage;
  }
  
  // Update story with 24hr expiry
  await redis.set(storyKey, updatedStory, { ex: 86400 });
  
  // Update rate limiting counters
  await redis.set(`last:${fromNumber}`, now.toISOString(), { ex: 86400 });
  
  // Increment daily count
  const dailyCountKey = `count:${today}`;
  await redis.incr(dailyCountKey);
  await redis.expire(dailyCountKey, 86400);
  
  return updatedStory;
}

function sendTwiMLResponse(res, message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  
  res.setHeader('Content-Type', 'text/xml');
  res.send(twiml.toString());
}
