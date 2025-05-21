self.addEventListener('push', event => {
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('Error parsing push data:', e);
    // Provide a default structure if parsing fails or data is not JSON
    data = { title: 'Mental Load Tracker', body: 'You have a new notification.' };
  }

  // Use title from payload if available, otherwise a default
  const title = data.title || 'New Activity Logged!'; 
  
  // Construct body: if activity_name and score are present, use them. Otherwise, use data.body or a default.
  const body = (data.activity_name && data.score !== undefined) 
               ? `${data.activity_name} (+${data.score} points)` 
               : (data.body || 'Check your updates.');
  
  const options = {
    body: body,
    icon: './icon-192x192.png', // Optional: Add an icon to public folder
    badge: './badge-72x72.png'  // Optional: Add a badge to public folder
    // You can add more options like 'data' for click actions, 'tag' for grouping, etc.
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('install', event => {
  console.log('Service worker installing...');
  // self.skipWaiting(); // Optionally force immediate activation
});

self.addEventListener('activate', event => {
  console.log('Service worker activating...');
  // event.waitUntil(clients.claim()); // Optionally take control of open pages immediately
});
