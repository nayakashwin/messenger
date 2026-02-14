/**
 * ============================================================================
 * MESSENGAR - WhatsApp CLI Client (Personal Number Only)
 * ============================================================================
 * 
 * Simple WhatsApp CLI for personal messaging.
 * 
 * HOW IT WORKS:
 * 1. Run the program and scan QR code with your phone
 * 2. Type any message and press Enter to send it to yourself
 * 3. Messages sent from CLI appear on your phone
 * 4. Messages sent from your phone appear in the CLI
 * 5. All messages are saved to SQLite database
 * 
 * DATABASE:
 * - Source 'cli': Messages sent from this CLI
 * - Source 'phone': Messages sent from your phone
 * - Complete audit trail with timestamps
 * 
 * ============================================================================
 */

// ============================================================================
// MODULE IMPORTS
// ============================================================================

import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import * as readline from 'readline';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { db, MessageRecord } from './database';

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Load configuration from config.yaml file
 */
function loadConfig(): { personal_phone_number: string } {
  try {
    const configFile = fs.readFileSync('./config.yaml', 'utf8');
    const config = yaml.load(configFile) as { personal_phone_number: string };
    console.log('✅ Configuration loaded successfully from config.yaml');
    return config;
  } catch (error) {
    console.error('\n❌ ERROR: Failed to load configuration file!\n');
    if (error instanceof Error) {
      console.error('Details:', error.message);
    }
    console.log('\nMake sure config.yaml exists and contains:');
    console.log('personal_phone_number: "12345678900"\n');
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
let rl: readline.Interface | undefined;
let isAuthenticated: boolean = false;

/**
 * Track messages sent from CLI to distinguish them from phone messages
 * When we send a message, we add it to this Set with a unique key
 * The message_create event handler checks this Set to determine the source
 */
const cliSentMessages: Set<string> = new Set();

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the WhatsApp client
 */
function initializeClient(): void {
  // Validate phone number
  if (PERSONAL_PHONE_NUMBER === "12345678900" || !PERSONAL_PHONE_NUMBER) {
    console.log('\n⚠️  Please configure your phone number in config.yaml\n');
    process.exit(1);
  }
  
  console.log('\n🚀 Initializing WhatsApp client...\n');
  console.log(`📱 Personal number: ${PERSONAL_PHONE_NUMBER}\n`);
  
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
    console.log('\n📱 Scan this QR code with your phone:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for you to scan...\n');
  });
  
  // Authenticated successfully
  client.on('authenticated', () => {
    console.log('\n✅ Authenticated successfully!\n');
  });
  
  // Client is ready to send/receive messages
  client.on('ready', () => {
    console.log('\n🎉 Ready! You can now send messages.\n');
    console.log('💡 Just type a message and press Enter to send\n');
    console.log('Press Ctrl+C to exit\n');
    isAuthenticated = true;
    startInteractiveMode();
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
    // Create a unique key for this message to check if it was sent from CLI
    const messageKey = `${message.body || ''}_${message.timestamp}`;
    
    let source: 'cli' | 'phone';
    let label: string;
    
    // Check if this message was sent from our CLI (tracked in cliSentMessages Set)
    if (cliSentMessages.has(messageKey)) {
      // Message was sent from CLI - mark as cli and remove from tracking
      source = 'cli';
      label = '💻 FROM CLI';
      cliSentMessages.delete(messageKey); // Remove from tracking to prevent memory leak
    } else if (isFromMe) {
      // Message is from me but not tracked - must be from phone
      source = 'phone';
      label = '📱 FROM PHONE';
    } else {
      // Message received from someone else (shouldn't happen with personal number)
      source = 'phone';
      label = '📩 RECEIVED';
    }
    
    // ============================================================================
    // Display message in compact inline format
    // ============================================================================
    const icon = source === 'cli' ? '💻' : '📱';
    const messageText = message.body || '';
    
    // Print inline: Icon [Timestamp] Message
    console.log(`\n${icon} [${timestamp}] ${messageText}`);
    
    if (message.hasMedia) {
      console.log(`   [Media: ${message.type}]`);
    }
    
    // ============================================================================
    // Save to database (silent - no output)
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
      // Database save is silent - no console output to keep CLI clean
    } catch (error) {
      // Silent error - don't clutter the CLI with database errors
    }
    
    // Show prompt again
    if (rl && isAuthenticated) {
      rl.prompt();
    }
  });
  
  // Handle disconnection
  client.on('disconnected', async (reason: string) => {
    console.log('\n⚠️  Disconnected:', reason, '\n');
    isAuthenticated = false;
    try {
      await db.close();
    } catch (error) {
      // Ignore error
    }
    process.exit(0);
  });
  
  // Start the client
  client.initialize();
}

// ============================================================================
// INTERACTIVE MESSAGING
// ============================================================================

/**
 * Start simple interactive mode
 * Just type a message and press Enter to send
 */
function startInteractiveMode(): void {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '💬 > '
  });
  
  rl.prompt();
  
  // Handle user input - any text typed is sent as a message
  rl.on('line', async (line: string) => {
    const message: string = line.trim();
    
    // Skip empty lines
    if (!message) {
      rl?.prompt();
      return;
    }
    
    // Special command: \exit to quit the application
    if (message === '\\exit') {
      await handleExit();
      return;
    }
    
    // Send the message directly (no command prefix needed)
    try {
      if (!client) {
        console.log('\n❌ Client not initialized\n');
        return;
      }
      
      // Track this message as being sent from CLI before sending
      // We use current timestamp as an approximation - the actual timestamp
      // will be set by WhatsApp when the message is created
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const messageKey = `${message}_${currentTimestamp}`;
      cliSentMessages.add(messageKey);
      
      // Also track with +/- 2 second tolerance for timestamp variations
      cliSentMessages.add(`${message}_${currentTimestamp - 1}`);
      cliSentMessages.add(`${message}_${currentTimestamp + 1}`);
      
      await client.sendMessage(PERSONAL_CHAT_ID, message);
      // Message will be displayed by the message_create handler
    } catch (error) {
      console.error('\n❌ Failed to send:', error);
    }
    
    rl?.prompt();
  });
  
  // Handle Ctrl+C
  rl.on('close', async () => {
    await handleExit();
  });
}

/**
 * Exit the application gracefully
 */
async function handleExit(): Promise<void> {
  console.log('\n👋 Closing...\n');
  
  if (client) {
    await client.destroy();
  }
  
  try {
    await db.close();
  } catch (error) {
    // Ignore
  }
  
  process.exit(0);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('    📱 MESSENGAR - WhatsApp CLI');
  console.log('='.repeat(60));
  console.log('\n  Simple messaging to your WhatsApp number');
  console.log('  Just type and press Enter to send\n');
  console.log('  Type \\exit to quit\n');
  console.log('='.repeat(60));
  
  // Initialize database
  try {
    await db.initialize();
  } catch (error) {
    console.error('\n❌ Database initialization failed\n');
    process.exit(1);
  }
  
  // Start WhatsApp client
  initializeClient();
}

// Handle Ctrl+C globally
process.on('SIGINT', async () => {
  await handleExit();
});

// Run main
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
