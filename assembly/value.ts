export type Value = f64

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
    return value.toString()
}
