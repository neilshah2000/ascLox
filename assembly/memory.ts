import { Obj, ObjString, ObjType } from './object'
import { vm } from './vm'
import { debugLog } from '.'
import { Value } from './value'

export const GROW_CAPACITY = (capacity: i32): i32 => {
    return capacity < 8 ? 8 : capacity * 2
}

export const GROW_UINT8_ARRAY = (array: StaticArray<u8>, oldCapacity: i32, newCapacity: i32): StaticArray<u8> => {
    const newArray = new StaticArray<u8>(newCapacity)
    for (let i = 0; i < array.length; i++) {
        newArray[i] = array[i]
    }
    return newArray
}

export const GROW_VALUE_ARRAY = (array: StaticArray<Value>, oldCapacity: i32, newCapacity: i32): StaticArray<Value> => {
    const newArray = new StaticArray<Value>(newCapacity)
    for (let i = 0; i < array.length; i++) {
        newArray[i] = array[i]
    }
    return newArray
}

export const GROW_UINT16_ARRAY = (array: Uint16Array, oldCapacity: i32, newCapacity: i32): Uint16Array => {
    const newArray = new Uint16Array(newCapacity)
    newArray.set(array)
    return newArray
}

// store in linear memory
export const storeCodeString = (code: string): void => {
    const size10: string = '0123456789'
    const alpha10: string = 'abcdefghij'
    store<string>(__heap_base, size10)
    // store<string>(4, alpha10)

    const storedString = load<string>(__heap_base)
    // const storedString2 = load<string>(4)

    debugLog(`memory stored string: ${storedString}`)
    // debugLog(`memory stored string2: ${storedString2}`)
    debugLog(__heap_base.toString())
}

export function freeObjects(): void {
    let object: Obj | null = vm.objects
    while (object !== null) {
        const next: Obj | null = object.nextObj
        // freeObject(object)
        // for now just set object to next to allow assemblyscript garbage collector to clean up
        object = next
    }
}

// function freeObject(object: Obj):void {
//     switch (object.type) {
//         case ObjType.OBJ_STRING: {
//             const string: ObjString = <ObjString>object
//             FREE_ARRAY(string.chars)
//             FREE(object)

//         }
//     }
// }

// function FREE() {
//     // TODO: figure out memory stuff to free
//     reallocate()
// }
