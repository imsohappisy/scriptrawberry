export type NodeType =
  | 'Program'
  | 'FunctionDeclaration'
  | 'Parameter'
  | 'BlockStatement'
  | 'VariableDeclaration'
  | 'ConstDeclaration'
  | 'IfStatement'
  | 'ForStatement'
  | 'WhileStatement'
  | 'ReturnStatement'
  | 'BinaryExpression'
  | 'AssignmentExpression'
  | 'Identifier'
  | 'Literal'
  | 'StructDeclaration'
  | 'StructInstantiation'
  | 'MemberExpression'
  | 'EnumDeclaration'
  | 'MatchExpression'
  | 'ExternDeclaration'
  | 'StringLiteral'
  | 'EnumVariantRef'
  | 'CallExpression'
  | 'ArrayExpression'
  | 'IndexExpression'
  | 'ReferenceExpression'
  | 'DereferenceExpression';

export interface ASTNode {
  type: NodeType;
  loc?: { start: number; end: number };
}

export interface Program extends ASTNode {
  type: 'Program';
  body: ASTNode[];
}

export interface FunctionDeclaration extends ASTNode {
  type: 'FunctionDeclaration';
  name: Identifier;
  params: Parameter[];
  returnType: TypeNode;
  body: BlockStatement;
  modifiers: string[]; // e.g., 'export'
}

export interface ExternDeclaration extends ASTNode {
  type: 'ExternDeclaration';
  namespace: string;
  functions: {
    name: Identifier;
    params: Parameter[];
    returnType: TypeNode;
  }[];
}

export interface Parameter extends ASTNode {
  type: 'Parameter';
  name: Identifier;
  paramType: TypeNode;
}

export interface StringLiteral extends ASTNode {
  type: 'StringLiteral';
  value: string;
}

export interface BlockStatement extends ASTNode {
  type: 'BlockStatement';
  body: ASTNode[];
}

export interface VariableDeclaration extends ASTNode {
  type: 'VariableDeclaration';
  name: Identifier;
  varType?: TypeNode;
  init?: ASTNode;
  isMut: boolean;
}

export interface IfStatement extends ASTNode {
  type: 'IfStatement';
  condition: ASTNode;
  consequent: BlockStatement;
  alternate?: BlockStatement | IfStatement;
}

export interface ForStatement extends ASTNode {
  type: 'ForStatement';
  iterator: Identifier;
  start: ASTNode;
  end: ASTNode;
  body: BlockStatement;
}

export interface WhileStatement extends ASTNode {
  type: 'WhileStatement';
  condition: ASTNode;
  body: BlockStatement;
}

export interface ReturnStatement extends ASTNode {
  type: 'ReturnStatement';
  argument?: ASTNode;
}

export interface BinaryExpression extends ASTNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface AssignmentExpression extends ASTNode {
  type: 'AssignmentExpression';
  target: ASTNode; // Identifier or MemberExpression
  value: ASTNode;
}

export interface CallExpression extends ASTNode {
  type: 'CallExpression';
  callee: Identifier;
  args: ASTNode[];
}

export interface ArrayExpression extends ASTNode {
  type: 'ArrayExpression';
  elements: ASTNode[];
}

export interface IndexExpression extends ASTNode {
  type: 'IndexExpression';
  object: ASTNode;
  index: ASTNode;
}

export interface ReferenceExpression extends ASTNode {
  type: 'ReferenceExpression';
  isMut: boolean;
  argument: ASTNode; // typically Identifier or IndexExpression or MemberExpression
}

export interface DereferenceExpression extends ASTNode {
  type: 'DereferenceExpression';
  argument: ASTNode;
}

export interface Identifier extends ASTNode {
  type: 'Identifier';
  name: string;
}

export interface Literal extends ASTNode {
  type: 'Literal';
  value: string | number | boolean;
  raw: string;
  literalType?: TypeNode; // When there's a suffix, e.g., 5b3 -> u3
}

// --- Phase 2: Struct support ---

export interface StructDeclaration extends ASTNode {
  type: 'StructDeclaration';
  name: Identifier;
  fields: StructField[];
}

export interface StructField {
  name: Identifier;
  fieldType: TypeNode;
}

export interface StructInstantiation extends ASTNode {
  type: 'StructInstantiation';
  structName: Identifier;
  fields: { name: Identifier; value: ASTNode }[];
}

export interface MemberExpression extends ASTNode {
  type: 'MemberExpression';
  object: ASTNode;
  property: Identifier;
}

// Type nodes represent type annotations
export interface TypeNode {
  name: string;      // e.g., 'u3', 'i32', 'f32', 'ObjectState'
  bitWidth?: number; // e.g., 3 for 'u3'
  isSigned?: boolean;
  isStruct?: boolean; // true if this is a struct type
  isEnum?: boolean;   // true if this is an enum type
  // Array extensions
  isArray?: boolean;
  arraySize?: number;
  elementType?: TypeNode;
  // Pointer extensions
  isPointer?: boolean;
  isMut?: boolean;
}

// --- Phase 3: Enum, Match, Const ---

export interface ConstDeclaration extends ASTNode {
  type: 'ConstDeclaration';
  name: Identifier;
  constType: TypeNode;
  value: ASTNode;
}

export interface EnumDeclaration extends ASTNode {
  type: 'EnumDeclaration';
  name: Identifier;
  variants: EnumVariant[];
}

export interface EnumVariant {
  name: Identifier;
  fields?: StructField[];  // data-carrying variant (tagged union)
}

export interface EnumVariantRef extends ASTNode {
  type: 'EnumVariantRef';
  enumName: Identifier;
  variantName: Identifier;
  fields?: { name: Identifier; value: ASTNode }[];  // construction with data
}

export interface MatchExpression extends ASTNode {
  type: 'MatchExpression';
  subject: ASTNode;
  arms: MatchArm[];
}

export interface MatchArm {
  pattern: MatchPattern;
  guard?: ASTNode;   // optional "if condition" guard
  body: ASTNode;     // expression or block
}

export interface MatchPattern {
  kind: 'variant' | 'wildcard' | 'literal';
  enumName?: string;
  variantName?: string;
  bindings?: string[];    // destructured field names
  literalValue?: string;  // for literal patterns like 0b3
}

// Annotation (e.g., @export, @inline, @lut)
export interface Annotation {
  name: string;         // e.g., 'export', 'inline', 'lut'
  args?: string[];      // optional arguments
}
