import { AS_AS_STRING, AS_STRING, Obj, ObjString, ObjType, OBJ_TYPE } from './object'

export enum ValueType {
    VAL_BOOL,
    VAL_NIL,
    VAL_NUMBER,
    VAL_OBJ,
}

class As {
    boolean: bool = false
    number: f64 = 0
    obj: Obj = new Obj()
}

export class Value {
    type: ValueType = ValueType.VAL_NIL
    myAs: As = new As()
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

export function OBJ_VAL(obj: Obj): Value {
    const val = new Value()
    val.type = ValueType.VAL_OBJ
    val.myAs.obj = obj
    return val
}

// convert back to web assembly types
export function AS_BOOL(value: Value): bool {
    return value.myAs.boolean
}

export function AS_NUMBER(value: Value): f64 {
    return value.myAs.number
}

export function AS_OBJ(value: Value): Obj {
    return value.myAs.obj
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

export function IS_OBJ(value: Value): bool {
    return value.type === ValueType.VAL_OBJ
}

function objectToString(objectValue: Value): string {
    switch (OBJ_TYPE(objectValue)) {
        case ObjType.OBJ_STRING:
            return AS_AS_STRING(objectValue)
        default:
            return '' // should be unreachable
    }
}

export function valToString(value: Value): string {
    switch (value.type) {
        case ValueType.VAL_BOOL:
            return value.myAs.boolean ? 'true' : 'false'
        case ValueType.VAL_NIL:
            return 'nil'
        case ValueType.VAL_NUMBER:
            return value.myAs.number.toString()
        case ValueType.VAL_OBJ:
            return objectToString(value)
        default:
            return '' // should be unreachable
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
        case ValueType.VAL_OBJ: {
            const aString: ObjString = AS_STRING(a)
            const bString: ObjString = AS_STRING(b)
            // use assemblyscript string compare instead of c style direct char array comparison
            return aString.chars === bString.chars
        }
        default:
            return false // Unreachable.
    }
}
