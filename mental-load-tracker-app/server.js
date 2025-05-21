const express = require('express');
const { initDb, addActivity, getActivities } = require('./database'); // Require database functions
const webpush = require('web-push'); // Require web-push
const cron = require('node-cron'); // Require node-cron

const app = express();
const port = 3000;

// Threshold and Alarm Configuration
const MENTAL_LOAD_THRESHOLD = 50; // Example threshold
let alarmSentToday = false; // Flag to prevent multiple alarms per day

// VAPID keys
const vapidPublicKey = 'BDtdxx19apZMa0_DLjv499zeiicpMz76p72yn6VsT2o-qbAe3lF_hVI5M-lYH9XZWPNfPcbQ4adzCwc1hcE2MRs';
const vapidPrivateKey = '6M0YcEKBvwximTVnbZ0rGn7Ggbvc7OiKlu9xMU9VLE0';

// Setup VAPID details
webpush.setVapidDetails(
  'mailto:test@example.com', // Replace with your email
  vapidPublicKey,
  vapidPrivateKey
);

// In-memory store for subscriptions
let subscriptions = [];

// Initialize DB
initDb();

// Middleware
app.use(express.json()); // Ensure this is before route definitions
app.use(express.static('public'));

// Push Notification API Routes
app.post('/api/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ message: 'Invalid subscription object.' });
  }
  
  const existingSubscription = subscriptions.find(sub => sub.endpoint === subscription.endpoint);
  if (existingSubscription) {
    console.log('Subscription already exists.');
    return res.status(200).json({ message: 'Already subscribed.' });
  }

  subscriptions.push(subscription);
  console.log('Subscription added:', subscription);
  res.status(201).json({ message: 'Subscribed successfully.' });
});

app.post('/api/unsubscribe', (req, res) => {
  const subscriptionToRemove = req.body;
  if (!subscriptionToRemove || !subscriptionToRemove.endpoint) {
    return res.status(400).json({ message: 'Invalid subscription object for unsubscribe.' });
  }

  const initialLength = subscriptions.length;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== subscriptionToRemove.endpoint);

  if (subscriptions.length < initialLength) {
    console.log('Subscription removed:', subscriptionToRemove.endpoint);
    res.status(200).json({ message: 'Unsubscribed successfully.' });
  } else {
    console.log('Subscription not found for removal:', subscriptionToRemove.endpoint);
    res.status(404).json({ message: 'Subscription not found.' });
  }
});

// Function to send notifications
function sendNotification(subscription, payload) {
  const options = {
    TTL: 60 * 60 * 24 // Time To Live in seconds (e.g., 24 hours)
  };
  const notificationPayload = JSON.stringify(payload); // Payload must be a string

  webpush.sendNotification(subscription, notificationPayload, options)
    .then(() => console.log('Push notification sent to:', subscription.endpoint))
    .catch(err => console.error('Error sending push notification to:', subscription.endpoint, err));
}

// API Routes for activities
app.post('/api/activities', async (req, res) => {
  const { activity_name, category_path, score } = req.body;
  // Validate input
  if (!activity_name || typeof activity_name !== 'string' ||
      !category_path || typeof category_path !== 'string' ||
      score === undefined || typeof score !== 'number') {
    return res.status(400).json({ message: 'Invalid input. activity_name (string), category_path (string), and score (number) are required.' });
  }
  try {
    const result = await addActivity(activity_name, category_path, score, 'default_user');
    res.status(201).json({ message: 'Activity added successfully', activityId: result.lastID });
    
    // Immediate notification for new activity is now commented out to reduce noise.
    /*
    if (subscriptions.length > 0) {
      const payload = {
        title: 'New Activity Logged!',
        body: `You just logged: ${activity_name} (${score} points)`,
        icon: '/icons/icon-192x192.png' // Example icon path
      };
      console.log(`Triggering immediate notification for activity: ${activity_name}`);
      subscriptions.forEach(sub => {
        sendNotification(sub, payload);
      });
    }
    */

    // Check for threshold alarm
    console.log('Checking for mental load threshold...');
    const today = new Date().toISOString().split('T')[0];
    try {
      // Assuming getActivities can filter by date for all users or a specific user if implemented
      // For now, we sum up all scores for the day as it's a single-user context.
      const activitiesToday = await getActivities({ startDate: today, endDate: today });
      const currentDailyScore = activitiesToday.reduce((sum, activity) => sum + activity.score, 0);
      
      console.log(`Current daily score: ${currentDailyScore}, Threshold: ${MENTAL_LOAD_THRESHOLD}`);

      if (currentDailyScore > MENTAL_LOAD_THRESHOLD && !alarmSentToday) {
        console.log('Mental load threshold exceeded!');
        const alarmPayload = {
          title: 'High Mental Load Alert!',
          body: `Your mental load for today has reached ${currentDailyScore} points, which is above the set threshold. Remember to take a break!`,
          icon: '/icon-192x192.png' // Optional: replace with a specific warning icon
        };
        
        if (subscriptions.length > 0) {
          console.log(`Sending threshold alarm to ${subscriptions.length} subscribers.`);
          subscriptions.forEach(sub => {
            sendNotification(sub, alarmPayload); // sendNotification handles JSON.stringify
          });
          alarmSentToday = true; // Set flag to prevent multiple alarms for the day
          console.log('Threshold alarm sent and flag set to true.');
        } else {
          console.log('No subscribers for threshold alarm.');
        }
      } else if (currentDailyScore <= MENTAL_LOAD_THRESHOLD) {
        // If score drops below threshold (e.g. due to activity deletion - not implemented yet, but good for future)
        // and an alarm was sent, we might want to reset the flag.
        // For now, alarmSentToday is only reset daily.
      } else if (alarmSentToday) {
        console.log('Threshold exceeded, but alarm already sent today.');
      }

    } catch (fetchError) {
      console.error('Error fetching activities for threshold check:', fetchError);
    }

  } catch (error) {
    console.error('Error in POST /api/activities:', error);
    res.status(500).json({ message: 'Failed to add activity to the database.' });
  }
});

app.get('/api/activities', async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const filters = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    
    const activities = await getActivities(filters);
    res.status(200).json(activities);
  } catch (error) {
    console.error('Error in GET /api/activities:', error);
    res.status(500).json({ message: 'Failed to retrieve activities from the database.' });
  }
});

// Original Route for basic check
app.get('/', (req, res) => {
  res.send('Backend is running and database initialized!');
});

// Start server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// --- Daily Summary Notification Task ---
cron.schedule('0 21 * * *', async () => { // Runs daily at 9:00 PM (21:00) UTC
  console.log('Daily summary task running...');
  alarmSentToday = false; // Reset daily alarm flag
  console.log('Daily alarm flag reset.');
  
  const today = new Date().toISOString().split('T')[0];
  let payload;

  try {
    // Fetch activities for the current day for 'default_user' (or all users if not specified)
    const activitiesToday = await getActivities({ startDate: today, endDate: today /* userId: 'default_user' */ });
    
    if (activitiesToday.length > 0) {
      const totalScoreToday = activitiesToday.reduce((sum, activity) => sum + activity.score, 0);
      payload = {
        title: 'Daily Mental Load Summary',
        body: `Today's total mental load: ${totalScoreToday} points. Great job!`,
        icon: '/icon-192x192.png'
      };
    } else {
      payload = {
        title: 'Daily Mental Load Summary',
        body: 'No activities logged today. Take it easy or log some tasks!',
        icon: '/icon-192x192.png'
      };
    }

    if (subscriptions.length > 0) {
      console.log(`Sending daily summary to ${subscriptions.length} subscribers.`);
      subscriptions.forEach(sub => {
        sendNotification(sub, payload); 
      });
    } else {
      console.log('No subscribers for daily summary.');
    }

  } catch (error) {
    console.error('Error fetching or processing daily summary:', error);
  }
}, {
  scheduled: true,
  timezone: "Etc/UTC" // Example: UTC. Adjust to your server's or target user's timezone.
});
