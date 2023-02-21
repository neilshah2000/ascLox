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
