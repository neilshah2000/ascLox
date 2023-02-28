import { Token, TokenType, initScanner, scanToken, tokenTypeStrings } from './scanner'
import { Chunk, OpCode } from './chunk'
import { NUMBER_VAL, Value } from './value'
import { disassembleChunk } from './debug'

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

type ParseFn = () => void

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

// global variable. TODO: use @global decorator??
let parser: Parser = new Parser()
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
    compilingChunk = chunk

    parser.hadError = false
    parser.panicMode = false

    advance()
    expression()
    consume(TokenType.TOKEN_EOF, 'Expect end of expression')
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

function emitByte(byte: i32): void {
    currentChunk().writeChunk(byte, parser.previous.line)
}

function emitBytes(byte1: i32, byte2: i32): void {
    emitByte(byte1)
    emitByte(byte2)
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

function endCompiler(): void {
    emitReturn()
    // TODO: put behind debug flag
    if (!parser.hadError) {
        disassembleChunk(currentChunk(), 'bytecode')
    }
}

function binary(): void {
    const operatorType: TokenType = parser.previous.type
    const rule: ParseRule = getRule(operatorType)
    parsePrecedence(<Precedence>(rule.precedence + 1))
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

function literal(): void {
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

function grouping(): void {
    expression()
    consume(TokenType.TOKEN_RIGHT_PAREN, "Expect ')' after expression.")
}

function number(): void {
    const value: f64 = parseFloat(parser.previous.lexeme)
    emitConstant(NUMBER_VAL(value))
}

function unary(): void {
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
rules[TokenType.TOKEN_IDENTIFIER] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_STRING] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_NUMBER] = new ParseRule(number, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_AND] = new ParseRule(null, null, Precedence.PREC_AND)
rules[TokenType.TOKEN_CLASS] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_ELSE] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FALSE] = new ParseRule(literal, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FOR] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_FUN] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_IF] = new ParseRule(null, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_NIL] = new ParseRule(literal, null, Precedence.PREC_NONE)
rules[TokenType.TOKEN_OR] = new ParseRule(null, null, Precedence.PREC_OR)
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

    prefixRule()

    while (precedence <= getRule(parser.current.type).precedence) {
        advance()
        const infixRule: ParseFn | null = getRule(parser.previous.type).infix
        if (infixRule !== null) infixRule()
    }
}

function getRule(type: TokenType): ParseRule {
    return rules[type]
}

function expression(): void {
    parsePrecedence(Precedence.PREC_ASSIGNMENT)
}
