export enum ValueType {
    VAL_BOOL,
    VAL_NIL,
    VAL_NUMBER,
}

class As {
    boolean: bool = false
    number: f64 = 0

    // constructor(value: bool | f64) {
    //     if (isBoolean(value)) {
    //         this.boolean = value
    //     }
    //     if (isFloat(value)) {
    //         this.number = value
    //     }
    // }
}

export class Value {
    type: ValueType = ValueType.VAL_NIL
    myAs: As = new As()
    // nil: bool = false

    // constructors
    // constructor(value: bool | null | f64) {
    //     if (isBoolean(value)) {
    //         this.type = ValueType.VAL_BOOL
    //         this.as = new As(value)
    //     } else if (isFloat(value)) {
    //         this.type = ValueType.VAL_NUMBER
    //         this.as = new As(value)
    //     } else {
    //         this.type = ValueType.VAL_NIL
    //         this.as = new As(false)
    //         this.nil = true
    //     }
    // }

    // AS_BOOL() {
    //     return this.as.boolean
    // }

    // AS_NUMBER() {
    //     return this.as.number
    // }

    // IS_BOOL() {
    //     return this.type === ValueType.VAL_BOOL
    // }

    // IS_NIL() {
    //     return this.type === ValueType.VAL_NIL
    // }

    // IS_NUMBER() {
    //     return this.type === ValueType.VAL_NUMBER
    // }

    // toString() {
    //     return this.AS_NUMBER().toString()
    // }
}

// constructors
export function BOOL_VAL(value: bool): Value {
    const val = new Value()
    val.type = ValueType.VAL_BOOL
    val.myAs.boolean = value
    return val
}

export function NIL_VAL(): Value {
    const val = new Value()
    val.type = ValueType.VAL_NIL
    return val
}

export function NUMBER_VAL(value: f64): Value {
    const val = new Value()
    val.type = ValueType.VAL_NUMBER
    val.myAs.number = value
    return val
}

// convert back to web assembly types
export function AS_BOOL(value: Value): bool {
    return value.myAs.boolean
}

export function AS_NUMBER(value: Value): f64 {
    return value.myAs.number
}

// test the type of the Value
export function IS_BOOL(value: Value): bool {
    return value.type === ValueType.VAL_BOOL
}

export function IS_NIL(value: Value): bool {
    return value.type === ValueType.VAL_NIL
}

export function IS_NUMBER(value: Value): bool {
    return value.type === ValueType.VAL_NUMBER
}

export function valToString(value: Value): string {
    if (IS_BOOL(value)) {
        return value.myAs.boolean ? 'true' : 'false'
    } else if (IS_NUMBER(value)) {
        return value.myAs.number.toString()
    } else if (IS_NIL(value)) {
        return 'nil'
    } else {
        return 'unknown type'
    }
}

export class ValueArray {
    count: i32
    capacity: i32 // do we needs this?? is it maintained by the Uint8Array by itself
    values: Value[]

    // same as initValueArray()
    constructor() {
        this.count = 0
        this.capacity = 0
        this.values = new Array<Value>(0)
    }

    writeValueArray(value: Value): void {
        // leave out memory stuff for now bacause we use a dynamic array

        // console.log(`write value ${value.toString()}`)
        this.values[this.count] = value
        this.count++
    }

    freeValueArray(): void {
        this.values = new Array<Value>(0)
    }
}

export const printValueToString = (value: Value): string => {
    // console.log(`print ${value.toString()}`)
    return valToString(value)
}

export function valuesEqual(a: Value, b: Value): bool {
    if (a.type !== b.type) return false
    switch (a.type) {
        case ValueType.VAL_BOOL:
            return AS_BOOL(a) === AS_BOOL(b)
        case ValueType.VAL_NIL:
            return true
        case ValueType.VAL_NUMBER:
            return AS_NUMBER(a) === AS_NUMBER(b)
        default:
            return false // Unreachable.
    }
}
