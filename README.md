# MESSENGAR - WhatsApp Daemon with HTTP API

A background WhatsApp daemon that provides an HTTP API for sending messages and automatically logs all incoming messages to a SQLite database.

## Overview

MESSENGAR is a TypeScript-based WhatsApp daemon designed for personal note-taking and messaging. It runs in the background, provides a REST API for sending messages via HTTP, and automatically saves all messages to a database. Perfect for logging notes, reminders, and any information you want to capture quickly from your phone or via scripts.

### Key Features

- **Daemon Mode**: Runs continuously in the background
- **HTTP API**: Send messages via simple REST API with curl or any HTTP client
- **Database Logging**: All messages saved to SQLite with full metadata
- **Systemd Support**: Auto-start on boot with systemd service
- **Bidirectional Messaging**: Send via API or from your phone
- **Graceful Shutdown**: Proper cleanup on signals
- **File Logging**: All activity logged to file for monitoring

## Project Structure

```
messengar/
├── src/
│   ├── main.ts              # Main daemon entry point
│   ├── api.ts              # HTTP API server
│   ├── daemon.ts           # Daemon lifecycle management
│   └── database.ts         # SQLite database module
├── dist/                   # Compiled JavaScript (auto-generated)
├── config.yaml             # Configuration file
├── messengar.db           # SQLite database (auto-created)
├── messengar-daemon.pid   # PID file (auto-created)
├── messengar-daemon.log   # Daemon log file (auto-created)
├── messengar.service      # Systemd service file
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
└── README.md             # This file
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- WhatsApp on your mobile device
- Linux system with systemd (for auto-start on boot)

### Setup

1. **Navigate to the project directory**:
   ```bash
   cd /home/ash/messengar
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure your phone number**:
   Edit `config.yaml` and replace the placeholder with your WhatsApp number:
   ```yaml
   personal_phone_number: "12345678900"  # Your number with country code
   ```
   
   **Important**:
   - Include country code (e.g., "1" for US/Canada, "44" for UK, "91" for India)
   - Do NOT include the `+` symbol
   - Do NOT include spaces, dashes, or parentheses
   
   **Examples**:
   - US: `12345678900` (for +1-234-567-8900)
   - UK: `447123456789` (for +44-7123-456-789)
   - India: `919876543210` (for +91-98765-43210)

4. **Configure API settings** (optional):
   Edit `config.yaml` to customize daemon and API settings:
   ```yaml
   daemon:
     pid_file: "./messengar-daemon.pid"
     log_file: "./messengar-daemon.log"
   
   api:
     port: 3000
     host: "localhost"
     api_key: "your-secure-api-key"
   ```
   
   **Security Note**: Change the `api_key` to a secure random string before production use.

5. **Compile TypeScript**:
   ```bash
   npm run build
   ```

## Usage

### Running the Daemon

#### Method 1: Manual Start (npm scripts)

```bash
# Start the daemon in background
npm run daemon:start

# Check if daemon is running
npm run daemon:status

# View recent logs
npm run daemon:logs

# Follow logs in real-time
npm run daemon:tail

# Stop the daemon
npm run daemon:stop

# Restart the daemon
npm run daemon:restart
```

#### Method 2: Systemd Service (recommended for auto-start)

**Install the service** (run once):

```bash
# Copy service file to systemd directory
sudo cp messengar.service /etc/systemd/system/

# Reload systemd configuration
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable messengar

# Start the service
sudo systemctl start messengar

# Check service status
sudo systemctl status messengar
```

**Systemd commands**:

```bash
# Start daemon
sudo systemctl start messengar

# Stop daemon
sudo systemctl stop messengar

# Restart daemon
sudo systemctl restart messengar

# Check status
sudo systemctl status messengar

# View logs
sudo journalctl -u messengar -f

# Enable/disable auto-start
sudo systemctl enable messengar
sudo systemctl disable messengar
```

### First Time Setup

When you run the daemon for the first time:

1. A QR code will be displayed in the logs (use `npm run daemon:tail` or `sudo journalctl -u messengar -f`)
2. Open WhatsApp on your phone
3. Go to Settings → Linked Devices → Link a Device
4. Scan the QR code displayed in the logs
5. The daemon will authenticate and be ready to use

**Note**: You only need to scan the QR code once. The session is persisted in `.wwebjs_auth/` folder.

### Sending Messages via HTTP API

Once the daemon is running and authenticated, you can send messages via the HTTP API.

**API Endpoint**: `POST /api/messages`

**Example with curl**:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secure-api-key" \
  -d '{"message": "Buy milk on the way home"}'
```

**Success Response**:
```json
{
  "success": true,
  "message": "Message sent successfully",
  "timestamp": 1697567890
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Unauthorized: Invalid API key"
}
```

**Health Check**:

```bash
curl http://localhost:3000/api/health
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1697567890123,
  "uptime": 123.45
}
```

### Sending Messages from Your Phone

Simply open WhatsApp and send a message to yourself. The daemon will automatically receive and save it to the database.

**Workflow**:
```
Your Phone → WhatsApp → Daemon → Database
```

**Example**:
1. Open WhatsApp on your phone
2. Chat with your own number
3. Send: "Remember to call Mom at 5pm"
4. Daemon automatically saves to database
5. Message appears in daemon logs

### Database Access

All messages are saved to `messengar.db` SQLite database. You can query the database directly:

```bash
# View all messages
sqlite3 messengar.db "SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;"

# Count messages by source
sqlite3 messengar.db "SELECT source, COUNT(*) as count FROM messages GROUP BY source;"

# View messages from today
sqlite3 messengar.db "SELECT * FROM messages WHERE date(timestamp, 'unixepoch') = date('now') ORDER BY timestamp DESC;"

# Search for specific text
sqlite3 messengar.db "SELECT * FROM messages WHERE message_body LIKE '%buy%' ORDER BY timestamp DESC;"
```

### Viewing Logs

**Manual start method**:
```bash
# View last 50 lines
npm run daemon:logs

# Follow logs in real-time
npm run daemon:tail

# Or use tail directly
tail -f messengar-daemon.log
```

**Systemd method**:
```bash
# View service logs
sudo journalctl -u messengar -f

# View last 100 lines
sudo journalctl -u messengar -n 100
```

## Configuration

### config.yaml

```yaml
# Your WhatsApp phone number with country code
personal_phone_number: "12345678900"

# Daemon configuration
daemon:
  pid_file: "./messengar-daemon.pid"
  log_file: "./messengar-daemon.log"

# API configuration
api:
  port: 3000
  host: "localhost"
  api_key: "your-secure-api-key"
```

**Configuration Options**:

- `personal_phone_number`: Your WhatsApp number with country code (required)
- `daemon.pid_file`: Path to store the daemon's process ID
- `daemon.log_file`: Path to store daemon activity logs
- `api.port`: Port number for the HTTP API server
- `api.host`: Host to bind the API server to (use "localhost" for security)
- `api.api_key`: Secret key required for API authentication

## API Reference

### POST /api/messages

Send a message to your WhatsApp number.

**Request Headers**:
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_API_KEY`

**Request Body**:
```json
{
  "message": "Your message here"
}
```

**Response**:
- `200 OK`: Message sent successfully
- `400 Bad Request`: Invalid request
- `401 Unauthorized`: Invalid or missing API key
- `503 Service Unavailable`: WhatsApp client not ready

### GET /api/health

Check if the daemon is running and healthy.

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1697567890123,
  "uptime": 123.45
}
```

## Use Cases

### 1. Personal Note-Taking

Send quick notes to yourself from your phone:
- "Remember to submit taxes by Friday"
- "Meeting agenda: 1. Budget, 2. Timeline, 3. Resources"
- "Idea for app: WhatsApp note daemon"

### 2. Script Integration

Send automated messages from scripts:

```bash
#!/bin/bash
# Send daily reminder
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{"message": "Daily backup completed at '$(date)'"'
```

### 3. System Monitoring

Send alerts from monitoring systems:

```bash
# Disk space alert
if [ $(df / | tail -1 | awk '{print $5}' | sed 's/%//') -gt 90 ]; then
  curl -X POST http://localhost:3000/api/messages \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer your-key" \
    -d '{"message": "⚠️ WARNING: Disk usage over 90%"}'
fi
```

### 4. Task Reminders

Send yourself reminders from cron jobs:

```bash
# Every weekday at 9am
0 9 * * 1-5 curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-key" \
  -d '{"message": "Good morning! Remember to check emails"}'
```

## Architecture

### Components

1. **WhatsApp Client** (`main.ts`)
   - Uses `whatsapp-web.js` library
   - Runs headless Chromium browser via Puppeteer
   - Connects to WhatsApp Web API
   - Handles QR authentication
   - Processes incoming/outgoing messages

2. **HTTP API Server** (`api.ts`)
   - Express.js REST API
   - Single endpoint for sending messages
   - API key authentication
   - Health check endpoint

3. **Daemon Manager** (`daemon.ts`)
   - PID file management
   - Signal handling (SIGTERM, SIGINT, SIGUSR1)
   - File logging
   - Graceful shutdown

4. **Database Module** (`database.ts`)
   - SQLite3 persistent storage
   - Automatic schema creation
   - Message logging with metadata
   - Query capabilities

### Message Flow

```
HTTP Request → API Server → WhatsApp → Your Phone
                                          ↓
Your Phone → WhatsApp → Daemon → Database
```

### Database Schema

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_body TEXT,
  source TEXT CHECK(source IN ('cli', 'phone')),
  sender_number TEXT NOT NULL,
  recipient_number TEXT NOT NULL,
  direction TEXT CHECK(direction IN ('OUTGOING', 'INCOMING')),
  timestamp INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  has_media INTEGER DEFAULT 0,
  media_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security & Privacy

- **Local Only**: All data stored locally in SQLite database
- **No Cloud**: No data sent to external servers (except WhatsApp's own servers)
- **API Authentication**: API key required for all requests
- **Localhost Only**: API binds to localhost by default (change with caution)
- **Session Persistence**: Authentication tokens stored in `.wwebjs_auth/` (excluded from git)
- **Git Ignore**: Database and config files are excluded from version control

## Troubleshooting

### Daemon Won't Start

**Check logs**:
```bash
npm run daemon:logs
# or
sudo journalctl -u messengar -n 50
```

**Common issues**:
- Another instance already running (check with `npm run daemon:status`)
- Port 3000 already in use (change port in config.yaml)
- Missing dependencies (run `npm install`)
- Configuration file not found (ensure `config.yaml` exists)

### QR Code Not Appearing

- Check logs with `npm run daemon:tail` or `sudo journalctl -u messengar -f`
- Ensure daemon is running with `npm run daemon:status`
- Wait a few seconds after daemon starts for QR code to appear

### API Returns 401 Unauthorized

- Check that `Authorization` header includes "Bearer" prefix
- Verify API key matches config.yaml (case-sensitive)
- Example: `Authorization: Bearer your-secure-api-key`

### API Returns 503 Service Unavailable

- Daemon is running but WhatsApp not authenticated
- Check logs for QR code and scan it
- Wait for "WhatsApp client is ready!" message in logs

### Database Errors

If you see constraint errors, delete the old database:
```bash
rm messengar.db
npm run daemon:restart
```

### Connection Issues

- Ensure your phone has internet connection
- Check that WhatsApp Web works in your browser
- Try unlinking and re-linking the device in WhatsApp settings
- Restart the daemon

### TypeScript Compilation Errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Development

### Available Scripts

```bash
# Compile TypeScript to JavaScript
npm run build

# Run the daemon
npm run start

# Build and run in one command
npm run dev

# Clean compiled files
npm run clean

# Daemon management
npm run daemon:start
npm run daemon:stop
npm run daemon:restart
npm run daemon:status
npm run daemon:logs
npm run daemon:tail
```

### TypeScript Compilation

The project uses `tsconfig.json` with these settings:

- Target: ES2020
- Module: CommonJS
- Strict type checking enabled
- Source maps generated
- Output directory: `dist/`

## Advanced Configuration

### Running on Different Port

Edit `config.yaml`:
```yaml
api:
  port: 8080  # Change from 3000 to 8080
```

### Binding to Network Interface (Not Recommended for Security)

Edit `config.yaml`:
```yaml
api:
  host: "0.0.0.0"  # Allows access from other machines
```

**Warning**: This exposes your API to the network. Only use with:
- Firewall rules
- VPN
- Strong API key
- Network isolation

### Log Rotation

For long-running daemons, set up logrotate:

```bash
# Create logrotate config
sudo nano /etc/logrotate.d/messengar
```

Add:
```
/home/ash/messengar/messengar-daemon.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 644 ash ash
}
```

## Future Enhancements

Planned features:

- **Message Search API**: Query and search through message history
- **Export Functionality**: Export messages to CSV, JSON, or Markdown
- **Scheduled Messages**: Send messages at specific times
- **Message Templates**: Pre-defined message formats
- **Webhook Support**: Send webhooks on incoming messages
- **Multi-Number Support**: Support for multiple phone numbers
- **Group Messaging**: Send messages to WhatsApp groups

## Performance Considerations

- **Memory Usage**: ~100-200MB (Chromium headless browser)
- **Disk Usage**: Grows with message count (approx. 1KB per message)
- **CPU Usage**: Minimal when idle, spikes during message sending
- **Network**: Minimal bandwidth (WhatsApp Web protocol)

## Backup & Migration

### Backup Database

```bash
# Copy database file
cp messengar.db messengar.db.backup

# Or export to SQL
sqlite3 messengar.db .dump > messengar_backup.sql
```

### Migrate to New Machine

1. Copy these files:
   - `messengar.db` (database)
   - `.wwebjs_auth/` folder (WhatsApp session)
   - `config.yaml` (configuration)

2. Install dependencies on new machine
3. Run daemon

## Uninstallation

### Manual Start Method

```bash
# Stop daemon
npm run daemon:stop

# Remove files
rm -rf dist node_modules messengar.db messengar-daemon.log messengar-daemon.pid
```

### Systemd Method

```bash
# Stop and disable service
sudo systemctl stop messengar
sudo systemctl disable messengar

# Remove service file
sudo rm /etc/systemd/system/messengar.service
sudo systemctl daemon-reload

# Remove project files
rm -rf /home/ash/messengar
```

## License

ISC License - Feel free to use, modify, and distribute.

## Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - The underlying WhatsApp Web library
- [Puppeteer](https://pptr.dev/) - Browser automation
- [SQLite](https://www.sqlite.org/) - Database engine
- [Express.js](https://expressjs.com/) - Web framework
- [TypeScript](https://www.typescriptlang.org/) - Type system

---

**Note**: This application is for personal use only. It uses WhatsApp Web's unofficial API through a headless browser. WhatsApp's terms of service apply. Use responsibly.