export enum TokenType {
    // single character tokens
    TOKEN_LEFT_PAREN,
    TOKEN_RIGHT_PAREN,
    TOKEN_LEFT_BRACE,
    TOKEN_RIGHT_BRACE,
    TOKEN_COMMA,
    TOKEN_DOT,
    TOKEN_MINUS,
    TOKEN_PLUS,
    TOKEN_SEMICOLON,
    TOKEN_SLASH,
    TOKEN_STAR,
    // one or two character tokens
    TOKEN_BANG,
    TOKEN_BANG_EQUAL,
    TOKEN_EQUAL,
    TOKEN_EQUAL_EQUAL,
    TOKEN_GREATER,
    TOKEN_GREATER_EQUAL,
    TOKEN_LESS,
    TOKEN_LESS_EQUAL,
    // Literals
    TOKEN_IDENTIFIER,
    TOKEN_STRING,
    TOKEN_NUMBER,
    // Keywords
    TOKEN_AND,
    TOKEN_CLASS,
    TOKEN_ELSE,
    TOKEN_FALSE,
    TOKEN_FOR,
    TOKEN_FUN,
    TOKEN_IF,
    TOKEN_NIL,
    TOKEN_OR,
    TOKEN_PRINT,
    TOKEN_RETURN,
    TOKEN_SUPER,
    TOKEN_THIS,
    TOKEN_TRUE,
    TOKEN_VAR,
    TOKEN_WHILE,

    TOKEN_ERROR,
    TOKEN_EOF,
}

export const tokenTypeStrings: string[] = [
    'TOKEN_LEFT_PAREN',
    'TOKEN_RIGHT_PAREN',
    'TOKEN_LEFT_BRACE',
    'TOKEN_RIGHT_BRACE',
    'TOKEN_COMMA',
    'TOKEN_DOT',
    'TOKEN_MINUS',
    'TOKEN_PLUS',
    'TOKEN_SEMICOLON',
    'TOKEN_SLASH',
    'TOKEN_STAR',
    'TOKEN_BANG',
    'TOKEN_BANG_EQUAL',
    'TOKEN_EQUAL',
    'TOKEN_EQUAL_EQUAL',
    'TOKEN_GREATER',
    'TOKEN_GREATER_EQUAL',
    'TOKEN_LESS',
    'TOKEN_LESS_EQUAL',
    'TOKEN_IDENTIFIER',
    'TOKEN_STRING',
    'TOKEN_NUMBER',
    'TOKEN_AND',
    'TOKEN_CLASS',
    'TOKEN_ELSE',
    'TOKEN_FALSE',
    'TOKEN_FOR',
    'TOKEN_FUN',
    'TOKEN_IF',
    'TOKEN_NIL',
    'TOKEN_OR',
    'TOKEN_PRINT',
    'TOKEN_RETURN',
    'TOKEN_SUPER',
    'TOKEN_THIS',
    'TOKEN_TRUE',
    'TOKEN_VAR',
    'TOKEN_WHILE',
    'TOKEN_ERROR',
    'TOKEN_EOF',
]

export class Token {
    // TODO: not using pointers so we don't have the original string here
    type: TokenType = TokenType.TOKEN_ERROR
    // start: u32 = 0
    // length: u32 = 0
    lexeme: string = ''
    line: u16 = 0
}

class Scanner {
    start: u32 = 0
    current: u32 = 0
    line: u16 = 0
}

// global variable. TODO: use @global decorator??
let scanner: Scanner = new Scanner()
// clox doesnt have this because scanner.start and scanner.current are raw memory pointers
let codestring: String = ''

export function initScanner(source: String): void {
    scanner.start = 0
    scanner.current = 0
    scanner.line = 1

    // keep string around because we are using indexes not pointers
    codestring = source
}

function isAlpha(c: i32): bool {
    return (c >= 'a'.charCodeAt(0) && c <= 'z'.charCodeAt(0)) || (c >= 'A'.charCodeAt(0) && c <= 'Z'.charCodeAt(0)) || c == '_'.charCodeAt(0)
}

function isDigit(c: i32): bool {
    return c >= '0'.charCodeAt(0) && c <= '9'.charCodeAt(0)
}

function isAtEnd(): bool {
    return scanner.current === codestring.length
}

// should return a single character
function advance(): i32 {
    scanner.current++
    return codestring.charCodeAt(scanner.current - 1)
}

// returns a single character
function peek(): i32 {
    return codestring.charCodeAt(scanner.current)
}

function peekNext(): i32 {
    if (isAtEnd()) return '\0'.charCodeAt(0)
    return codestring.charCodeAt(scanner.current + 1)
}

// expected is a single character
function match(expected: i32): bool {
    if (isAtEnd()) return false
    if (codestring.charCodeAt(scanner.current) !== expected) return false
    scanner.current++
    return true
}

function makeToken(type: TokenType): Token {
    let token = new Token()
    token.type = type
    token.lexeme = codestring.substring(scanner.start, scanner.current)
    token.line = scanner.line
    return token
}

function errorToken(message: string): Token {
    let token = new Token()
    token.type = TokenType.TOKEN_ERROR
    token.lexeme = message
    token.line = scanner.line
    return token
}

function skipWhitespace(): void {
    while (true) {
        const c: u32 = peek()
        switch (c) {
            case ' '.charCodeAt(0):
            case '\r'.charCodeAt(0):
            case '\t'.charCodeAt(0):
                advance()
                break
            case '\n'.charCodeAt(0):
                scanner.line++
                advance()
                break
            case '/'.charCodeAt(0): //comments
                if (peekNext() === '/'.charCodeAt(0)) {
                    while (peek() != '\n'.charCodeAt(0) && !isAtEnd()) advance()
                } else {
                    return
                }
                break
            default:
                return
        }
    }
}

function checkKeyword(start: u32, length: u32, rest: String, type: TokenType): TokenType {
    // check length and rest of string characters match up
    const startIndex = scanner.start + start
    const endIndex = scanner.current
    const wordEnd = codestring.substring(startIndex, endIndex)
    if (scanner.current - scanner.start === start + length && rest === wordEnd) {
        return type
    } else {
        return TokenType.TOKEN_IDENTIFIER
    }
}

function identifierType(): TokenType {
    const c: String = codestring.charAt(scanner.start)
    const cCode: u32 = c.charCodeAt(0)

    switch (cCode) {
        case 'a'.charCodeAt(0):
            return checkKeyword(1, 2, 'nd', TokenType.TOKEN_AND)
        case 'c'.charCodeAt(0):
            return checkKeyword(1, 4, 'lass', TokenType.TOKEN_CLASS)
        case 'e'.charCodeAt(0):
            return checkKeyword(1, 3, 'lse', TokenType.TOKEN_ELSE)
        case 'f'.charCodeAt(0):
            if (scanner.current - scanner.start > 1) {
                const s: String = codestring.charAt(scanner.start + 1)
                const sCode: u32 = s.charCodeAt(0)
                switch (sCode) {
                    case 'a'.charCodeAt(0):
                        return checkKeyword(2, 3, 'lse', TokenType.TOKEN_FALSE)
                    case 'o'.charCodeAt(0):
                        return checkKeyword(2, 1, 'r', TokenType.TOKEN_FOR)
                    case 'u'.charCodeAt(0):
                        return checkKeyword(2, 1, 'n', TokenType.TOKEN_FUN)
                }
            }
            break
        case 'i'.charCodeAt(0):
            return checkKeyword(1, 1, 'f', TokenType.TOKEN_IF)
        case 'n'.charCodeAt(0):
            return checkKeyword(1, 2, 'il', TokenType.TOKEN_NIL)
        case 'o'.charCodeAt(0):
            return checkKeyword(1, 1, 'r', TokenType.TOKEN_OR)
        case 'p'.charCodeAt(0):
            return checkKeyword(1, 4, 'rint', TokenType.TOKEN_PRINT)
        case 'r'.charCodeAt(0):
            return checkKeyword(1, 5, 'eturn', TokenType.TOKEN_RETURN)
        case 's'.charCodeAt(0):
            return checkKeyword(1, 4, 'uper', TokenType.TOKEN_SUPER)
        case 't'.charCodeAt(0):
            if (scanner.current - scanner.start > 1) {
                const t: String = codestring.charAt(scanner.start + 1)
                const tCode: u32 = t.charCodeAt(0)
                switch (tCode) {
                    case 'h'.charCodeAt(0):
                        return checkKeyword(2, 2, 'is', TokenType.TOKEN_THIS)
                    case 'r'.charCodeAt(0):
                        return checkKeyword(2, 2, 'ue', TokenType.TOKEN_TRUE)
                }
            }
            break
        case 'v'.charCodeAt(0):
            return checkKeyword(1, 2, 'ar', TokenType.TOKEN_VAR)
        case 'w'.charCodeAt(0):
            return checkKeyword(1, 4, 'hile', TokenType.TOKEN_WHILE)
    }

    return TokenType.TOKEN_IDENTIFIER
}

function identifier(): Token {
    while (isAlpha(peek()) || isDigit(peek())) advance()
    return makeToken(identifierType())
}

function number(): Token {
    while (isDigit(peek())) advance()

    // look for fractional part
    if (peek() == '.'.charCodeAt(0) && isDigit(peekNext())) {
        advance()

        while (isDigit(peek())) advance()
    }

    return makeToken(TokenType.TOKEN_NUMBER)
}

function mString(): Token {
    while (peek() != '"'.charCodeAt(0) && !isAtEnd()) {
        if (peek() == '\n'.charCodeAt(0)) scanner.line++
        advance()
    }

    if (isAtEnd()) return errorToken('Unterminated string.')

    //the closing quote
    advance()
    return makeToken(TokenType.TOKEN_STRING)
}

export function scanToken(): Token {
    skipWhitespace()
    scanner.start = scanner.current

    if (isAtEnd()) {
        return makeToken(TokenType.TOKEN_EOF)
    }

    const c: u32 = advance()

    if (isAlpha(c)) return identifier()
    if (isDigit(c)) return number()

    switch (c) {
        case '('.charCodeAt(0):
            return makeToken(TokenType.TOKEN_LEFT_PAREN)
        case ')'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_RIGHT_PAREN)
        case '{'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_LEFT_BRACE)
        case '}'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_RIGHT_BRACE)
        case ';'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_SEMICOLON)
        case ','.charCodeAt(0):
            return makeToken(TokenType.TOKEN_COMMA)
        case '.'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_DOT)
        case '-'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_MINUS)
        case '+'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_PLUS)
        case '/'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_SLASH)
        case '*'.charCodeAt(0):
            return makeToken(TokenType.TOKEN_STAR)
        case '!'.charCodeAt(0):
            return makeToken(match('='.charCodeAt(0)) ? TokenType.TOKEN_BANG_EQUAL : TokenType.TOKEN_BANG)
        case '='.charCodeAt(0):
            return makeToken(match('='.charCodeAt(0)) ? TokenType.TOKEN_EQUAL_EQUAL : TokenType.TOKEN_EQUAL)
        case '<'.charCodeAt(0):
            return makeToken(match('='.charCodeAt(0)) ? TokenType.TOKEN_LESS_EQUAL : TokenType.TOKEN_LESS)
        case '>'.charCodeAt(0):
            return makeToken(match('='.charCodeAt(0)) ? TokenType.TOKEN_GREATER_EQUAL : TokenType.TOKEN_GREATER)
        case '"'.charCodeAt(0):
            return mString()
    }

    return errorToken('Unexpected character.')
}
