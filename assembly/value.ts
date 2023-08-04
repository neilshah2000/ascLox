import { AS_AS_STRING, AS_STRING, Obj, ObjString, ObjType, OBJ_TYPE, AS_FUNCTION, printFunction, AS_CLOSURE, ObjClosure, AS_CLASS, AS_INSTANCE, AS_BOUND_METHOD } from './object'
import { debugLog } from '.'
import { GROW_CAPACITY, GROW_VALUE_ARRAY } from './memory'

export enum ValueType {
    VAL_BOOL,
    VAL_NIL,
    VAL_NUMBER,
    VAL_OBJ,
}

export class Value {
    type: ValueType = ValueType.VAL_NIL
    boolean: bool = false
    number: f64 = 0
    obj: Obj | null = null
}

// constructors
export function BOOL_VAL(value: bool): Value {
    const val = new Value()
    val.type = ValueType.VAL_BOOL
    val.boolean = value
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
    val.number = value
    return val
}

export function OBJ_VAL(obj: Obj): Value {
    const val = new Value()
    val.type = ValueType.VAL_OBJ
    val.obj = obj
    return val
}

// convert back to web assembly types
export function AS_BOOL(value: Value): bool {
    return value.boolean
}

export function AS_NUMBER(value: Value): f64 {
    return value.number
}

export function AS_OBJ(value: Value): Obj {
    return <Obj>value.obj
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
        case ObjType.OBJ_BOUND_METHOD:
            return printFunction(AS_BOUND_METHOD(objectValue).method.func)
        case ObjType.OBJ_CLASS:
            return AS_CLASS(objectValue).name
        case ObjType.OBJ_INSTANCE:
            return `${AS_INSTANCE(objectValue).klass.name} instance`
        case ObjType.OBJ_STRING:
            return AS_AS_STRING(objectValue)
        case ObjType.OBJ_CLOSURE:
            const myClosure: ObjClosure = AS_CLOSURE(objectValue)
            return printFunction(myClosure.func)
        case ObjType.OBJ_FUNCTION:
            return printFunction(AS_FUNCTION(objectValue))
        case ObjType.OBJ_NATIVE:
            return '<native fn>'
        default:
            return '' // should be unreachable
    }
}

export function valToString(value: Value): string {
    switch (value.type) {
        case ValueType.VAL_BOOL:
            return value.boolean ? 'true' : 'false'
        case ValueType.VAL_NIL:
            return 'nil'
        case ValueType.VAL_NUMBER:
            return value.number.toString()
        case ValueType.VAL_OBJ:
            return objectToString(value)
        default:
            return '' // should be unreachable
    }
}

export class ValueArray {
    count: i32
    capacity: i32 // do we needs this?? is it maintained by the Uint8Array by itself
    values: StaticArray<Value>

    // same as initValueArray()
    constructor() {
        this.count = 0
        this.capacity = 0
        this.values = new StaticArray<Value>(0)
    }

    writeValueArray(value: Value): void {
        if (this.capacity < this.count + 1) {
            const oldCapacity: i32 = this.capacity
            this.capacity = GROW_CAPACITY(oldCapacity)
            this.values = GROW_VALUE_ARRAY(this.values, oldCapacity, this.capacity)
        }

        // debugLog(`write value ${value.toString()}`)
        this.values[this.count] = value
        this.count++
    }

    freeValueArray(): void {
        this.values = new StaticArray<Value>(0)
    }
}

export const printValueToString = (value: Value): string => {
    // debugLog(`print ${value.toString()}`)
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
            // these should be interned strings now so can do direct reference comparison
            return AS_OBJ(a) === AS_OBJ(b)
        }
        default:
            return false // Unreachable.
    }
}
