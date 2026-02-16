/**
 * ============================================================================
 * DAEMON MODULE - Background Process Management
 * ============================================================================
 * 
 * This module provides daemon lifecycle management for running MESSENGAR
 * as a background service. It handles:
 * - PID file management
 * - Signal handling (SIGTERM, SIGINT, SIGUSR1)
 * - File logging
 * - Graceful shutdown
 * 
 * USAGE:
 * ```typescript
 * const daemon = new Daemon('/path/to/pidfile', '/path/to/logfile');
 * await daemon.initialize();
 * 
 * // Setup signal handlers
 * daemon.setupShutdownHandler(async () => {
 *   await cleanup();
 *   daemon.log('Shutting down...');
 * });
 * 
 * // Start daemon
 * daemon.start();
 * ```
 * 
 * ============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Daemon configuration interface
 */
interface DaemonConfig {
  pidFile: string;
  logFile: string;
}

/**
 * Shutdown callback type
 */
type ShutdownCallback = () => Promise<void> | void;

// ============================================================================
// DAEMON CLASS
// ============================================================================

/**
 * Daemon class
 * 
 * Manages daemon lifecycle including PID file, logging, and signal handling.
 * 
 * FEATURES:
 * - PID file creation and cleanup
 * - File-based logging with timestamps
 * - Graceful shutdown on signals
 * - Status checking
 * 
 * USAGE:
 * ```typescript
 * const daemon = new Daemon('/path/to/pidfile', '/path/to/logfile');
 * await daemon.initialize();
 * 
 * daemon.log('Daemon started');
 * 
 * // Setup graceful shutdown
 * daemon.setupShutdownHandler(async () => {
 *   await cleanupResources();
 * });
 * 
 * await daemon.cleanup();
 * ```
 */
export class Daemon {
  /** Path to PID file */
  private pidFile: string;
  
  /** Path to log file */
  private logFile: string;
  
  /** Write stream for log file */
  private logStream: fs.WriteStream | null = null;
  
  /** Process ID */
  private pid: number;
  
  /** Shutdown callback */
  private shutdownCallback: ShutdownCallback | null = null;

  /**
   * Constructor
   * 
   * @param {string} pidFile - Path to PID file
   * @param {string} logFile - Path to log file
   */
  constructor(pidFile: string, logFile: string) {
    this.pidFile = path.resolve(pidFile);
    this.logFile = path.resolve(logFile);
    this.pid = process.pid;
  }

  /**
   * Initialize the daemon
   * 
   * Creates PID file and opens log file for writing.
   * 
   * @returns {Promise<void>}
   */
  async initialize(): Promise<void> {
    try {
      // Check if daemon is already running
      if (fs.existsSync(this.pidFile)) {
        const existingPid = parseInt(fs.readFileSync(this.pidFile, 'utf8').trim());
        
        // Check if process is still running
        try {
          process.kill(existingPid, 0);
          throw new Error(`Daemon is already running with PID ${existingPid}`);
        } catch (e) {
          // Process not running, clean up stale PID file
          this.log(`Cleaning up stale PID file from process ${existingPid}`);
          fs.unlinkSync(this.pidFile);
        }
      }

      // Create PID file
      fs.writeFileSync(this.pidFile, this.pid.toString());
      this.log(`✅ Daemon started with PID ${this.pid}`);
      
      // Setup log file
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.logStream.on('error', (error) => {
        console.error('Log stream error:', error);
      });
      
      this.log('Daemon initialized successfully');
    } catch (error) {
      console.error('Failed to initialize daemon:', error);
      throw error;
    }
  }

  /**
   * Log a message to file and console
   * 
   * @param {string} message - Message to log
   */
  log(message: string): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    
    // Write to console
    console.log(message);
    
    // Write to log file
    if (this.logStream) {
      this.logStream.write(logLine);
    }
  }

  /**
   * Log an error
   * 
   * @param {string} message - Error message
   * @param {Error} error - Error object
   */
  logError(message: string, error: Error): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ❌ ${message}: ${error.message}\n`;
    const stackLine = `[${timestamp}] Stack: ${error.stack}\n`;
    
    console.error(message, error);
    
    if (this.logStream) {
      this.logStream.write(logLine);
      this.logStream.write(stackLine);
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   * 
   * @param {ShutdownCallback} callback - Function to call on shutdown
   */
  setupShutdownHandler(callback: ShutdownCallback): void {
    this.shutdownCallback = callback;

    // Handle SIGTERM (systemd stop)
    process.on('SIGTERM', async () => {
      this.log('\n⚠️  Received SIGTERM signal');
      await this.handleShutdown();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      this.log('\n⚠️  Received SIGINT signal');
      await this.handleShutdown();
    });

    // Handle SIGUSR1 (log rotation or status)
    process.on('SIGUSR1', () => {
      this.log('📊 Daemon status:');
      this.log(`   PID: ${this.pid}`);
      this.log(`   Uptime: ${Math.floor(process.uptime())}s`);
      this.log(`   Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    });

    this.log('Signal handlers configured');
  }

  /**
   * Handle shutdown signal
   * 
   * @private
   */
  private async handleShutdown(): Promise<void> {
    try {
      this.log('🔄 Starting graceful shutdown...');

      // Call shutdown callback if provided
      if (this.shutdownCallback) {
        await this.shutdownCallback();
      }

      await this.cleanup();

      this.log('✅ Daemon shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Cleanup daemon resources
   * 
   * Removes PID file and closes log stream.
   * 
   * @returns {Promise<void>}
   */
  async cleanup(): Promise<void> {
    try {
      // Remove PID file
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
        this.log('✅ PID file removed');
      }

      // Close log stream
      if (this.logStream) {
        await new Promise<void>((resolve) => {
          this.logStream!.end(() => resolve());
        });
        this.logStream = null;
        this.log('✅ Log stream closed');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Check if daemon is running
   * 
   * @returns {boolean} True if running, false otherwise
   */
  static isRunning(pidFile: string): boolean {
    try {
      if (!fs.existsSync(pidFile)) {
        return false;
      }

      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
      
      // Check if process exists
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        // Process not running, clean up stale PID file
        fs.unlinkSync(pidFile);
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Get daemon PID
   * 
   * @param {string} pidFile - Path to PID file
   * @returns {number | null} PID if running, null otherwise
   */
  static getPid(pidFile: string): number | null {
    try {
      if (!fs.existsSync(pidFile)) {
        return null;
      }

      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim());
      
      // Verify process is running
      try {
        process.kill(pid, 0);
        return pid;
      } catch (e) {
        fs.unlinkSync(pidFile);
        return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Send SIGUSR1 signal to daemon to request status
   * 
   * @param {string} pidFile - Path to PID file
   * @returns {boolean} True if signal sent, false otherwise
   */
  static sendStatusSignal(pidFile: string): boolean {
    const pid = Daemon.getPid(pidFile);
    if (!pid) {
      return false;
    }

    try {
      process.kill(pid, 'SIGUSR1');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Kill daemon
   * 
   * @param {string} pidFile - Path to PID file
   * @returns {boolean} True if killed, false otherwise
   */
  static kill(pidFile: string): boolean {
    const pid = Daemon.getPid(pidFile);
    if (!pid) {
      return false;
    }

    try {
      process.kill(pid, 'SIGTERM');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get daemon info
   * 
   * @param {string} pidFile - Path to PID file
   * @returns {object} Daemon information
   */
  static getInfo(pidFile: string): { running: boolean; pid: number | null; pidFile: string } {
    return {
      running: Daemon.isRunning(pidFile),
      pid: Daemon.getPid(pidFile),
      pidFile: path.resolve(pidFile)
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { DaemonConfig, ShutdownCallback };
export default Daemon;