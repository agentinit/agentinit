import { cyan, green, yellow, red, bold, dim } from 'kleur/colors';
import { STATUS, BOX, TREE } from './symbols.js';

function getTerminalWidth(): number {
  const columns = process.stdout.columns;
  return typeof columns === 'number' && columns > 0 ? columns : 80;
}

function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }

  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return '.'.repeat(maxLength);
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

export class Logger {
  private static instance: Logger;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string): void {
    console.log(cyan(STATUS.info), message);
  }

  success(message: string): void {
    console.log(green(STATUS.success), message);
  }

  warning(message: string): void {
    console.log(yellow(STATUS.warning), message);
  }

  warn(message: string): void {
    this.warning(message);
  }

  error(message: string): void {
    console.log(red(STATUS.error), message);
  }

  debug(message: string): void {
    console.log(dim(STATUS.debug), dim(message));
  }

  title(message: string): void {
    console.log(bold(cyan(message)));
  }

  subtitle(message: string): void {
    console.log(bold(message));
  }

  /**
   * Render a title wrapped in a box-drawing border.
   * ┌──────────────────────┐
   * │  AgentInit  Plugins  │
   * └──────────────────────┘
   */
  titleBox(message: string): void {
    const w = getTerminalWidth();
    if (w < 8) {
      console.log(bold(cyan(truncateText(message, w))));
      return;
    }

    const maxInner = Math.max(4, w - 2);
    const inner = Math.min(Math.max(message.length + 4, 40), maxInner);
    const visibleMessage = truncateText(message, inner - 2);
    const padR = Math.max(0, inner - visibleMessage.length - 2);
    console.log(dim(BOX.topLeft + BOX.horizontal.repeat(inner) + BOX.topRight));
    console.log(dim(BOX.vertical) + ' ' + bold(cyan(visibleMessage)) + ' '.repeat(padR) + ' ' + dim(BOX.vertical));
    console.log(dim(BOX.bottomLeft + BOX.horizontal.repeat(inner) + BOX.bottomRight));
  }

  /**
   * Render a section header with box-drawing underline.
   * ── Skills ─────────────────────────
   */
  section(title: string): void {
    const w = getTerminalWidth();
    const lineLen = Math.max(0, w - title.length - 5);
    console.log('');
    console.log(bold(`${BOX.horizontal}${BOX.horizontal} ${title} ${BOX.horizontal.repeat(lineLen)}`));
  }

  /**
   * Render a tree item with branch/last connectors.
   */
  tree(message: string, isLast: boolean): void {
    const connector = isLast ? TREE.last : TREE.branch;
    console.log(`${connector} ${message}`);
  }

}

export const logger = Logger.getInstance();
