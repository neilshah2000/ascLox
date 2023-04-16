import { Token, TokenType, initScanner, scanToken, tokenTypeStrings } from './scanner'
import { Chunk, OpCode } from './chunk'
import { NUMBER_VAL, OBJ_VAL, Value } from './value'
import { disassembleChunk } from './debug'
import { copyString } from './object'

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
    depth: i32 = 0 // numbered nesting level, 0 is global, 1 first top-level ..etc
}

const U8_COUNT = 256
class Compiler {
    locals: Local[] = new Array<Local>(U8_COUNT)
    localCount: i32 = 0
    scopeDepth: i32 = 0
}

// global variable. TODO: use @global decorator??
let parser: Parser = new Parser()
let current: Compiler = new Compiler()
let compilingChunk: Chunk = new Chunk()

function currentChunk(): Chunk {
    return compilingChunk
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

export function compile(source: string, chunk: Chunk): bool {
    initScanner(source)
    initCompiler()
    compilingChunk = chunk

    parser.hadError = false
    parser.panicMode = false

    advance()

    while (!match(TokenType.TOKEN_EOF)) {
        declaration()
    }

    endCompiler()
    return !parser.hadError
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

function initCompiler(): void {
    current = new Compiler()
    console.log('init compiler')
}

function endCompiler(): void {
    emitReturn()
    // TODO: put behind debug flag
    if (!parser.hadError) {
        disassembleChunk(currentChunk(), 'bytecode')
    }
}

function beginScope(): void {
    current.scopeDepth++
}

function endScope(): void {
    current.scopeDepth--

    while (current.localCount > 0 && current.locals[current.localCount - 1].depth > current.scopeDepth) {
        emitByte(OpCode.OP_POP)
        current.localCount--
    }
}

function binary(canAssign: bool): void {
    const operatorType: TokenType = parser.previous.type
    const rule: ParseRule = getRule(operatorType)
    parsePrecedence(<Precedence>(rule.precedence + 1))
    console.log('token type ' + operatorType.toString())
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
        arg = identifierConstant(name)
        getOp = OpCode.OP_GET_GLOBAL
        setOp = OpCode.OP_SET_GLOBAL
    }

    if (canAssign && match(TokenType.TOKEN_EQUAL)) {
        expression()
        emitBytes(setOp, <u8>arg)
    } else {
        emitBytes(getOp, <u8>arg)
    }
}

function variable(canAssign: bool): void {
    console.log('variable')
    namedVariable(parser.previous, canAssign)
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
rules[TokenType.TOKEN_LEFT_PAREN] = new ParseRule(grouping, null, Precedence.PREC_CALL)
rules[TokenType.TOKEN_RIGHT_PAREN] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_LEFT_BRACE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_RIGHT_BRACE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_COMMA] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_DOT] = new ParseRule(null, null, Precedence.PREC_CALL)
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
rules[TokenType.TOKEN_THIS] = new ParseRule(null, null, Precedence.PREC_NONE)
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
        if (identifiersEqual(name, local.name)) {
            if (local.depth == -1) {
                error("Can't read local variable in it's own initializer.")
            }
            return i // index in locals array is same as stack slot
        }
    }

    return -1
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
    current.locals[current.localCount - 1].depth = current.scopeDepth
}

function defineVariable(global: u8): void {
    if (current.scopeDepth > 0) {
        markInitialized()
        return
    }

    emitBytes(OpCode.OP_DEFINE_GLOBAL, global)
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
    if (match(TokenType.TOKEN_VAR)) {
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
