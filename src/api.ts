/**
 * ============================================================================
 * API MODULE - HTTP Server for Message Sending
 * ============================================================================
 * 
 * This module provides an HTTP API for sending messages to WhatsApp.
 * It runs an Express server that accepts POST requests to send messages.
 * 
 * API ENDPOINT:
 * POST /api/messages
 * 
 * REQUEST BODY:
 * {
 *   "message": "Your message here"
 * }
 * 
 * HEADERS:
 * Content-Type: application/json
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "message": "Message sent successfully",
 *   "timestamp": 1697567890
 * }
 * 
 * ============================================================================
 */

import express, { Request, Response, Application } from 'express';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * API request interface
 */
interface SendMessageRequest {
  message: string;
}

/**
 * API response interface
 */
interface ApiSuccessResponse {
  success: true;
  message: string;
  timestamp: number;
}

interface ApiErrorResponse {
  success: false;
  error: string;
}

/**
 * API configuration interface
 */
interface ApiConfig {
  port: number;
  host: string;
}

// ============================================================================
// API SERVER CLASS
// ============================================================================

/**
 * ApiServer class
 * 
 * Manages the Express HTTP server for sending messages via REST API.
 * 
 * USAGE:
 * ```typescript
 * const api = new ApiServer({
 *   port: 3000,
 *   apiKey: 'your-secret-key',
 *   host: 'localhost'
 * });
 * 
 * await api.start();
 * ```
 */
export class ApiServer {
  /** Express application instance */
  private app: Application;
  
  /** API configuration */
  private config: ApiConfig;
  
  /** Server instance */
  private server: any;
  
  /** Whether the server is running */
  private isRunning: boolean = false;

  /**
   * Callback function to send messages to WhatsApp
   */
  private sendMessageCallback?: (message: string) => Promise<void>;

  /**
   * Constructor
   * 
   * @param {ApiConfig} config - API server configuration
   */
  constructor(config: ApiConfig) {
    this.config = config;
    
    // Initialize Express app
    this.app = express();

    // Setup middleware
    this.app.use(express.json());
    
    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup API routes
   * 
   * @private
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        uptime: process.uptime()
      });
    });

    // Send message endpoint
    this.app.post('/api/messages', async (req: Request, res: Response) => {
      try {
        // Validate request body
        const { message } = req.body as SendMessageRequest;
        
        if (!message || typeof message !== 'string') {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: 'Bad request: Message is required and must be a string'
          };
          return res.status(400).json(errorResponse);
        }

        if (message.trim().length === 0) {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: 'Bad request: Message cannot be empty'
          };
          return res.status(400).json(errorResponse);
        }

        // Check if WhatsApp client is ready
        if (!this.sendMessageCallback) {
          const errorResponse: ApiErrorResponse = {
            success: false,
            error: 'Service unavailable: WhatsApp client not ready'
          };
          return res.status(503).json(errorResponse);
        }

        // Send message via WhatsApp
        await this.sendMessageCallback(message.trim());

        // Send success response
        const successResponse: ApiSuccessResponse = {
          success: true,
          message: 'Message sent successfully',
          timestamp: Math.floor(Date.now() / 1000)
        };

        res.status(200).json(successResponse);
      } catch (error) {
        console.error('❌ API Error:', error);
        
        const errorResponse: ApiErrorResponse = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        };

        res.status(500).json(errorResponse);
      }
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      const errorResponse: ApiErrorResponse = {
        success: false,
        error: 'Not found'
      };
      res.status(404).json(errorResponse);
    });
  }

  /**
   * Set the callback function for sending messages
   * 
   * @param {Function} callback - Function to send messages to WhatsApp
   */
  setSendMessageCallback(callback: (message: string) => Promise<void>): void {
    this.sendMessageCallback = callback;
  }

  /**
   * Start the API server
   * 
   * @returns {Promise<void>}
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  API server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, this.config.host, () => {
          this.isRunning = true;
          console.log(`\n✅ API server started on http://${this.config.host}:${this.config.port}`);
          console.log(`📡 API endpoint: http://${this.config.host}:${this.config.port}/api/messages\n`);
          resolve();
        });

        // Handle server errors
        this.server.on('error', (error: Error) => {
          console.error('❌ API server error:', error);
          reject(error);
        });
      } catch (error) {
        console.error('❌ Failed to start API server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   * 
   * @returns {Promise<void>}
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('✅ API server stopped');
        resolve();
      });
    });
  }

  /**
   * Check if server is running
   * 
   * @returns {boolean} True if running, false otherwise
   */
  isActive(): boolean {
    return this.isRunning;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ApiConfig, SendMessageRequest, ApiSuccessResponse, ApiErrorResponse };
export default ApiServer;