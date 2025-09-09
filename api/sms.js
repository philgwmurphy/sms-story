import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const storyKey = `story:${today}`;
    const countKey = `count:${today}`;
    
    const [currentStory, messageCount] = await Promise.all([
      redis.get(storyKey),
      redis.get(countKey)
    ]);
    
    res.json({
      date: today,
      story: currentStory || "No story started yet today!",
      messageCount: parseInt(messageCount) || 0,
      messagesRemaining: 50 - (parseInt(messageCount) || 0)
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to get story status' });
  }
}
