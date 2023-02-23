import { Token, TokenType, initScanner, scanToken } from './scanner'

export function compile(source: string): void {
    console.log(`== compiled tokens ==`)
    initScanner(source)
    let line = -1
    let lineStr = ''
    while (true) {
        const token: Token = scanToken()
        if (token.line != line) {
            lineStr = lineStr + `\t\t ${token.line}`
            line = token.line
        } else {
            lineStr = lineStr + `\t\t | `
        }
        lineStr = lineStr + `\t\t | ${token.type} ${token.lexeme}\n`

        if (token.type == TokenType.TOKEN_EOF) break
    }

    console.log(lineStr)
}
