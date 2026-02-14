/**
 * ============================================================================
 * DATABASE MODULE - SQLite3 Message Storage
 * ============================================================================
 * 
 * This module provides persistent storage for all WhatsApp messages using SQLite3.
 * It stores details like:
 * - Message content
 * - Source (CLI or Phone)
 * - Sender and recipient phone numbers
 * - Timestamps
 * - Message direction (sent/received)
 * 
 * FEATURES:
 * - Automatic database initialization with schema creation
 * - Type-safe database operations
 * - Message logging with full metadata
 * - Query functions for message retrieval
 * - Audit trail capabilities
 * 
 * DATABASE SCHEMA:
 * Table: messages
 *   - id: INTEGER PRIMARY KEY AUTOINCREMENT
 *   - message_body: TEXT - The actual message content
 *   - source: TEXT - Where the message originated ('CLI' or 'PHONE')
 *   - sender_number: TEXT - Phone number of sender
 *   - recipient_number: TEXT - Phone number of recipient
 *   - direction: TEXT - 'OUTGOING' (from you) or 'INCOMING' (to you)
 *   - timestamp: DATETIME - When the message was sent/received
 *   - chat_id: TEXT - WhatsApp chat ID (e.g., "1234567890@c.us")
 *   - has_media: INTEGER - 1 if message has attachments, 0 otherwise
 *   - media_type: TEXT - Type of media (image, video, document, etc.)
 *   - created_at: DATETIME - When the record was created in database
 * 
 * ============================================================================
 */

import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Message source enumeration
 * Indicates where the message originated from
 * - 'cli': Messages sent from this CLI
 * - 'phone': Messages sent from the mobile WhatsApp app
 */
export type MessageSource = 'cli' | 'phone';

/**
 * Message direction enumeration
 * Indicates the flow of the message
 */
export type MessageDirection = 'OUTGOING' | 'INCOMING';

/**
 * Message record interface
 * Represents a single message stored in the database
 */
export interface MessageRecord {
  /** Unique identifier for the message */
  id?: number;
  
  /** The actual message text content */
  message_body: string | null;
  
  /** Source of the message: 'CLI' for command line, 'PHONE' for mobile app */
  source: MessageSource;
  
  /** Phone number of the sender (with country code, no + symbol) */
  sender_number: string;
  
  /** Phone number of the recipient (with country code, no + symbol) */
  recipient_number: string;
  
  /** Direction: 'OUTGOING' (from you) or 'INCOMING' (to you) */
  direction: MessageDirection;
  
  /** Unix timestamp when message was sent/received */
  timestamp: number;
  
  /** WhatsApp chat ID in format "number@c.us" */
  chat_id: string;
  
  /** Whether message has media attachments (1 = yes, 0 = no) */
  has_media: number;
  
  /** Type of media if present (image, video, document, audio, etc.) */
  media_type: string | null;
  
  /** ISO timestamp when record was created in database */
  created_at?: string;
}

/**
 * Query options for retrieving messages
 */
export interface QueryOptions {
  /** Limit number of results (default: 100) */
  limit?: number;
  
  /** Offset for pagination (default: 0) */
  offset?: number;
  
  /** Filter by source ('CLI' or 'PHONE') */
  source?: MessageSource;
  
  /** Filter by direction ('OUTGOING' or 'INCOMING') */
  direction?: MessageDirection;
  
  /** Filter by sender number */
  sender_number?: string;
  
  /** Filter by date range - start (ISO format) */
  date_from?: string;
  
  /** Filter by date range - end (ISO format) */
  date_to?: string;
}

/**
 * Database statistics interface
 */
export interface DatabaseStats {
  /** Total number of messages stored */
  total_messages: number;
  
  /** Number of messages from CLI */
  cli_messages: number;
  
  /** Number of messages from Phone */
  phone_messages: number;
  
  /** Number of outgoing messages */
  outgoing_messages: number;
  
  /** Number of incoming messages */
  incoming_messages: number;
  
  /** Date of oldest message */
  oldest_message: string | null;
  
  /** Date of newest message */
  newest_message: string | null;
}

// ============================================================================
// DATABASE CLASS
// ============================================================================

/**
 * MessageDatabase class
 * 
 * Provides all database operations for storing and retrieving WhatsApp messages.
 * Uses SQLite3 for lightweight, file-based storage.
 * 
 * USAGE:
 * ```typescript
 * const db = new MessageDatabase();
 * await db.initialize();
 * 
 * // Save a message
 * await db.saveMessage({
 *   message_body: "Hello!",
 *   source: "CLI",
 *   sender_number: "12345678900",
 *   recipient_number: "12345678900",
 *   direction: "OUTGOING",
 *   timestamp: Date.now(),
 *   chat_id: "12345678900@c.us",
 *   has_media: 0,
 *   media_type: null
 * });
 * 
 * // Get all messages
 * const messages = await db.getMessages({ limit: 10 });
 * 
 * // Close when done
 * await db.close();
 * ```
 */
export class MessageDatabase {
  /** SQLite database connection */
  private db: Database<sqlite3.Database, sqlite3.Statement> | null = null;
  
  /** Database file path */
  private dbPath: string;
  
  /** Whether the database has been initialized */
  private isInitialized: boolean = false;

  /**
   * Constructor
   * 
   * @param {string} dbPath - Optional custom database file path
   *                          Default: './messengar.db' in project root
   */
  constructor(dbPath: string = './messengar.db') {
    this.dbPath = path.resolve(dbPath);
    console.log(`📦 Database path: ${this.dbPath}`);
  }

  /**
   * Initialize the database
   * 
   * Opens the database connection and creates the messages table
   * if it doesn't already exist. Should be called once at startup.
   * 
   * @returns {Promise<void>}
   * @throws {Error} If database cannot be opened or initialized
   */
  async initialize(): Promise<void> {
    try {
      console.log('\n📦 Initializing database...');
      
      // Open database connection
      // sqlite3.OPEN_CREATE will create the file if it doesn't exist
      this.db = await open({
        filename: this.dbPath,
        driver: sqlite3.Database
      });

      console.log('✅ Database connection established');

      // Create the messages table if it doesn't exist
      await this.createSchema();
      
      this.isInitialized = true;
      console.log('✅ Database schema initialized\n');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database schema
   * 
   * Creates the messages table with all required columns and indexes.
   * Called automatically by initialize().
   * 
   * @private
   */
  private async createSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Create messages table
    // Using IF NOT EXISTS to avoid errors if table already exists
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_body TEXT,
        source TEXT NOT NULL CHECK(source IN ('cli', 'phone')),
        sender_number TEXT NOT NULL,
        recipient_number TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('OUTGOING', 'INCOMING')),
        timestamp INTEGER NOT NULL,
        chat_id TEXT NOT NULL,
        has_media INTEGER DEFAULT 0 CHECK(has_media IN (0, 1)),
        media_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for faster queries
    // Index on timestamp for time-based queries
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
      ON messages(timestamp)
    `);

    // Index on source for filtering by CLI/PHONE
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_source 
      ON messages(source)
    `);

    // Index on direction for filtering by OUTGOING/INCOMING
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_direction 
      ON messages(direction)
    `);

    // Index on chat_id for conversation queries
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id 
      ON messages(chat_id)
    `);

    // Composite index for common query patterns
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_source_direction 
      ON messages(source, direction)
    `);
  }

  /**
   * Save a message to the database
   * 
   * Inserts a new message record with all metadata.
   * This is the primary method for logging messages.
   * 
   * @param {MessageRecord} message - The message to save
   * @returns {Promise<number>} The ID of the inserted record
   * @throws {Error} If database is not initialized or insert fails
   */
  async saveMessage(message: MessageRecord): Promise<number> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.db.run(
        `INSERT INTO messages (
          message_body, source, sender_number, recipient_number, 
          direction, timestamp, chat_id, has_media, media_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          message.message_body,
          message.source,
          message.sender_number,
          message.recipient_number,
          message.direction,
          message.timestamp,
          message.chat_id,
          message.has_media,
          message.media_type
        ]
      );

      // result.lastID contains the auto-incremented ID
      return result.lastID || 0;
    } catch (error) {
      console.error('❌ Failed to save message:', error);
      throw error;
    }
  }

  /**
   * Get messages from the database
   * 
   * Retrieves messages with optional filtering and pagination.
   * 
   * @param {QueryOptions} options - Query options for filtering and pagination
   * @returns {Promise<MessageRecord[]>} Array of message records
   * @throws {Error} If database is not initialized
   * 
   * @example
   * // Get last 10 CLI messages
   * const messages = await db.getMessages({ 
   *   source: 'CLI', 
   *   limit: 10 
   * });
   * 
   * @example
   * // Get all messages from today
   * const messages = await db.getMessages({
   *   date_from: '2024-01-01',
   *   date_to: '2024-01-01',
   *   limit: 100
   * });
   */
  async getMessages(options: QueryOptions = {}): Promise<MessageRecord[]> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    // Set defaults
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    // Build WHERE clause dynamically
    const whereConditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.source) {
      whereConditions.push('source = ?');
      params.push(options.source);
    }

    if (options.direction) {
      whereConditions.push('direction = ?');
      params.push(options.direction);
    }

    if (options.sender_number) {
      whereConditions.push('sender_number = ?');
      params.push(options.sender_number);
    }

    if (options.date_from) {
      whereConditions.push('datetime(timestamp, \'unixepoch\') >= ?');
      params.push(options.date_from);
    }

    if (options.date_to) {
      whereConditions.push('datetime(timestamp, \'unixepoch\') <= ?');
      params.push(options.date_to);
    }

    // Construct the query
    let query = 'SELECT * FROM messages';
    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
    }
    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await this.db.all(query, params);
  }

  /**
   * Get message by ID
   * 
   * Retrieves a single message by its database ID.
   * 
   * @param {number} id - The message ID
   * @returns {Promise<MessageRecord | undefined>} The message record or undefined
   */
  async getMessageById(id: number): Promise<MessageRecord | undefined> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    return await this.db.get('SELECT * FROM messages WHERE id = ?', id);
  }

  /**
   * Get database statistics
   * 
   * Returns aggregated statistics about stored messages.
   * Useful for audit and monitoring.
   * 
   * @returns {Promise<DatabaseStats>} Statistics object
   */
  async getStats(): Promise<DatabaseStats> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    // Total messages
    const totalResult = await this.db.get('SELECT COUNT(*) as count FROM messages');
    
    // CLI messages
    const cliResult = await this.db.get(
      "SELECT COUNT(*) as count FROM messages WHERE source = 'CLI'"
    );
    
    // Phone messages
    const phoneResult = await this.db.get(
      "SELECT COUNT(*) as count FROM messages WHERE source = 'PHONE'"
    );
    
    // Outgoing messages
    const outgoingResult = await this.db.get(
      "SELECT COUNT(*) as count FROM messages WHERE direction = 'OUTGOING'"
    );
    
    // Incoming messages
    const incomingResult = await this.db.get(
      "SELECT COUNT(*) as count FROM messages WHERE direction = 'INCOMING'"
    );
    
    // Date range
    const dateRange = await this.db.get(
      'SELECT MIN(datetime(timestamp, \'unixepoch\')) as oldest, MAX(datetime(timestamp, \'unixepoch\')) as newest FROM messages'
    );

    return {
      total_messages: totalResult?.count || 0,
      cli_messages: cliResult?.count || 0,
      phone_messages: phoneResult?.count || 0,
      outgoing_messages: outgoingResult?.count || 0,
      incoming_messages: incomingResult?.count || 0,
      oldest_message: dateRange?.oldest || null,
      newest_message: dateRange?.newest || null
    };
  }

  /**
   * Get message count
   * 
   * Returns the total number of messages in the database.
   * 
   * @returns {Promise<number>} Message count
   */
  async getMessageCount(): Promise<number> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.get('SELECT COUNT(*) as count FROM messages');
    return result?.count || 0;
  }

  /**
   * Search messages by content
   * 
   * Searches for messages containing specific text in the body.
   * Case-insensitive search using SQL LIKE.
   * 
   * @param {string} searchText - Text to search for
   * @param {number} limit - Maximum results (default: 50)
   * @returns {Promise<MessageRecord[]>} Matching messages
   */
  async searchMessages(searchText: string, limit: number = 50): Promise<MessageRecord[]> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    // Use parameterized query with wildcards for LIKE search
    const pattern = `%${searchText}%`;
    
    return await this.db.all(
      `SELECT * FROM messages 
       WHERE message_body LIKE ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [pattern, limit]
    );
  }

  /**
   * Delete old messages
   * 
   * Removes messages older than a specified date.
   * Useful for database maintenance and cleanup.
   * 
   * @param {string} beforeDate - ISO date string (YYYY-MM-DD)
   * @returns {Promise<number>} Number of deleted messages
   */
  async deleteOldMessages(beforeDate: string): Promise<number> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.run(
      `DELETE FROM messages 
       WHERE datetime(timestamp, 'unixepoch') < ?`,
      beforeDate
    );

    return result.changes || 0;
  }

  /**
   * Delete all messages
   * 
   * WARNING: This permanently deletes all message records!
   * 
   * @returns {Promise<number>} Number of deleted messages
   */
  async deleteAllMessages(): Promise<number> {
    if (!this.db || !this.isInitialized) {
      throw new Error('Database not initialized');
    }

    const result = await this.db.run('DELETE FROM messages');
    return result.changes || 0;
  }

  /**
   * Check if database is initialized
   * 
   * @returns {boolean} True if initialized, false otherwise
   */
  isReady(): boolean {
    return this.isInitialized && this.db !== null;
  }

  /**
   * Close the database connection
   * 
   * Should be called when shutting down the application to ensure
   * all data is written and connections are properly closed.
   * 
   * @returns {Promise<void>}
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('\n📦 Database connection closed\n');
    }
  }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

/**
 * Default database instance
 * 
 * Provides a singleton instance of MessageDatabase that can be imported
 * and used throughout the application. The instance is not automatically
 * initialized - you must call initialize() before using it.
 * 
 * USAGE:
 * ```typescript
 * import { db } from './database';
 * 
 * await db.initialize();
 * await db.saveMessage({...});
 * ```
 */
export const db = new MessageDatabase();

export default MessageDatabase;
