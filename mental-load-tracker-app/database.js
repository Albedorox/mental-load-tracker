const sqlite3 = require('sqlite3').verbose();
const dbPath = './activities.db';

let db = null; // Variable to hold the database connection

const initDb = () => {
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to the database:', err.message);
      return;
    }
    console.log('Connected to the SQLite database.');

    db.run(`CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      activity_name TEXT NOT NULL,
      category_path TEXT NOT NULL,
      score INTEGER NOT NULL,
      user_id TEXT DEFAULT 'default_user'
    )`, (err) => {
      if (err) {
        console.error('Error creating table:', err.message);
      } else {
        console.log('Table "activities" created or already exists.');
      }
      // It's generally better to keep the connection open if the app will make frequent DB calls.
      // For this exercise, we will open and close connection on each function call as per instructions for addActivity and getActivities.
      // However, for initDb, we can close it here or let it be managed by the app's lifecycle.
      // For simplicity in this step, we'll close it. But an alternative is to export 'db' and reuse the connection.
      // db.close((err) => {
      //   if (err) {
      //     console.error('Error closing the database connection:', err.message);
      //   } else {
      //     console.log('Database connection closed after init.');
      //   }
      // });
    });
  });
};

const addActivity = (activityName, categoryPath, score, userId = 'default_user') => {
  const localDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to the database for addActivity:', err.message);
      return Promise.reject(err);
    }
  });

  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO activities (activity_name, category_path, score, user_id) VALUES (?, ?, ?, ?)`;
    localDb.run(sql, [activityName, categoryPath, score, userId], function(err) {
      if (err) {
        console.error('Error adding activity:', err.message);
        localDb.close();
        reject(err);
        return;
      }
      console.log(`A row has been inserted with rowid ${this.lastID}`);
      localDb.close((closeErr) => {
        if (closeErr) {
          console.error('Error closing db after adding activity:', closeErr.message);
          reject(closeErr);
          return;
        }
        resolve({ lastID: this.lastID });
      });
    });
  });
};

const getActivities = (filters = {}) => {
  const { startDate, endDate } = filters;
  const localDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error connecting to the database for getActivities:', err.message);
      return Promise.reject(err); // Ensure promise is rejected on connection error
    }
  });

  return new Promise((resolve, reject) => {
    let sql = `SELECT * FROM activities`;
    const params = [];

    if (startDate && endDate) {
      sql += ` WHERE date(timestamp) >= date(?) AND date(timestamp) <= date(?)`;
      params.push(startDate, endDate);
    } else if (startDate) {
      sql += ` WHERE date(timestamp) >= date(?)`;
      params.push(startDate);
    } else if (endDate) {
      sql += ` WHERE date(timestamp) <= date(?)`;
      params.push(endDate);
    }
    // Default ordering
    sql += ` ORDER BY timestamp DESC`;

    localDb.all(sql, params, (err, rows) => {
      if (err) {
        console.error('Error fetching activities:', err.message);
        localDb.close(() => reject(err)); // Close DB then reject
        return;
      }
      localDb.close((closeErr) => {
        if (closeErr) {
          console.error('Error closing db after fetching activities:', closeErr.message);
          // Still resolve with rows if fetching was successful but closing failed
          resolve(rows); 
        } else {
          resolve(rows);
        }
      });
    });
  });
};

module.exports = {
  initDb,
  addActivity,
  getActivities,
};
