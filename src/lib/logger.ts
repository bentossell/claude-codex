import fs from 'fs';
import path from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  error?: any;
}

class Logger {
  private logFile: string;

  constructor() {
    this.logFile = path.join(process.cwd(), 'app.log');
  }

  private log(level: LogLevel, component: string, message: string, data?: any, error?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...error
      } : undefined
    };

    // Console output
    const color = {
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m'
    }[level];
    
    console.log(`${color}[${entry.timestamp}] [${level.toUpperCase()}] [${component}] ${message}\x1b[0m`);
    if (data) console.log('Data:', JSON.stringify(data, null, 2));
    if (error) console.error('Error:', error);

    // File output
    try {
      fs.appendFileSync(this.logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  debug(component: string, message: string, data?: any) {
    this.log('debug', component, message, data);
  }

  info(component: string, message: string, data?: any) {
    this.log('info', component, message, data);
  }

  warn(component: string, message: string, data?: any) {
    this.log('warn', component, message, data);
  }

  error(component: string, message: string, error?: any, data?: any) {
    this.log('error', component, message, data, error);
  }
}

export const logger = new Logger();