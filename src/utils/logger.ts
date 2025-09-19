import { cyan, green, yellow, red, bold, dim } from 'kleur/colors';

export class Logger {
  private static instance: Logger;
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string): void {
    console.log(cyan('ℹ'), message);
  }

  success(message: string): void {
    console.log(green('✓'), message);
  }

  warning(message: string): void {
    console.log(yellow('⚠'), message);
  }

  warn(message: string): void {
    this.warning(message);
  }

  error(message: string): void {
    console.log(red('✗'), message);
  }

  debug(message: string): void {
    console.log(dim('•'), dim(message));
  }

  title(message: string): void {
    console.log(bold(cyan(message)));
  }

  subtitle(message: string): void {
    console.log(bold(message));
  }
}

export const logger = Logger.getInstance();