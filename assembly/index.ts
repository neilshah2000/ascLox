let outputstring = ''
export function printout(myStr: string): void {
    outputstring = outputstring + myStr + '\n'
}

// The entry file of your WebAssembly module.
import { interpret, freeVM, initVM, InterpretResult, VM } from './vm'

export function main(code: string): string {
    // store this in linear memory and use pointers to reference it
    console.log()
    console.log()
    console.log(`========== source code ==========`)
    console.log(code)

    outputstring = ''

    initVM()

    const result: InterpretResult = interpret(code)

    freeVM()

    return outputstring
}

// export function add(a: i32, b: i32): i32 {
//     return a + b;
// }

// declare function consoleLog(arg0: i32): void;

// // Log out the number 24
// consoleLog(24);



