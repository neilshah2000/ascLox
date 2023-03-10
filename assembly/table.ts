import { AS_STRING, ObjString } from './object'
import { AS_OBJ, valToString, Value } from './value'

export type Table = Map<ObjString, Value>

export function initTable(): Table {
    // we have to return, because we can't set the value of a pointer like c
    return new Map<ObjString, Value>()
}

export function freeTable(): Table {
    // FREE_ARRAY()
    return initTable()
}

// returns the value if key exists
// otherwise returns null
function tableGet(map: Table, key: ObjString): Value | null {
    if (map.has(key)) {
        return map.get(key)
    } else {
        return null
    }
}

// add new entry to the hash table
// overwrite an old entry if there is one
export function tableSet(map: Table, key: ObjString, value: Value): bool {
    map.set(key, value)
    return false
}

// if the key exists, deletes the entry and returns true
// otherwise returns false
function tableDelete(map: Table, key: ObjString): bool {
    if (map.has(key)) {
        return map.delete(key)
    } else {
        return false
    }
}

function tableAddAll(map: Table): void {}

// This should return the key, not the value. Value is set as nil so cant cast to string
// returns null if the string is not a key
// otherwise returns the key as an ObjString
export function tableFindString(map: Table, myString: string): ObjString | null {
    console.log(`searching for ${myString}`)
    let foundKey: ObjString | null = null
    const keys = map.keys()
    for (let i: i32 = 0; i < keys.length; i++) {
        if (keys[i].chars === myString) {
            console.log(`found ${keys[i].chars}`)
            foundKey = keys[i]
        }
    }
    return foundKey
}

function tableRemoveWhite(map: Table): void {}

function markTable(map: Table): void {}

function printTable(map: Table, name: string): void {
    console.log(`== table ${name} ==`)

    const keys: ObjString[] = map.keys()
    for (let i: i32 = 0; i < keys.length; i++) {
        const key = keys[i].chars
        const value = valToString(map.get(keys[i]))
        console.log(`key: ${key} : value: ${value}`)
    }

    console.log()
}
