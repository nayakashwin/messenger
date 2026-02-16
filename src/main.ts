/**
 * ============================================================================
 * MESSENGAR - WhatsApp Daemon with HTTP API
 * ============================================================================
 * 
 * MESSENGAR is a WhatsApp daemon that runs in the background and provides
 * an HTTP API for sending messages. It automatically saves all incoming
 * messages to a SQLite database.
 * 
 * FEATURES:
 * - Runs as a background daemon process
 * - HTTP API for sending messages via curl
 * - Automatic message logging to SQLite database
 * - Systemd service support for auto-start on boot
 * - Graceful shutdown on signals
 * - File-based logging
 * 
 * HOW IT WORKS:
 * 1. Run the daemon (manually or via systemd)
 * 2. Scan QR code once for authentication
 * 3. Send messages via HTTP API or from your phone
 * 4. All messages are saved to SQLite database
 * 
 * ============================================================================
 */

// ============================================================================
// MODULE IMPORTS
// ============================================================================

import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { db, MessageRecord } from './database';
import { ApiServer } from './api';
import { Daemon } from './daemon';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Configuration interface
 */
interface Config {
  personal_phone_number: string;
  daemon: {
    pid_file: string;
    log_file: string;
  };
  api: {
    port: number;
    host: string;
    api_key: string;
  };
}

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Load configuration from config.yaml file
 */
function loadConfig(): Config {
  try {
    const configFile = fs.readFileSync('./config.yaml', 'utf8');
    const config = yaml.load(configFile) as Config;
    console.log('✅ Configuration loaded successfully from config.yaml');
    return config;
  } catch (error) {
    console.error('\n❌ ERROR: Failed to load configuration file!\n');
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
    console.log('\nMake sure config.yaml exists and contains:');
    console.log('personal_phone_number: "12345678900"\n');
    console.log('daemon:\n  pid_file: "./messengar-daemon.pid"\n  log_file: "./messengar-daemon.log"\n');
    console.log('api:\n  port: 3000\n  host: "localhost"\n  api_key: "your-secret-key"\n');
    process.exit(1);
  }
}

// Load configuration
const config = loadConfig();
const PERSONAL_PHONE_NUMBER: string = config.personal_phone_number;
const PERSONAL_CHAT_ID: string = `${PERSONAL_PHONE_NUMBER}@c.us`;

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let client: Client | undefined;
let apiServer: ApiServer | undefined;
let daemon: Daemon | undefined;
let isAuthenticated: boolean = false;

/**
 * Track messages sent from API to distinguish them from phone messages
 */
const apiSentMessages: Set<string> = new Set();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the WhatsApp client
 */
function initializeClient(): void {
  // Validate phone number
  if (PERSONAL_PHONE_NUMBER === "12345678900" || !PERSONAL_PHONE_NUMBER) {
    daemon?.log('\n⚠️  Please configure your phone number in config.yaml\n');
    process.exit(1);
  }
  
  daemon?.log(`🚀 Initializing WhatsApp client...`);
  daemon?.log(`📱 Personal number: ${PERSONAL_PHONE_NUMBER}`);
  
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });
  
  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  // QR code for authentication
  client.on('qr', (qr: string) => {
    daemon?.log('\n📱 Scan this QR code with your phone:\n');
    qrcode.generate(qr, { small: true });
    daemon?.log('\n⏳ Waiting for you to scan...\n');
  });
  
  // Authenticated successfully
  client.on('authenticated', () => {
    daemon?.log('\n✅ Authenticated successfully!');
  });
  
  // Client is ready to send/receive messages
  client.on('ready', () => {
    daemon?.log('\n🎉 WhatsApp client is ready!');
    daemon?.log('📡 Daemon is now accepting messages via API and from your phone');
    daemon?.log('📝 All messages will be saved to database\n');
    isAuthenticated = true;
  });
  
  // Handle incoming/outgoing messages
  client.on('message_create', async (message: Message) => {
    // Ignore messages from other numbers - only process messages to/from personal number
    const isFromPersonal: boolean = message.from === PERSONAL_CHAT_ID;
    const isToPersonal: boolean = message.to === PERSONAL_CHAT_ID;
    
    if (!isFromPersonal && !isToPersonal) {
      return; // Ignore messages from other numbers
    }
    
    const isFromMe: boolean = message.fromMe;
    const timestamp = new Date(message.timestamp * 1000).toLocaleTimeString();
    
    // ============================================================================
    // Determine message source
    // ============================================================================
    const messageKey = `${message.body || ''}_${message.timestamp}`;
    
    let source: 'cli' | 'phone';
    let label: string;
    
    // Check if this message was sent from our API
    if (apiSentMessages.has(messageKey)) {
      source = 'cli';
      label = '💻 FROM API';
      apiSentMessages.delete(messageKey);
    } else if (isFromMe) {
      source = 'phone';
      label = '📱 FROM PHONE';
    } else {
      source = 'phone';
      label = '📩 RECEIVED';
    }
    
    // ============================================================================
    // Log message
    // ============================================================================
    const icon = source === 'cli' ? '💻' : '📱';
    const messageText = message.body || '';
    
    daemon?.log(`${icon} [${timestamp}] ${messageText}`);
    
    if (message.hasMedia) {
      daemon?.log(`   [Media: ${message.type}]`);
    }
    
    // ============================================================================
    // Save to database (silent)
    // ============================================================================
    try {
      const senderNumber: string = message.from.replace('@c.us', '');
      const recipientNumber: string = message.to.replace('@c.us', '');
      
      const messageRecord: MessageRecord = {
        message_body: message.body,
        source: source,
        sender_number: senderNumber,
        recipient_number: recipientNumber,
        direction: source === 'cli' ? 'OUTGOING' : 'INCOMING',
        timestamp: message.timestamp,
        chat_id: source === 'cli' ? message.to : message.from,
        has_media: message.hasMedia ? 1 : 0,
        media_type: message.type || null
      };
      
      await db.saveMessage(messageRecord);
    } catch (error) {
      daemon?.logError('Failed to save message to database', error as Error);
    }
  });
  
  // Handle disconnection
  client.on('disconnected', async (reason: string) => {
    daemon?.log(`\n⚠️  Disconnected: ${reason}`);
    isAuthenticated = false;
    try {
      await db.close();
    } catch (error) {
      // Ignore error
    }
    process.exit(1);
  });
  
  // Start the client
  client.initialize();
}

// ============================================================================
// MESSAGE SENDING
// ============================================================================

/**
 * Send a message via WhatsApp
 * 
 * @param {string} message - Message to send
 */
async function sendMessage(message: string): Promise<void> {
  if (!client || !isAuthenticated) {
    throw new Error('WhatsApp client not ready');
  }
  
  try {
    // Track this message as being sent from API
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const messageKey = `${message}_${currentTimestamp}`;
    apiSentMessages.add(messageKey);
    
    // Track with tolerance for timestamp variations
    apiSentMessages.add(`${message}_${currentTimestamp - 1}`);
    apiSentMessages.add(`${message}_${currentTimestamp + 1}`);
    
    await client.sendMessage(PERSONAL_CHAT_ID, message);
  } catch (error) {
    throw error;
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('    📱 MESSENGAR - WhatsApp Daemon');
  console.log('='.repeat(60));
  console.log('\n  WhatsApp daemon with HTTP API');
  console.log('  All messages saved to database\n');
  console.log('='.repeat(60));
  
  // Initialize daemon
  try {
    daemon = new Daemon(
      config.daemon.pid_file,
      config.daemon.log_file
    );
    await daemon.initialize();
  } catch (error) {
    console.error('Failed to initialize daemon:', error);
    process.exit(1);
  }
  
  // Setup graceful shutdown
  daemon.setupShutdownHandler(async () => {
    daemon?.log('🔄 Shutting down...');
    
    // Stop API server
    if (apiServer && apiServer.isActive()) {
      await apiServer.stop();
    }
    
    // Stop WhatsApp client
    if (client) {
      await client.destroy();
      daemon?.log('✅ WhatsApp client stopped');
    }
    
    // Close database
    try {
      await db.close();
      daemon?.log('✅ Database closed');
    } catch (error) {
      // Ignore error
    }
  });
  
  // Initialize database
  try {
    await db.initialize();
  } catch (error) {
    daemon?.logError('Database initialization failed', error as Error);
    await daemon?.cleanup();
    process.exit(1);
  }
  
  // Initialize API server
  try {
    apiServer = new ApiServer({
      port: config.api.port,
      host: config.api.host,
      apiKey: config.api.api_key
    });
    
    // Set callback for sending messages
    apiServer.setSendMessageCallback(sendMessage);
    
    // Start API server
    await apiServer.start();
  } catch (error) {
    daemon?.logError('Failed to start API server', error as Error);
    await daemon?.cleanup();
    process.exit(1);
  }
  
  // Start WhatsApp client
  initializeClient();
}

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});