# MESSENGAR - WhatsApp CLI Client

A simple, clean command-line interface for WhatsApp that allows you to send messages to yourself with full audit trail capabilities.

## Overview

MESSENGAR is a TypeScript-based WhatsApp CLI client designed for personal messaging. It connects to your WhatsApp account via WhatsApp Web, allowing you to send messages to your own phone number and receive replies directly in your terminal. All messages are automatically saved to an SQLite database for complete audit trail.

### Key Features

- **Simple Interface**: Just type a message and press Enter to send
- **Bidirectional Messaging**: Send from CLI, receive replies from phone
- **Database Logging**: All messages saved to SQLite with source tracking
- **Clean Display**: Compact inline format with icons and timestamps
- **TypeScript**: Full type safety and modern JavaScript features
- **Persistent Session**: Scan QR code once, stays connected

## Project Structure

```
messengar/
├── src/
│   ├── main.ts              # Main application entry point
│   └── database.ts          # SQLite database module
├── dist/                    # Compiled JavaScript (auto-generated)
├── config.yaml              # Configuration file (phone number)
├── messengar.db            # SQLite database (auto-created)
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- WhatsApp on your mobile device

### Setup

1. **Clone or navigate to the project directory**:
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

4. **Compile TypeScript**:
   ```bash
   npm run build
   ```

5. **Run the application**:
   ```bash
   npm start
   ```

## Usage

### First Time Setup

When you run the application for the first time:

1. A QR code will be displayed in your terminal
2. Open WhatsApp on your phone
3. Go to Settings → Linked Devices → Link a Device
4. Scan the QR code displayed in the terminal
5. The application will authenticate and be ready to use

**Note**: You only need to scan the QR code once. The session is persisted in `.wwebjs_auth/` folder.

### Sending Messages

Once connected, simply type your message and press Enter:

```
💬 > Hello, this is a reminder!
💻 [2:30:45 PM] Hello, this is a reminder!

💬 > Stock alert: AAPL up 5%
💻 [2:31:05 PM] Stock alert: AAPL up 5%

📱 [2:31:30 PM] Thanks for the update!

💬 > 
```

### Receiving Messages

When you reply from your phone, the message appears automatically:

```
📱 [2:31:30 PM] Thanks for the update!
```

### Exiting the Application

Type `\exit` and press Enter:

```
💬 > \exit
👋 Closing...
```

Or press `Ctrl+C` at any time.

## How the Code Works

### Architecture Overview

The application consists of three main components:

1. **WhatsApp Client** (`main.ts`)
   - Uses `whatsapp-web.js` library
   - Runs headless Chromium browser via Puppeteer
   - Connects to WhatsApp Web API
   - Handles QR authentication
   - Processes incoming/outgoing messages

2. **Database Module** (`database.ts`)
   - SQLite3 database for persistent storage
   - Automatic schema creation
   - Stores message metadata and content
   - Provides query capabilities

3. **Interactive Interface** (built-in readline)
   - Reads user input from terminal
   - Displays messages with clean formatting
   - Simple prompt-based interaction

### Message Flow

```
User types message → CLI sends to WhatsApp → Phone receives
                                           ↓
Phone reply → WhatsApp Web → CLI displays → Database saves
```

### Message Source Tracking

The application distinguishes between messages sent from CLI vs. phone:

- **Source 'cli'**: Messages sent from this CLI client
  - Stored with direction 'OUTGOING'
  - Displayed with 💻 icon
  
- **Source 'phone'**: Messages sent from mobile WhatsApp app
  - Stored with direction 'INCOMING'
  - Displayed with 📱 icon

**Implementation Detail**: 
When you send a message from the CLI, it's tracked in a Set with the message content + timestamp. When the `message_create` event fires, the handler checks if the message was in the tracking Set. If yes, it's marked as 'cli'; otherwise, it's 'phone'.

### Database Schema

The SQLite database (`messengar.db`) contains a single table:

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_body TEXT,                    -- Message text content
  source TEXT CHECK(source IN ('cli', 'phone')),  -- 'cli' or 'phone'
  sender_number TEXT NOT NULL,          -- Sender's phone number
  recipient_number TEXT NOT NULL,       -- Recipient's phone number
  direction TEXT CHECK(direction IN ('OUTGOING', 'INCOMING')), -- Message flow
  timestamp INTEGER NOT NULL,           -- Unix timestamp
  chat_id TEXT NOT NULL,                -- WhatsApp chat ID (e.g., "123@c.us")
  has_media INTEGER DEFAULT 0,          -- 1 if has attachments, 0 if not
  media_type TEXT,                      -- Type of media (image, video, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP  -- When record was created
);
```

**Indexes**:
- `idx_messages_timestamp`: For time-based queries
- `idx_messages_source`: For filtering by CLI/phone
- `idx_messages_direction`: For filtering by direction
- `idx_messages_chat_id`: For conversation queries

### Event Handling

The WhatsApp client uses event-driven architecture:

1. **qr**: Emitted when QR code is ready for scanning
2. **authenticated**: Emitted when session is established
3. **ready**: Emitted when client is fully ready to send/receive
4. **message_create**: Emitted for every message (sent OR received)
5. **disconnected**: Emitted when connection is lost

### TypeScript Features

The codebase leverages TypeScript for:

- **Type Safety**: All variables, functions, and APIs are typed
- **Interfaces**: `MessageRecord`, `Config`, `MessageSource`, `MessageDirection`
- **Compile-time Checking**: Catches errors before runtime
- **Modern JavaScript**: ES2020 features with async/await
- **IDE Support**: Autocomplete, refactoring, inline documentation

### Key Type Definitions

```typescript
type MessageSource = 'cli' | 'phone';
type MessageDirection = 'OUTGOING' | 'INCOMING';

interface MessageRecord {
  message_body: string | null;
  source: MessageSource;
  sender_number: string;
  recipient_number: string;
  direction: MessageDirection;
  timestamp: number;
  chat_id: string;
  has_media: number;
  media_type: string | null;
}
```

## Configuration

### config.yaml

```yaml
# Your WhatsApp phone number with country code
personal_phone_number: "12345678900"

# Future features (not yet implemented)
stock_tickers:
  - AAPL
  - GOOGL
  
weather_location: "New York, NY"

nest_integration:
  enabled: false
  
ring_integration:
  enabled: false

message_templates:
  stock_alert: "Stock Alert: {symbol} is at ${price} ({change}%)"
  weather_alert: "Weather Alert: {condition} in {location}"
```

## Development

### Available Scripts

```bash
# Compile TypeScript to JavaScript
npm run build

# Run the compiled application
npm start

# Build and run in one command
npm run dev

# Clean compiled files
npm run clean
```

### TypeScript Compilation

The project uses `tsconfig.json` with these settings:

- Target: ES2020
- Module: CommonJS
- Strict type checking enabled
- Source maps generated
- Output directory: `dist/`

### Database Access

You can query the database directly using SQLite tools:

```bash
# View all messages
sqlite3 messengar.db "SELECT * FROM messages ORDER BY timestamp DESC;"

# Count messages by source
sqlite3 messengar.db "SELECT source, COUNT(*) FROM messages GROUP BY source;"

# View messages from today
sqlite3 messengar.db "SELECT * FROM messages WHERE date(timestamp, 'unixepoch') = date('now');"
```

## Security & Privacy

- **Local Only**: All data stored locally in SQLite database
- **No Cloud**: No data sent to external servers (except WhatsApp's own servers)
- **Session Persistence**: Authentication tokens stored in `.wwebjs_auth/` (excluded from git)
- **Git Ignore**: Database and config files are excluded from version control

## Troubleshooting

### QR Code Not Appearing

- Ensure your terminal supports Unicode/ASCII art
- Try resizing your terminal window
- Restart the application

### Database Errors

If you see constraint errors, delete the old database:
```bash
rm messengar.db
npm start
```

### Connection Issues

- Ensure your phone has internet connection
- Check that WhatsApp Web works in your browser
- Try unlinking and re-linking the device in WhatsApp settings

### TypeScript Compilation Errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
npm run build
```

## Future Enhancements

Planned features (configuration already supported in `config.yaml`):

- **Stock Alerts**: Monitor stock prices and send automatic notifications
- **Weather Alerts**: Get weather updates for configured location
- **Smart Home Integration**: Connect with Nest/Ring devices
- **Message Templates**: Pre-defined message formats for common alerts
- **Scheduled Messages**: Send messages at specific times
- **Message Search**: Query and search through message history
- **Export Functionality**: Export messages to CSV or JSON

## Architecture Benefits

### Why TypeScript?

1. **Type Safety**: Prevents runtime errors through compile-time checking
2. **Self-Documenting**: Types serve as documentation
3. **IDE Support**: Better autocomplete and refactoring tools
4. **Modern Features**: Latest JavaScript features with backward compatibility

### Why SQLite?

1. **Lightweight**: No separate server process needed
2. **File-Based**: Simple single-file database
3. **Reliable**: ACID compliant, battle-tested
4. **Query Support**: Full SQL query capabilities
5. **Zero Configuration**: Works out of the box

### Why WhatsApp Web?

1. **Official API**: Uses WhatsApp's official web client
2. **No API Key**: No need for WhatsApp Business API approval
3. **Personal Use**: Designed for individual accounts
4. **Feature Complete**: Supports all WhatsApp features (media, groups, etc.)

## Contributing

This is a personal project template. Feel free to:

- Fork and modify for your needs
- Add new features (see Future Enhancements)
- Improve error handling
- Add tests
- Enhance documentation

## License

ISC License - Feel free to use, modify, and distribute.

## Acknowledgments

- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) - The underlying WhatsApp Web library
- [Puppeteer](https://pptr.dev/) - Browser automation
- [SQLite](https://www.sqlite.org/) - Database engine
- [TypeScript](https://www.typescriptlang.org/) - Type system

---

**Note**: This application is for personal use only. It uses WhatsApp Web's unofficial API through a headless browser. WhatsApp's terms of service apply. Use responsibly.
