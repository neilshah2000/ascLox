let outputstring = ''
export function printout(myStr: string): void {
    outputstring = outputstring + myStr + '\n'
}

let debugFlag = false
export function debugLog(line: string): void {
    if (debugFlag) {
        console.log(line)
    } else {
        // do nothing
    }
}
export function setDebugFlag(flag: boolean): void {
    debugFlag = flag
    debugLog(`setting debug flag to ${flag}`)
}
export function getDebugFlag(): boolean {
    return debugFlag
}

// The entry file of your WebAssembly module.
import { interpret, freeVM, initVM, InterpretResult, VM } from './vm'

export function main(code: string): string {
    // store this in linear memory and use pointers to reference it
    debugLog('')
    debugLog('')
    debugLog(`========== source code ==========`)
    debugLog(code)

    outputstring = ''

    initVM()

    const result: InterpretResult = interpret(code)

    freeVM()

    return outputstring
}




