export enum TokenType {
  Keyword,
  Identifier,
  Number,
  String,
  Operator,
  Punctuation,
  Annotation,
  EOF,
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const KEYWORDS = new Set([
  'fn', 'let', 'mut', 'return', 'if', 'else', 'for', 'while', 'in',
  'struct', 'enum', 'match', 'unsafe', 'as', 'const', 'true', 'false',
  'pub', 'static', '_', 'extern',
  'u1', 'u2', 'u3', 'u4', 'u8', 'u16', 'u32', 'i32', 'f32', 'bool'
]);

const OPERATORS = new Set([
  '+', '-', '*', '/', '=', '==', '!=', '<', '>', '<=', '>=',
  '&', '|', '!', '->', '=>', '..', '?', '&&', '||', '::'
]);

const PUNCTUATION = new Set([
  '(', ')', '{', '}', '[', ']', ',', ':', ';', '.'
]);

export class Lexer {
  private pos = 0;
  private line = 1;
  private column = 1;

  constructor(private input: string) {}

  private advance(): string {
    if (this.isAtEnd()) return '';
    const char = this.input[this.pos++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char!;
  }

  private peek(): string {
    return this.isAtEnd() ? '' : this.input[this.pos]!;
  }

  private peekNext(): string {
    return this.pos + 1 >= this.input.length ? '' : this.input[this.pos + 1]!;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.input.length;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd() || this.input[this.pos] !== expected) return false;
    this.advance();
    return true;
  }

  private skipWhitespaceAndComments() {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (/\s/.test(char)) {
        this.advance();
      } else if (char === '/' && this.peekNext() === '/') {
        while (!this.isAtEnd() && this.peek() !== '\n') {
          this.advance();
        }
      } else {
        break;
      }
    }
  }

  public nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.isAtEnd()) {
      return { type: TokenType.EOF, value: '', line: this.line, column: this.column };
    }

    const startLine = this.line;
    const startCol = this.column;
    const char = this.peek();

    // Annotations: @export, @inline, @lut
    if (char === '@') {
      this.advance(); // consume @
      let value = '';
      while (!this.isAtEnd() && /[a-zA-Z_]/.test(this.peek())) {
        value += this.advance();
      }
      return { type: TokenType.Annotation, value, line: startLine, column: startCol };
    }

    // Identifiers and Keywords
    if (/[a-zA-Z_]/.test(char)) {
      let value = '';
      while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) {
        value += this.advance();
      }
      return {
        type: KEYWORDS.has(value) || /^u\d+$/.test(value) || /^i\d+$/.test(value) ? TokenType.Keyword : TokenType.Identifier,
        value,
        line: startLine,
        column: startCol,
      };
    }

    // Numeric Literals (including hex, binary, and custom suffixes like 5b3 or 0xFF_u8)
    if (/[0-9]/.test(char)) {
      let value = '';
      
      // Check for 0x or 0b
      if (char === '0' && (this.peekNext() === 'x' || this.peekNext() === 'X' || this.peekNext() === 'b' || this.peekNext() === 'B')) {
        value += this.advance(); // 0
        value += this.advance(); // x or b
      }

      while (!this.isAtEnd() && /[0-9a-fA-F_]/.test(this.peek())) {
        value += this.advance();
      }

      // Check for 'b' suffix like 5b3. Note that 'b' might have been consumed if it's hex, 
      // but in hex '0x5b3' the 'b' is a hex digit. Let's assume 'b' suffix is for decimal/binary only, 
      // or we just check if it's a type suffix.
      // Wait, 'u3' is a type suffix. 'b3' is a bit suffix.
      // If we are at the end of the number, let's see if there's a suffix.
      // Actually, if we saw `_`, we might have consumed it.
      // Let's just consume any alphanumeric characters that follow the number to get the full literal.
      while (!this.isAtEnd() && /[a-zA-Z0-9_]/.test(this.peek())) {
         value += this.advance();
      }

      return { type: TokenType.Number, value, line: startLine, column: startCol };
    }

    // Strings
    if (char === '"') {
      this.advance(); // consume "
      let value = '';
      while (!this.isAtEnd() && this.peek() !== '"') {
        value += this.advance();
      }
      if (!this.isAtEnd()) this.advance(); // consume closing "
      return { type: TokenType.String, value, line: startLine, column: startCol };
    }

    // Multi-character operators
    const twoChars = char + this.peekNext();
    if (OPERATORS.has(twoChars)) {
      this.advance();
      this.advance();
      return { type: TokenType.Operator, value: twoChars, line: startLine, column: startCol };
    }

    // Single-character operators and punctuation
    if (OPERATORS.has(char)) {
      this.advance();
      return { type: TokenType.Operator, value: char, line: startLine, column: startCol };
    }
    if (PUNCTUATION.has(char)) {
      this.advance();
      return { type: TokenType.Punctuation, value: char, line: startLine, column: startCol };
    }

    // Unknown
    this.advance();
    throw new Error(`Unexpected character: ${char} at ${startLine}:${startCol}`);
  }

  public tokenizeAll(): Token[] {
    const tokens: Token[] = [];
    let token;
    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== TokenType.EOF);
    return tokens;
  }
}
