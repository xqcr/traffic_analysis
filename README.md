# Network Traffic Anomaly Detection System

Ever dealt with compromised network equipment? This project tackles a common problem in telecom companies - detecting when customer devices might have been hacked and turned into spam bots or DDoS attackers.

## What's This All About?

Working at an ISP, you quickly learn that customers rarely know their equipment has been compromised until it's too late. Often, the first sign is a massive spike in network traffic. I built this monitoring system to catch these issues early by analyzing traffic patterns in real-time.

The system watches for unusual patterns - like a home PC suddenly sending out massive amounts of data (classic sign of a spam bot) or consuming bandwidth in ways that don't match normal usage. When it spots something fishy, it alerts the team for investigation.

## The Tech Side

### Backend
Built the core with Python, using:
- FastAPI for the API layer
- Redis for handling real-time data
- Pandas/NumPy for number crunching

The backend does the heavy lifting - processing traffic data, running statistical analyses, and figuring out what counts as "unusual" for each user.

### Frontend
The dashboard's built in React with:
- Recharts for visualization
- Tailwind CSS for styling

Focused on making the interface straightforward - you can quickly spot normal vs. suspicious traffic patterns and drill down into specific cases.

## How It Works

1. System collects network traffic data
2. Analyzes patterns using statistical methods (Z-scores mainly)
3. Flags suspicious activity
4. Shows results in real-time on the dashboard

Built a few API endpoints to make everything accessible:
- `/api/anomalies`: Lists detected suspicious activity
- `/api/subscriber/{id}`: Shows specific user's traffic
- `/api/statistics`: Overall network stats



1. **Setting up Redis**
```bash
# Start Redis using Docker
docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
```
2. **Running the System**
```bash
# Process and load data into Redis
python r.py

# Start the FastAPI server
uvicorn api:app --reload

# Start the frontend
npm run dev --prefix ./simple_dashboard
```

3. Access the dashboard at http://localhost:5173/


### Data Structure

The system processes hourly data snapshots for each network device. Data points include:
- `IdSubscriber`: User identifier
- `IdPSX`: Network equipment identifier
- `Start1hPeriod`: Start of 1-hour interval
- `Start10mPeriod`: Start of 10-minute interval
- `UpTx`: Upload traffic (bytes)
- `DownTx`: Download traffic (bytes)

Redis keys follow the format: `{IdPSX} {YYYY-MM-DD HH:MM:SS}`  
Example: `3 2024-01-01 00:00:00`

### Visualization Features

The dashboard provides various traffic analysis views:
- Per-device traffic aggregation over time
- Compromised users' traffic patterns
- Network-wide traffic trends
- Upload vs download comparisons
- Traffic anomaly detection