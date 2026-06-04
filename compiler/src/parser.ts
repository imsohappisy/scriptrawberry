import { Token, TokenType, Lexer } from './lexer';
import * as AST from './ast';

export class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(private input: string | Token[]) {
    if (typeof input === 'string') {
      const lexer = new Lexer(input);
      this.tokens = lexer.tokenizeAll();
    } else {
      this.tokens = input;
    }
  }

  private peek(): Token {
    return this.tokens[this.current]!;
  }

  private previous(): Token {
    return this.tokens[this.current - 1]!;
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType, value?: string): boolean {
    if (this.isAtEnd()) return false;
    const token = this.peek();
    if (token.type !== type) return false;
    if (value !== undefined && token.value !== value) return false;
    return true;
  }

  private match(type: TokenType, value?: string): boolean {
    if (this.check(type, value)) {
      this.advance();
      return true;
    }
    return false;
  }

  private consume(type: TokenType, message: string, value?: string): Token {
    if (this.check(type, value)) return this.advance();
    throw new Error(`${message} at ${this.peek().line}:${this.peek().column}, got '${this.peek().value}'`);
  }

  public parse(): AST.Program {
    const body: AST.ASTNode[] = [];
    while (!this.isAtEnd()) {
      body.push(this.parseDeclaration());
    }
    return { type: 'Program', body };
  }

  private parseDeclaration(): AST.ASTNode {
    // Handle annotations like @export, @inline, @lut
    const annotations: AST.Annotation[] = [];
    while (this.check(TokenType.Annotation)) {
      const annot = this.advance();
      annotations.push({ name: annot.value });
    }

    if (this.check(TokenType.Keyword, 'struct')) {
      this.advance();
      return this.parseStructDeclaration();
    }
    if (this.check(TokenType.Keyword, 'enum')) {
      this.advance();
      return this.parseEnumDeclaration();
    }
    if (this.match(TokenType.Keyword, 'fn')) {
      const fn = this.parseFunctionDeclaration();
      fn.modifiers = annotations.map(a => a.name);
      return fn;
    }
    if (this.match(TokenType.Keyword, 'const')) {
      return this.parseConstDeclaration();
    }
    if (this.match(TokenType.Keyword, 'let')) {
      return this.parseVariableDeclaration();
    }
    if (this.match(TokenType.Keyword, 'extern')) {
      return this.parseExternDeclaration();
    }
    return this.parseStatement();
  }

  private parseExternDeclaration(): AST.ExternDeclaration {
    const namespaceToken = this.consume(TokenType.String, 'Expected namespace string after extern');
    const namespace = namespaceToken.value;
    this.consume(TokenType.Punctuation, 'Expected "{" after extern namespace', '{');
    
    const functions: AST.ExternDeclaration['functions'] = [];
    while (!this.check(TokenType.Punctuation, '}')) {
      this.consume(TokenType.Keyword, 'Expected "fn" inside extern block', 'fn');
      const nameToken = this.consume(TokenType.Identifier, 'Expected function name');
      this.consume(TokenType.Punctuation, 'Expected "(" after function name', '(');
      
      const params: AST.Parameter[] = [];
      if (!this.check(TokenType.Punctuation, ')')) {
        do {
          const paramName = this.consume(TokenType.Identifier, 'Expected parameter name');
          this.consume(TokenType.Punctuation, 'Expected ":" after parameter name', ':');
          const paramType = this.parseType();
          params.push({
            type: 'Parameter',
            name: { type: 'Identifier', name: paramName.value } as AST.Identifier,
            paramType,
          });
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, 'Expected ")" after parameters', ')');
      
      let returnType: AST.TypeNode = { name: 'void', isSigned: false };
      if (this.match(TokenType.Operator, '->') || this.match(TokenType.Punctuation, ':')) {
        returnType = this.parseType();
      }
      this.consume(TokenType.Punctuation, 'Expected ";" after extern function signature', ';');
      
      functions.push({
        name: { type: 'Identifier', name: nameToken.value } as AST.Identifier,
        params,
        returnType,
      });
    }
    this.consume(TokenType.Punctuation, 'Expected "}" to close extern block', '}');
    return { type: 'ExternDeclaration', namespace, functions };
  }

  // --- Struct Declaration ---
  private parseStructDeclaration(): AST.StructDeclaration {
    const nameToken = this.consume(TokenType.Identifier, 'Expected struct name');
    const name: AST.Identifier = { type: 'Identifier', name: nameToken.value } as AST.Identifier;

    this.consume(TokenType.Punctuation, 'Expected "{" after struct name', '{');
    const fields: AST.StructField[] = [];

    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      const fieldNameToken = this.consume(TokenType.Identifier, 'Expected field name');
      this.consume(TokenType.Punctuation, 'Expected ":" after field name', ':');
      const fieldType = this.parseType();
      fields.push({
        name: { type: 'Identifier', name: fieldNameToken.value } as AST.Identifier,
        fieldType,
      });
      // Consume optional semicolon or comma
      if (this.check(TokenType.Punctuation, ';')) this.advance();
      else if (this.check(TokenType.Punctuation, ',')) this.advance();
    }

    this.consume(TokenType.Punctuation, 'Expected "}" after struct fields', '}');
    return { type: 'StructDeclaration', name, fields } as AST.StructDeclaration;
  }

  // --- Enum Declaration ---
  private parseEnumDeclaration(): AST.EnumDeclaration {
    const nameToken = this.consume(TokenType.Identifier, 'Expected enum name');
    const name: AST.Identifier = { type: 'Identifier', name: nameToken.value } as AST.Identifier;

    this.consume(TokenType.Punctuation, 'Expected "{" after enum name', '{');
    const variants: AST.EnumVariant[] = [];

    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      const variantNameToken = this.consume(TokenType.Identifier, 'Expected variant name');
      const variantName: AST.Identifier = { type: 'Identifier', name: variantNameToken.value } as AST.Identifier;
      
      let fields: AST.StructField[] | undefined;
      // Check for data-carrying variant: Variant { field: type, ... }
      if (this.check(TokenType.Punctuation, '{')) {
        this.advance();
        fields = [];
        while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
          const fieldNameToken = this.consume(TokenType.Identifier, 'Expected field name');
          this.consume(TokenType.Punctuation, 'Expected ":"', ':');
          const fieldType = this.parseType();
          fields.push({
            name: { type: 'Identifier', name: fieldNameToken.value } as AST.Identifier,
            fieldType,
          });
          if (this.check(TokenType.Punctuation, ',')) this.advance();
        }
        this.consume(TokenType.Punctuation, 'Expected "}"', '}');
      }
      
      variants.push({ name: variantName, fields });
      if (this.check(TokenType.Punctuation, ',')) this.advance();
    }

    this.consume(TokenType.Punctuation, 'Expected "}" after enum variants', '}');
    return { type: 'EnumDeclaration', name, variants } as AST.EnumDeclaration;
  }

  // --- Const Declaration ---
  private parseConstDeclaration(): AST.ConstDeclaration {
    const nameToken = this.consume(TokenType.Identifier, 'Expected constant name');
    this.consume(TokenType.Punctuation, 'Expected ":" after constant name', ':');
    const constType = this.parseType();
    this.consume(TokenType.Operator, 'Expected "=" after type', '=');
    const value = this.parseExpression();
    this.consume(TokenType.Punctuation, 'Expected ";" after constant value', ';');
    return {
      type: 'ConstDeclaration',
      name: { type: 'Identifier', name: nameToken.value } as AST.Identifier,
      constType,
      value,
    } as AST.ConstDeclaration;
  }

  // --- Match Expression ---
  private parseMatchExpression(): AST.MatchExpression {
    const subject = this.parseExpression();
    this.consume(TokenType.Punctuation, 'Expected "{" after match subject', '{');
    const arms: AST.MatchArm[] = [];

    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      const pattern = this.parseMatchPattern();
      
      // Optional guard: if <condition>
      let guard: AST.ASTNode | undefined;
      if (this.match(TokenType.Keyword, 'if')) {
        guard = this.parseExpression();
      }

      this.consume(TokenType.Operator, 'Expected "=>" after pattern', '=>');
      
      // Body: block or expression
      let body: AST.ASTNode;
      if (this.check(TokenType.Punctuation, '{')) {
        body = this.parseBlock();
      } else {
        body = this.parseExpression();
      }
      
      arms.push({ pattern, guard, body });
      if (this.check(TokenType.Punctuation, ',')) this.advance();
    }

    this.consume(TokenType.Punctuation, 'Expected "}" after match arms', '}');
    return { type: 'MatchExpression', subject, arms } as AST.MatchExpression;
  }

  private parseMatchPattern(): AST.MatchPattern {
    // Wildcard: _
    if (this.match(TokenType.Keyword, '_')) {
      return { kind: 'wildcard' };
    }
    
    // Literal pattern: 0b3, 42, etc.
    if (this.check(TokenType.Number)) {
      const token = this.advance();
      return { kind: 'literal', literalValue: token.value };
    }

    // Variant pattern: EnumName::VariantName { bindings }
    const enumName = this.consume(TokenType.Identifier, 'Expected pattern').value;
    this.consume(TokenType.Operator, 'Expected "::" in variant pattern', '::');
    const variantName = this.consume(TokenType.Identifier, 'Expected variant name').value;
    
    let bindings: string[] | undefined;
    if (this.check(TokenType.Punctuation, '{')) {
      this.advance();
      bindings = [];
      while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
        // Handle `..` for struct rest pattern
        if (this.match(TokenType.Operator, '..')) {
          break;
        }
        const binding = this.consume(TokenType.Identifier, 'Expected binding name');
        bindings.push(binding.value);
        if (this.check(TokenType.Punctuation, ',')) this.advance();
      }
      this.consume(TokenType.Punctuation, 'Expected "}"', '}');
    }

    return { kind: 'variant', enumName, variantName, bindings };
  }

  // --- Function Declaration ---
  private parseFunctionDeclaration(): AST.FunctionDeclaration {
    const nameToken = this.consume(TokenType.Identifier, 'Expected function name');
    const name: AST.Identifier = { type: 'Identifier', name: nameToken.value } as AST.Identifier;

    this.consume(TokenType.Punctuation, 'Expected "(" after function name', '(');
    const params: AST.Parameter[] = [];
    
    if (!this.check(TokenType.Punctuation, ')')) {
      do {
        const paramNameToken = this.consume(TokenType.Identifier, 'Expected parameter name');
        this.consume(TokenType.Punctuation, 'Expected ":" after parameter name', ':');
        const paramType = this.parseType();
        params.push({
          type: 'Parameter',
          name: { type: 'Identifier', name: paramNameToken.value } as AST.Identifier,
          paramType,
        });
      } while (this.match(TokenType.Punctuation, ','));
    }
    
    this.consume(TokenType.Punctuation, 'Expected ")" after parameters', ')');
    
    let returnType: AST.TypeNode = { name: 'void' };
    if (this.match(TokenType.Punctuation, ':')) {
      returnType = this.parseType();
    }

    const body = this.parseBlock();
    
    return {
      type: 'FunctionDeclaration',
      name,
      params,
      returnType,
      body,
      modifiers: [],
    };
  }

  private parseType(): AST.TypeNode {
    // Pointer type: &T or &mut T
    if (this.match(TokenType.Operator, '&')) {
      const isMut = this.match(TokenType.Keyword, 'mut');
      const elementType = this.parseType();
      
      // Special case: &str is a fat pointer (struct)
      if (elementType.name === 'str') {
        return { name: '&str', isStruct: true, bitWidth: 64 };
      }
      
      return {
        name: isMut ? `&mut ${elementType.name}` : `&${elementType.name}`,
        isPointer: true,
        isMut,
        elementType,
        bitWidth: 32, // Wasm memory pointers are 32-bit
      };
    }

    // Array type: [T; N]
    if (this.match(TokenType.Punctuation, '[')) {
      const elementType = this.parseType();
      this.consume(TokenType.Punctuation, 'Expected ";" after array element type', ';');
      const sizeToken = this.consume(TokenType.Number, 'Expected array size');
      const arraySize = parseInt(sizeToken.value, 10);
      this.consume(TokenType.Punctuation, 'Expected "]" after array size', ']');
      return {
        name: `[${elementType.name}; ${arraySize}]`,
        isArray: true,
        arraySize,
        elementType,
      };
    }

    const token = this.advance();
    if (token.type !== TokenType.Identifier && token.type !== TokenType.Keyword) {
      throw new Error(`Expected type name at ${token.line}:${token.column}`);
    }
    
    const typeName = token.value;
    let bitWidth: number | undefined;
    let isSigned = false;

    if (typeName.startsWith('u') || typeName.startsWith('i')) {
       const widthStr = typeName.slice(1);
       if (/^\d+$/.test(widthStr)) {
         bitWidth = parseInt(widthStr, 10);
         isSigned = typeName.startsWith('i');
       }
    }
    if (typeName === 'bool') {
      bitWidth = 1;
    }
    if (typeName === 'f32') {
      bitWidth = 32;
    }

    return { name: typeName, bitWidth, isSigned };
  }

  private parseBlock(): AST.BlockStatement {
    this.consume(TokenType.Punctuation, 'Expected "{" before block', '{');
    const body: AST.ASTNode[] = [];
    while (!this.check(TokenType.Punctuation, '}') && !this.isAtEnd()) {
      body.push(this.parseDeclaration());
    }
    this.consume(TokenType.Punctuation, 'Expected "}" after block', '}');
    return { type: 'BlockStatement', body };
  }

  private parseVariableDeclaration(): AST.VariableDeclaration {
    const isMut = this.match(TokenType.Keyword, 'mut');
    const nameToken = this.consume(TokenType.Identifier, 'Expected variable name');
    
    let varType: AST.TypeNode | undefined;
    if (this.match(TokenType.Punctuation, ':')) {
      varType = this.parseType();
    }

    let init: AST.ASTNode | undefined;
    if (this.match(TokenType.Operator, '=')) {
      init = this.parseExpression();
    }
    this.consume(TokenType.Punctuation, 'Expected ";" after variable declaration', ';');

    return {
      type: 'VariableDeclaration',
      name: { type: 'Identifier', name: nameToken.value } as AST.Identifier,
      varType,
      init,
      isMut,
    };
  }

  // --- Statements ---
  private parseStatement(): AST.ASTNode {
    if (this.match(TokenType.Keyword, 'return')) {
      return this.parseReturnStatement();
    }
    if (this.check(TokenType.Keyword, 'if')) {
      this.advance();
      return this.parseIfStatement();
    }
    if (this.check(TokenType.Keyword, 'while')) {
      this.advance();
      return this.parseWhileStatement();
    }
    if (this.check(TokenType.Keyword, 'for')) {
      this.advance();
      return this.parseForStatement();
    }
    if (this.check(TokenType.Keyword, 'match')) {
      this.advance();
      return this.parseMatchExpression();
    }

    // Assignment or expression statement
    const expr = this.parseExpression();
    
    // Check for assignment: expr = value;
    if (this.match(TokenType.Operator, '=')) {
      const value = this.parseExpression();
      this.consume(TokenType.Punctuation, 'Expected ";" after assignment', ';');
      return { type: 'AssignmentExpression', target: expr, value } as AST.AssignmentExpression;
    }
    
    this.consume(TokenType.Punctuation, 'Expected ";" after expression', ';');
    return expr;
  }

  private parseReturnStatement(): AST.ReturnStatement {
    let argument: AST.ASTNode | undefined;
    if (!this.check(TokenType.Punctuation, ';')) {
      argument = this.parseExpression();
    }
    this.consume(TokenType.Punctuation, 'Expected ";" after return', ';');
    return { type: 'ReturnStatement', argument };
  }

  private parseIfStatement(): AST.IfStatement {
    const condition = this.parseExpression();
    const consequent = this.parseBlock();
    let alternate: AST.BlockStatement | AST.IfStatement | undefined;

    if (this.match(TokenType.Keyword, 'else')) {
      if (this.check(TokenType.Keyword, 'if')) {
        this.advance();
        alternate = this.parseIfStatement();
      } else {
        alternate = this.parseBlock();
      }
    }

    return { type: 'IfStatement', condition, consequent, alternate } as AST.IfStatement;
  }

  private parseWhileStatement(): AST.WhileStatement {
    const condition = this.parseExpression();
    const body = this.parseBlock();
    return { type: 'WhileStatement', condition, body } as AST.WhileStatement;
  }

  private parseForStatement(): AST.ForStatement {
    const iterToken = this.consume(TokenType.Identifier, 'Expected iterator variable');
    const iterator: AST.Identifier = { type: 'Identifier', name: iterToken.value } as AST.Identifier;
    this.consume(TokenType.Keyword, 'Expected "in" after iterator', 'in');
    const start = this.parsePrimary();
    this.consume(TokenType.Operator, 'Expected ".." for range', '..');
    const end = this.parsePrimary();
    const body = this.parseBlock();
    return { type: 'ForStatement', iterator, start, end, body } as AST.ForStatement;
  }

  // --- Expressions ---
  private parseExpression(): AST.ASTNode {
    return this.parseEquality();
  }

  private parseEquality(): AST.ASTNode {
    let expr = this.parseComparison();

    while (this.match(TokenType.Operator, '==') || this.match(TokenType.Operator, '!=')) {
      const operator = this.previous().value;
      const right = this.parseComparison();
      expr = { type: 'BinaryExpression', operator, left: expr, right } as AST.BinaryExpression;
    }

    return expr;
  }

  private parseComparison(): AST.ASTNode {
    let expr = this.parseTerm();

    while (this.match(TokenType.Operator, '<') || this.match(TokenType.Operator, '<=') ||
           this.match(TokenType.Operator, '>') || this.match(TokenType.Operator, '>=')) {
      const operator = this.previous().value;
      const right = this.parseTerm();
      expr = { type: 'BinaryExpression', operator, left: expr, right } as AST.BinaryExpression;
    }

    return expr;
  }

  private parseTerm(): AST.ASTNode {
    let expr = this.parseFactor();

    while (this.match(TokenType.Operator, '+') || this.match(TokenType.Operator, '-')) {
      const operator = this.previous().value;
      const right = this.parseFactor();
      expr = { type: 'BinaryExpression', operator, left: expr, right } as AST.BinaryExpression;
    }

    return expr;
  }

  private parseFactor(): AST.ASTNode {
    let expr = this.parseUnary();

    while (this.match(TokenType.Operator, '*') || this.match(TokenType.Operator, '/')) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      expr = { type: 'BinaryExpression', operator, left: expr, right } as AST.BinaryExpression;
    }

    return expr;
  }

  private parseUnary(): AST.ASTNode {
    if (this.match(TokenType.Operator, '&')) {
      const isMut = this.match(TokenType.Keyword, 'mut');
      const argument = this.parseUnary();
      return { type: 'ReferenceExpression', isMut, argument } as AST.ReferenceExpression;
    }
    if (this.match(TokenType.Operator, '*')) {
      const argument = this.parseUnary();
      return { type: 'DereferenceExpression', argument } as AST.DereferenceExpression;
    }
    return this.parsePostfix();
  }

  private parsePostfix(): AST.ASTNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(TokenType.Punctuation, '.')) {
        const prop = this.consume(TokenType.Identifier, 'Expected property name after "."');
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: { type: 'Identifier', name: prop.value } as AST.Identifier,
        } as AST.MemberExpression;
      } else if (this.match(TokenType.Punctuation, '(')) {
        const args: AST.ASTNode[] = [];
        if (!this.check(TokenType.Punctuation, ')')) {
          do {
            args.push(this.parseExpression());
          } while (this.match(TokenType.Punctuation, ','));
        }
        this.consume(TokenType.Punctuation, 'Expected ")" after arguments', ')');
        expr = {
          type: 'CallExpression',
          callee: expr as AST.Identifier, // AST assumes callee is Identifier for now
          args,
        } as AST.CallExpression;
      } else if (this.match(TokenType.Punctuation, '[')) {
        const index = this.parseExpression();
        this.consume(TokenType.Punctuation, 'Expected "]" after index', ']');
        expr = {
          type: 'IndexExpression',
          object: expr,
          index,
        } as AST.IndexExpression;
      } else {
        break;
      }
    }
    return expr;
  }

  private parsePrimary(): AST.ASTNode {
    if (this.match(TokenType.Number)) {
      const token = this.previous();
      return { type: 'Literal', value: token.value, raw: token.value } as AST.Literal;
    }

    if (this.match(TokenType.Keyword, 'true')) {
      return { type: 'Literal', value: true, raw: 'true' } as AST.Literal;
    }
    if (this.match(TokenType.Keyword, 'false')) {
      return { type: 'Literal', value: false, raw: 'false' } as AST.Literal;
    }
    if (this.match(TokenType.String)) {
      return { type: 'StringLiteral', value: this.previous().value } as AST.StringLiteral;
    }
    if (this.match(TokenType.Identifier)) {
      const name = this.previous().value;

      // Check for struct instantiation: TypeName { field: value, ... }
      if (this.check(TokenType.Punctuation, '{')) {
        const saved = this.current;
        this.advance(); // consume {
        if (this.check(TokenType.Identifier) && this.peekAt(this.current + 1)?.value === ':') {
          const fields: { name: AST.Identifier; value: AST.ASTNode }[] = [];
          do {
            const fieldName = this.consume(TokenType.Identifier, 'Expected field name');
            this.consume(TokenType.Punctuation, 'Expected ":" after field name', ':');
            const value = this.parseExpression();
            fields.push({
              name: { type: 'Identifier', name: fieldName.value } as AST.Identifier,
              value,
            });
          } while (this.match(TokenType.Punctuation, ','));
          this.consume(TokenType.Punctuation, 'Expected "}" after struct fields', '}');
          
          return {
            type: 'StructInstantiation',
            structName: { type: 'Identifier', name } as AST.Identifier,
            fields,
          } as AST.StructInstantiation;
        } else {
          this.current = saved;
        }
      }
      
      return { type: 'Identifier', name } as AST.Identifier;
    }
    if (this.match(TokenType.Punctuation, '[')) {
      const elements: AST.ASTNode[] = [];
      if (!this.check(TokenType.Punctuation, ']')) {
        do {
          elements.push(this.parseExpression());
        } while (this.match(TokenType.Punctuation, ','));
      }
      this.consume(TokenType.Punctuation, 'Expected "]" after array elements', ']');
      return { type: 'ArrayExpression', elements } as AST.ArrayExpression;
    }
    if (this.match(TokenType.Punctuation, '(')) {
      const expr = this.parseExpression();
      this.consume(TokenType.Punctuation, 'Expected ")" after expression', ')');
      return expr;
    }
    throw new Error(`Expected expression at ${this.peek().line}:${this.peek().column}, got '${this.peek().value}'`);
  }

  private peekAt(index: number): Token | undefined {
    if (index >= this.tokens.length) return undefined;
    return this.tokens[index];
  }
}
