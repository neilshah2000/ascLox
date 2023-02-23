export const GROW_CAPACITY = (capacity: i32): i32 => {
    return capacity < 8 ? 8 : capacity * 2
}

export const GROW_UINT8_ARRAY = (array: Uint8Array, oldCapacity: i32, newCapacity: i32): Uint8Array => {
    const newArray = new Uint8Array(newCapacity)
    newArray.set(array)
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

    console.log(`memory stored string: ${storedString}`)
    // console.log(`memory stored string2: ${storedString2}`)
    console.log(__heap_base.toString())
}
