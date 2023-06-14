import { Token, TokenType, initScanner, scanToken, tokenTypeStrings } from './scanner'
import { Chunk, OpCode } from './chunk'
import { NUMBER_VAL, OBJ_VAL, Value } from './value'
import { disassembleChunk } from './debug'
import { copyString, ObjFunction } from './object'

class Parser {
    current: Token = new Token()
    previous: Token = new Token()
    hadError: bool = false
    panicMode: bool = false
}

enum Precedence {
    PREC_NONE,
    PREC_ASSIGNMENT, // =
    PREC_OR, // or
    PREC_AND, // and
    PREC_EQUALITY, // == !=
    PREC_COMPARISON, // < > <= >=
    PREC_TERM, // + -
    PREC_FACTOR, // * /
    PREC_UNARY, // ! -
    PREC_CALL, // . ()
    PREC_PRIMARY,
}

type ParseFn = (canAssign: bool) => void

class ParseRule {
    prefix: ParseFn | null
    infix: ParseFn | null
    precedence: Precedence

    constructor(prefix: ParseFn | null, infix: ParseFn | null, precedence: Precedence) {
        this.prefix = prefix
        this.infix = infix
        this.precedence = precedence
    }
}

class Local {
    name: Token = new Token
    depth: i32 = -1 // numbered nesting level, 0 is global, 1 first top-level ..etc
    // This field is true if the local is captured by any later nested function 
    isCaptured: bool = false
}

class Upvalue {
    index: u8 = 0
    isLocal: bool = false
}

enum FunctionType {
    TYPE_FUNCTION,
    TYPE_INITIALIZER,
    TYPE_METHOD,
    TYPE_SCRIPT
}

const U8_COUNT = 256
class Compiler {
    enclosing: Compiler | null = null
    function: ObjFunction = new ObjFunction()
    type: FunctionType = FunctionType.TYPE_SCRIPT

    // keeps track of which stack slots are associated with which local variables or temporaries
    locals: Local[] = new Array<Local>(U8_COUNT).fill(new Local())
    localCount: i32 = 0
    // Remember: going to be the same object referenced in each array slot
    upvalues: Upvalue[] = new Array<Upvalue>(U8_COUNT).fill(new Upvalue())
    scopeDepth: i32 = 0
}

class ClassCompiler {
    enclosing: ClassCompiler | null
    constructor() {
        this.enclosing = null
    }
}

// global variable. TODO: use @global decorator??
let parser: Parser = new Parser()
let current: Compiler = new Compiler()
let currentClass: (ClassCompiler | null) = null;

function currentChunk(): Chunk {
    return current.function.chunk
}

function errorAt(token: Token, message: string): void {
    if (parser.panicMode) return
    parser.panicMode = true
    let errorStr: string = ''
    errorStr = errorStr + `[line ${token.line}] Error`

    if (token.type === TokenType.TOKEN_EOF) {
        errorStr = errorStr + ` at end`
    } else if (token.type === TokenType.TOKEN_ERROR) {
        // nothing
    } else {
        errorStr = errorStr + ` at ${token.lexeme}`
    }

    console.log(`${errorStr}: ${message}`)
    parser.hadError = true
}

function error(message: string): void {
    errorAt(parser.previous, message)
}

function errorAtCurrent(message: string): void {
    errorAt(parser.current, message)
}

// testing the scanner
export function printTokens(source: string): void {
    console.log()
    console.log(`== compiled tokens ==`)
    initScanner(source)
    let line = -1
    let lineStr = ''
    while (true) {
        const token: Token = scanToken()
        if (token.line != line) {
            lineStr = lineStr + `${token.line}`
            line = token.line
        } else {
            lineStr = lineStr + `| `
        }
        lineStr = lineStr + `\t ${tokenTypeStrings[token.type]} \t ${token.lexeme}\n`

        if (token.type == TokenType.TOKEN_EOF) break
    }

    console.log(lineStr)
}

export function compile(source: string): ObjFunction | null {
    initScanner(source)
    const compiler: Compiler = new Compiler() // compiler is stored on the stack in this compile() function
    initCompiler(compiler, FunctionType.TYPE_SCRIPT) // top level compiler


    parser.hadError = false
    parser.panicMode = false

    advance()

    while (!match(TokenType.TOKEN_EOF)) {
        declaration()
    }

    const myFunction: ObjFunction = endCompiler()
    return parser.hadError ? null : myFunction
}

function advance(): void {
    parser.previous = parser.current

    while (true) {
        parser.current = scanToken()
        if (parser.current.type !== TokenType.TOKEN_ERROR) break

        errorAtCurrent(parser.current.lexeme)
    }
}

function consume(type: TokenType, message: string): void {
    if (parser.current.type === type) {
        advance()
        return
    }

    errorAtCurrent(message)
}

function check(type: TokenType): bool {
    return parser.current.type === type
}

// consume the token only if it is the correct type
function match(type: TokenType): bool {
    if (!check(type)) return false
    advance()
    return true
}

function emitByte(byte: i32): void {
    currentChunk().writeChunk(byte, parser.previous.line)
}

function emitJump(instruction: u8): i32 {
    emitByte(instruction)
    emitByte(0xff)
    emitByte(0xff)
    return currentChunk().count - 2
}

function emitBytes(byte1: i32, byte2: i32): void {
    emitByte(byte1)
    emitByte(byte2)
}

function emitLoop(loopStart: i32): void {
    emitByte(OpCode.OP_LOOP)

    const offset = <u16>(currentChunk().count - loopStart + 2)
    if (offset > u16.MAX_VALUE) error("Loop body too large")

    emitByte((offset >> 8) & 0xff)
    emitByte(offset & 0xff)
}

function emitReturn(): void {
    if (current.type == FunctionType.TYPE_INITIALIZER) {
        // In an initializer, instead of pushing nil onto the stack before returning,
        // we load slot zero, which contains the instance
        emitBytes(OpCode.OP_GET_LOCAL, 0);
    } else {
        emitByte(OpCode.OP_NIL);
    }
    emitByte(OpCode.OP_RETURN)
}

function makeConstant(value: Value): u8 {
    const constant: u8 = currentChunk().addConstant(value)
    if (constant > u8.MAX_VALUE) {
        error('Too many constants in one chunk.')
        return 0
    }

    // returns the index of the constant in the value array. Max items is 256
    return <u8>constant
}

function emitConstant(value: Value): void {
    emitBytes(OpCode.OP_CONSTANT, makeConstant(value))
}

function patchJump(offset: i32): void {
    // -2 to adjust for the bytecode for the jump offset itself.
    const jump = currentChunk().count - offset - 2
    // console.log(`patching jump value = ${jump.toString()}`)

    if (<u16>jump > u16.MAX_VALUE) {
        error("Too much code to jump over.")
    }

    currentChunk().code[offset] = (jump >> 8) & 0xff
    currentChunk().code[offset + 1] = jump & 0xff
}

// TODO: can't pass a pointer and initialize it here
function initCompiler(compiler: Compiler, type: FunctionType): void {
    // for top level code, the enclosing compiler is null
    if (type === FunctionType.TYPE_SCRIPT) {
        console.log('== setting up TOP LEVEL compiler ==')
        compiler.enclosing = null
    } else {
        compiler.enclosing = current
    }
    //////////////

    // compiler.function = null
    compiler.type = type
    compiler.localCount = 0
    compiler.scopeDepth = 0
    compiler.function = new ObjFunction()
    
    // store in 'current' global variable
    current = compiler

    if (type !== FunctionType.TYPE_SCRIPT) {
        current.function.name = copyString(parser.previous.lexeme) // different to cLox
        console.log(`== setting up fn ${current.function.name.chars} compiler ==`)
    }

    const local: Local = new Local()
    current.locals[current.localCount] = local
    current.localCount++

    // stack slot 0 for the VM'c own internal use. function name will be '' here
    local.depth = 0
    local.isCaptured = false

    if (type != FunctionType.TYPE_FUNCTION) {
        local.name.lexeme = "this";
    } else {
        local.name.lexeme = "";
    }
}

function endCompiler(): ObjFunction {
    emitReturn()
    const myFunction: ObjFunction = current.function

    // TODO: put behind debug flag
    if (!parser.hadError) {
        // test function name for '' to check if top level code
        disassembleChunk(currentChunk(), myFunction.name.chars !== '' ?  myFunction.name.chars : '<script>')
    }

    // maybe we could have used function type == script to check if top level code, instead of messing about with null
    if (current.enclosing !== null) {
        console.log(`== end enclosing compiler for fn ${current.function.name.chars} ==`)
        current = <Compiler>current.enclosing
    }
    else {
        console.log('== end of TOP LEVEL compiler ==') // only to level compiler will have enclosing as null
    }
    return myFunction
}

function beginScope(): void {
    console.log('beginning scope')
    current.scopeDepth++
}

function endScope(): void {
    current.scopeDepth--
    console.log('ending scope')
    while (current.localCount > 0 && current.locals[current.localCount - 1].depth > current.scopeDepth) {
        console.log('local variable at a higher scope depth')
        if (current.locals[current.localCount - 1].isCaptured) {
            emitByte(OpCode.OP_CLOSE_UPVALUE);
        } else {
            emitByte(OpCode.OP_POP);
        }
        current.localCount--
    }
}

function binary(canAssign: bool): void {
    const operatorType: TokenType = parser.previous.type
    const rule: ParseRule = getRule(operatorType)
    parsePrecedence(<Precedence>(rule.precedence + 1))
    // console.log('token type ' + operatorType.toString())
    switch (operatorType) {
        case TokenType.TOKEN_BANG_EQUAL:
            emitBytes(OpCode.OP_EQUAL, OpCode.OP_NOT)
            break
        case TokenType.TOKEN_EQUAL_EQUAL:
            emitByte(OpCode.OP_EQUAL)
            break
        case TokenType.TOKEN_GREATER:
            emitByte(OpCode.OP_GREATER)
            break
        case TokenType.TOKEN_GREATER_EQUAL:
            emitBytes(OpCode.OP_LESS, OpCode.OP_NOT)
            break
        case TokenType.TOKEN_LESS:
            emitByte(OpCode.OP_LESS)
            break
        case TokenType.TOKEN_LESS_EQUAL:
            emitBytes(OpCode.OP_GREATER, OpCode.OP_NOT)
            break
        case TokenType.TOKEN_PLUS:
            emitByte(OpCode.OP_ADD)
            break
        case TokenType.TOKEN_MINUS:
            emitByte(OpCode.OP_SUBTRACT)
            break
        case TokenType.TOKEN_STAR:
            emitByte(OpCode.OP_MULTIPLY)
            break
        case TokenType.TOKEN_SLASH:
            emitByte(OpCode.OP_DIVIDE)
            break
        default:
            return // Unreachable
    }
}

function call(canAssign: bool): void {
    const argCount: u8 = argumentList();
    emitBytes(OpCode.OP_CALL, argCount);
}
 
function dot(canAssign: bool): void {
    consume(TokenType.TOKEN_IDENTIFIER, "Expect property name after '.'.");
    const name: u8 = identifierConstant(parser.previous);
  
    if (canAssign && match(TokenType.TOKEN_EQUAL)) {
      expression();
      emitBytes(OpCode.OP_SET_PROPERTY, name);
    } else if (match(TokenType.TOKEN_LEFT_PAREN)) {
        const argCount: u8 = argumentList();
        emitBytes(OpCode.OP_INVOKE, name);
        emitByte(argCount);
    }  else {
      emitBytes(OpCode.OP_GET_PROPERTY, name);
    }
}

function literal(canAssign: bool): void {
    switch (parser.previous.type) {
        case TokenType.TOKEN_FALSE: {
            emitByte(OpCode.OP_FALSE)
            break
        }
        case TokenType.TOKEN_NIL: {
            emitByte(OpCode.OP_NIL)
            break
        }
        case TokenType.TOKEN_TRUE: {
            emitByte(OpCode.OP_TRUE)
            break
        }
        default:
            return // Unreachable.
    }
}

function grouping(canAssign: bool): void {
    expression()
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after expression.")
}

function number(canAssign: bool): void {
    const value: f64 = parseFloat(parser.previous.lexeme)
    emitConstant(NUMBER_VAL(value))
}

function or_(canAssign: bool): void {
    const elseJump: i32 = emitJump(<u8>OpCode.OP_JUMP_IF_FALSE)
    const endJump: i32 = emitJump(<u8>OpCode.OP_JUMP)

    patchJump(elseJump)
    emitByte(OpCode.OP_POP)

    parsePrecedence(Precedence.PREC_OR)
    patchJump(endJump)
}

function mString(canAssign: bool): void {
    // trim leading and trailing quotation marks
    const myString = parser.previous.lexeme.substring(1, parser.previous.lexeme.length - 1)
    emitConstant(OBJ_VAL(copyString(myString)))
}

function namedVariable(name: Token, canAssign: bool): void {
    let getOp = 0
    let setOp = 0
    let arg: i32 = resolveLocal(current, name)
    if (arg !== -1) {
        getOp = OpCode.OP_GET_LOCAL
        setOp = OpCode.OP_SET_LOCAL
    } else {
        arg = resolveUpvalue(current, name)
        if (arg !== -1) {
            getOp = OpCode.OP_GET_UPVALUE;
            setOp = OpCode.OP_SET_UPVALUE;
        } else {
            arg = identifierConstant(name)
            getOp = OpCode.OP_GET_GLOBAL
            setOp = OpCode.OP_SET_GLOBAL
        }
    }
    
    

    if (canAssign && match(TokenType.TOKEN_EQUAL)) {
        expression()
        emitBytes(setOp, <u8>arg)
    } else {
        emitBytes(getOp, <u8>arg)
    }
}

function variable(canAssign: bool): void {
    // console.log('variable')
    namedVariable(parser.previous, canAssign)
}

function this_(canAssign: bool): void {
    if (currentClass === null) {
        error("Can't use 'this' outside of a class.");
        return;
    }

    variable(false);
}

function unary(canAssign: bool): void {
    const operatorType: TokenType = parser.previous.type

    // Compile the operand.
    parsePrecedence(Precedence.PREC_UNARY)

    // Emit the operator instruction.
    switch (operatorType) {
        case TokenType.TOKEN_BANG:
            emitByte(OpCode.OP_NOT)
            break
        case TokenType.TOKEN_MINUS:
            emitByte(OpCode.OP_NEGATE)
            break
        default:
            return // unreachable
    }
}

const rules: ParseRule[] = []
rules[TokenType.TOKEN_LEFT_PAREN] = new ParseRule(grouping, call, Precedence.PREC_CALL)
rules[TokenType.TOKEN_RIGHT_PAREN] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_LEFT_BRACE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_RIGHT_BRACE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_COMMA] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_DOT] = new ParseRule(null, dot, Precedence.PREC_CALL)
rules[TokenType.TOKEN_MINUS] = new ParseRule(unary, binary, Precedence.PREC_TERM)
rules[TokenType.TOKEN_PLUS] = new ParseRule(null, binary, Precedence.PREC_TERM)
rules[TokenType.TOKEN_SEMICOLON] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_SLASH] = new ParseRule(null, binary, Precedence.PREC_FACTOR)
rules[TokenType.TOKEN_STAR] = new ParseRule(null, binary, Precedence.PREC_FACTOR)
rules[TokenType.TOKEN_BANG] = new ParseRule(unary, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_BANG_EQUAL] = new ParseRule(null, binary, Precedence.PREC_EQUALITY)
rules[TokenType.TOKEN_EQUAL] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_EQUAL_EQUAL] = new ParseRule(null, binary, Precedence.PREC_EQUALITY)
rules[TokenType.TOKEN_GREATER] = new ParseRule(null, binary, Precedence.PREC_COMPARISON)
rules[TokenType.TOKEN_GREATER_EQUAL] = new ParseRule(null, binary, Precedence.PREC_COMPARISON)
rules[TokenType.TOKEN_LESS] = new ParseRule(null, binary, Precedence.PREC_COMPARISON)
rules[TokenType.TOKEN_LESS_EQUAL] = new ParseRule(null, binary, Precedence.PREC_COMPARISON)
rules[TokenType.TOKEN_IDENTIFIER] = new ParseRule(variable, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_STRING] = new ParseRule(mString, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_NUMBER] = new ParseRule(number, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_AND] = new ParseRule(null, and_, Precedence.PREC_AND)
rules[TokenType.TOKEN_CLASS] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_ELSE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FALSE] = new ParseRule(literal, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FOR] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FUN] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_IF] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_NIL] = new ParseRule(literal, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_OR] = new ParseRule(null, or_, Precedence.PREC_OR)
rules[TokenType.TOKEN_PRINT] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_RETURN] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_SUPER] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_THIS] = new ParseRule(this_, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_TRUE] = new ParseRule(literal, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_VAR] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_WHILE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_ERROR] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_EOF] = new ParseRule(null, null, Precedence.PREC_NONE)

function parsePrecedence(precedence: Precedence): void {
    advance()
    const prefixRule: ParseFn | null = getRule(parser.previous.type).prefix
    if (prefixRule === null) {
        error('Expect expression.')
        return
    }

    const canAssign: bool = precedence <= Precedence.PREC_ASSIGNMENT
    prefixRule(canAssign)

    while (precedence <= getRule(parser.current.type).precedence) {
        advance()
        const infixRule: ParseFn | null = getRule(parser.previous.type).infix
        if (infixRule !== null) infixRule(canAssign)
    }

    if (canAssign && match(TokenType.TOKEN_EQUAL)) {
        error('Invalid assignment target.')
    }
}

function identifierConstant(name: Token): u8 {
    return makeConstant(OBJ_VAL(copyString(name.lexeme)))
}

function identifiersEqual(a: Token, b:Token): bool {
    return a.lexeme === b.lexeme
}

function resolveLocal(compiler: Compiler, name: Token): i32 {
    for (let i: i32 = compiler.localCount - 1; i >= 0; i--) {
        const local: Local = compiler.locals[i]
        // console.log('checking local variable ' + local.name.lexeme + ', against our variable ' + name.lexeme)
        if (identifiersEqual(name, local.name)) {
            if (local.depth == -1) {
                error("Can't read local variable in it's own initializer.")
            }
            return i // index in locals array is same as stack slot
        }
    }

    return -1
}

function addUpvalue(compiler: Compiler, index: u8, isLocal: bool): i32 {
    const localStr = isLocal ? 'true' : 'false'
    // console.log('adding upvalue to compiler with isLocal: ' + localStr)
    // console.log('adding upvalue to compiler with index: ' + index.toString())
    const upvalueCount: i32 = compiler.function.upvalueCount;

    for (let i: i32 = 0; i < upvalueCount; i++) {
        const upvalue: Upvalue = compiler.upvalues[i];
        if (upvalue.index === index && upvalue.isLocal === isLocal) {
            // console.log('found existing upvalue')
            return i;
        }
    }

    if (upvalueCount == U8_COUNT) {
        error("Too many closure variables in function.");
        return 0;
    }

    // add new upvalue object, otherwise they all reference the same one
    compiler.upvalues[upvalueCount] = new Upvalue()
    compiler.upvalues[upvalueCount].isLocal = isLocal;
    compiler.upvalues[upvalueCount].index = index;
    return compiler.function.upvalueCount++;
}

function resolveUpvalue(compiler: Compiler, name: Token): i32 {
    if (compiler.enclosing === null) return -1;
  
    const local: i32 = resolveLocal(<Compiler>compiler.enclosing, name);
    if (local !== -1) {
        console.log('adding local upvalue for ' + name.lexeme);
        (<Compiler>compiler.enclosing).locals[local].isCaptured = true;
        return addUpvalue(compiler, <u8>local, true);
    }
    // console.log('local not found for ' + name.lexeme + '. Searching surrounding scope')
    // recursive call to capture from further surrounding scopes
    const upvalue: i32 = resolveUpvalue(<Compiler>compiler.enclosing, name);
    if (upvalue !== -1) {
        console.log('adding surrounding scope upvalue for ' + name.lexeme);
        return addUpvalue(compiler, <u8>upvalue, false);
    }
  
    return -1;
}

function addLocal(name: Token): void {
    if (current.localCount === U8_COUNT) {
        error("Too many local variables in function.")
        return
    }

    const local: Local = new Local()
    // console.log('adding to locals index ' + current.localCount.toString())
    current.locals[current.localCount] = local
    // console.log(`current.localCount ${current.localCount}`)
    current.localCount++

    local.name = name
    local.depth = -1

    printLocals()
}

function printLocals(): void {
    console.log('== local variables ==')
    // console.log('locals length ' + current.locals.length.toString())
    for (let i = 0; i < current.localCount; ++i) {
        console.log(`name: ${current.locals[i].name.lexeme}, depth: ${current.locals[i].depth}`)
    }
}

function declareVariable(): void {
    if (current.scopeDepth === 0) return

    const name: Token = parser.previous

    for (let i = current.localCount - 1; i >= 0; i--) {
        const local: Local = current.locals[i]
        if (local.depth != -1 && local.depth < current.scopeDepth) {
            break
        }

        if (identifiersEqual(name, local.name)) {
            error("Already a variable with this name in this scope.")
        }
    }

    addLocal(name)
}

function parseVariable(errorMessage: string): u8 {
    consume(TokenType.TOKEN_IDENTIFIER, errorMessage)

    declareVariable()
    if (current.scopeDepth > 0) return 0

    return identifierConstant(parser.previous)
}

function markInitialized(): void {
    if (current.scopeDepth === 0) return
    current.locals[current.localCount - 1].depth = current.scopeDepth
}

function defineVariable(global: u8): void {
    if (current.scopeDepth > 0) {
        markInitialized()
        return
    }

    emitBytes(OpCode.OP_DEFINE_GLOBAL, global)
}

function argumentList(): u8 {
    let argCount: u8 = 0;
    if (!check(TokenType.TOKEN_RIGHT_PAREN)) {
      do {
        expression();
        if (argCount === 255) {
            error("Can't have more than 255 arguments.");
        }
        argCount++;
      } while (match(TokenType.TOKEN_COMMA));
    }
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after arguments.");
    return argCount;
  }

function and_(canAssign: bool): void {
    const endJump: i32 = emitJump(<u8>OpCode.OP_JUMP_IF_FALSE)

    emitByte(OpCode.OP_POP)
    parsePrecedence(Precedence.PREC_AND)

    patchJump(endJump)
}

function getRule(type: TokenType): ParseRule {
    return rules[type]
}

function expression(): void {
    parsePrecedence(Precedence.PREC_ASSIGNMENT)
}

function block(): void {
    while (!check(TokenType.TOKEN_RIGHT_BRACE) && !check(TokenType.TOKEN_EOF)) {
        declaration()
    }

    consume(TokenType.TOKEN_RIGHT_BRACE, "Expect '}' after block.")
}

function funCompile(type: FunctionType): void {
    const compiler: Compiler = new Compiler()
    initCompiler(compiler, type) // not top level
    beginScope()

    consume(TokenType.TOKEN_LEFT_PAREN, "Expect '(' after function name.")
    if (!check(TokenType.TOKEN_RIGHT_PAREN)) {
        do {
            current.function.arity++
            if (current.function.arity > 255) {
                errorAtCurrent("Can't have more than 255 parameters.")
            }

            const paramConstant: u8 = parseVariable("Expect parameter name.")
            defineVariable(paramConstant)
        } while (match(TokenType.TOKEN_COMMA))
    }
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after parameters.")

    consume(TokenType.TOKEN_LEFT_BRACE, "Expect '{' before function body.")
    block()

    const myFunction: ObjFunction = endCompiler()
    emitBytes(OpCode.OP_CLOSURE, makeConstant(OBJ_VAL(myFunction)));

    // for loop means variable sized encoding (depending on upvalueCount)
    for (let i:u8 = 0; i < myFunction.upvalueCount; i++) {
        if (compiler.upvalues[i].isLocal) {
            console.log('adding local byte')
        } else {
            console.log('adding surrounding scope byte')
        }
        console.log('adding index byte: ' + compiler.upvalues[i].index.toString())
        emitByte(compiler.upvalues[i].isLocal ? 1 : 0);
        emitByte(compiler.upvalues[i].index);
    }
}

function method(): void {
    consume(TokenType.TOKEN_IDENTIFIER, "Expect method name.");
    const constant: u8 = identifierConstant(parser.previous);

    let type: FunctionType = FunctionType.TYPE_METHOD;
    if (parser.previous.lexeme === "init") {
        type = FunctionType.TYPE_INITIALIZER;
    }
    // That utility function compiles the subsequent parameter list and function body.
    // Then it emits the code to create an ObjClosure and leave it on top of the stack.
    // At runtime, the VM will find the closure there.
    funCompile(type);
    emitBytes(OpCode.OP_METHOD, constant);
}

function classDeclaration(): void {
    consume(TokenType.TOKEN_IDENTIFIER, "Expect class name.");
    const className: Token = parser.previous;
    const nameConstant: u8 = identifierConstant(parser.previous);
    declareVariable();
  
    emitBytes(OpCode.OP_CLASS, nameConstant);
    defineVariable(nameConstant);

    const classCompiler: ClassCompiler = new ClassCompiler()
    classCompiler.enclosing = currentClass;
    currentClass = classCompiler;
  
    //  helper function generates code to load a variable with the given name onto the stack.
    namedVariable(className, false);
    consume(TokenType.TOKEN_LEFT_BRACE, "Expect '{' before class body.");
    while (!check(TokenType.TOKEN_RIGHT_BRACE) && !check(TokenType.TOKEN_EOF)) {
        method();
    }
    consume(TokenType.TOKEN_RIGHT_BRACE, "Expect '}' after class body.");
    // Once we’ve reached the end of the methods, we no longer need the class and tell the VM to pop it off the stack.
    emitByte(OpCode.OP_POP);

    currentClass = (<ClassCompiler>currentClass).enclosing;
}

function funDeclaration(): void {
    const global: u8 = parseVariable("Expect function name.")
    markInitialized()
    funCompile(FunctionType.TYPE_FUNCTION)
    defineVariable(global)
}

function varDeclaration(): void {
    const global: u8 = parseVariable('Expect variable name')

    if (match(TokenType.TOKEN_EQUAL)) {
        expression()
    } else {
        emitByte(OpCode.OP_NIL)
    }
    consume(TokenType.TOKEN_SEMICOLON, "Expect ';' after variable declaration.")

    defineVariable(global)
}

function expressionStatement(): void {
    expression()
    consume(TokenType.TOKEN_SEMICOLON, "Expect ';' after expression.")
    emitByte(OpCode.OP_POP)
}

function forStatement(): void {
    beginScope()
    consume(TokenType.TOKEN_LEFT_PAREN, "Expect '(' after 'for'.")
    if (match(TokenType.TOKEN_SEMICOLON)) {
        // No initializer.
    } else if (match(TokenType.TOKEN_VAR)) {
        varDeclaration()
    } else {
        expressionStatement()
    }

    let loopStart: i32 = currentChunk().count
    let exitJump = -1
    if (!match(TokenType.TOKEN_SEMICOLON)) {
        expression()
        consume(TokenType.TOKEN_SEMICOLON, "Expect ';' affter loop condition.")

        // Jump out of loop if condition is false
        exitJump = emitJump(<u8>OpCode.OP_JUMP_IF_FALSE)
        emitByte(OpCode.OP_POP) // Condition.
    }

    if (!match(TokenType.TOKEN_RIGHT_PAREN)) {
        const bodyJump: i32 = emitJump(<u8>OpCode.OP_JUMP)
        const incrementStart = currentChunk().count
        expression()
        emitByte(OpCode.OP_POP)
        consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after for clauses.")

        emitLoop(loopStart)
        loopStart = incrementStart
        patchJump(bodyJump)
    }

    statement()
    emitLoop(loopStart)

    if (exitJump !== -1) {
        patchJump(exitJump)
        emitByte(OpCode.OP_POP) // Condition.
    }

    endScope()
}

function ifStatement(): void {
    consume(TokenType.TOKEN_LEFT_PAREN, "Expect '(' after 'if'.")
    expression()
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after condition.")

    const thenJump: i32 = emitJump(<u8>OpCode.OP_JUMP_IF_FALSE)
    emitByte(OpCode.OP_POP)
    statement()

    const elseJump: i32 = emitJump(<u8>OpCode.OP_JUMP)

    patchJump(thenJump)
    emitByte(OpCode.OP_POP)

    if (match(TokenType.TOKEN_ELSE)) statement()
    patchJump(elseJump)
}


function printStatement(): void {
    expression()
    consume(TokenType.TOKEN_SEMICOLON, "Expect ';' after value.")
    emitByte(OpCode.OP_PRINT)
}

function returnStatement(): void {
    if (current.type === FunctionType.TYPE_SCRIPT) {
        error("Can't return from top-level code.");
    }

    if (match(TokenType.TOKEN_SEMICOLON)) {
        emitReturn();
    } else {
        if (current.type === FunctionType.TYPE_INITIALIZER) {
            error("Can't return a value from an initializer.");
        }
        expression();
        consume(TokenType.TOKEN_SEMICOLON, "Expect ';' after return value.");
        emitByte(OpCode.OP_RETURN);
    }
}

function whileStatement(): void {
    const loopStart: i32 = currentChunk().count
    consume(TokenType.TOKEN_LEFT_PAREN, "Expect '(' after 'while'.")
    expression()
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after condition.")

    const exitJump: i32 = emitJump(<u8>OpCode.OP_JUMP_IF_FALSE)
    emitByte(OpCode.OP_POP)
    statement()
    emitLoop(loopStart)

    patchJump(exitJump)
    emitByte(OpCode.OP_POP)
}

function synchronize(): void {
    parser.panicMode = false

    while (parser.current.type !== TokenType.TOKEN_EOF) {
        if (parser.previous.type === TokenType.TOKEN_SEMICOLON) return
        switch (parser.current.type) {
            case TokenType.TOKEN_CLASS:
            case TokenType.TOKEN_FUN:
            case TokenType.TOKEN_VAR:
            case TokenType.TOKEN_FOR:
            case TokenType.TOKEN_IF:
            case TokenType.TOKEN_WHILE:
            case TokenType.TOKEN_PRINT:
            case TokenType.TOKEN_RETURN:
                return

            default:
            // Do nothing.
        }

        advance()
    }
}

function declaration(): void {
    if (match(TokenType.TOKEN_CLASS)) {
        classDeclaration();
    }
    else if (match(TokenType.TOKEN_FUN)) {
        funDeclaration()
    }
    else if (match(TokenType.TOKEN_VAR)) {
        varDeclaration()
    } else {
        statement()
    }

    if (parser.panicMode) synchronize()
}

function statement(): void {
    if (match(TokenType.TOKEN_PRINT)) {
        printStatement()
    } else if (match(TokenType.TOKEN_FOR)) {
        forStatement()
    } else if (match(TokenType.TOKEN_IF)) {
        ifStatement()
    } else if (match(TokenType.TOKEN_RETURN)) {
        returnStatement();
    } else if (match(TokenType.TOKEN_WHILE)) {
        whileStatement()
    } else if (match(TokenType.TOKEN_LEFT_BRACE)) {
        beginScope()
        block()
        endScope()
    } else {
        expressionStatement()
    }
}
