import { AS_STRING, ObjString } from './object'
import { AS_OBJ, valToString, Value } from './value'
import { debugLog } from '.'

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
export function tableGet(map: Table, key: ObjString): Value | null {
    if (map.has(key)) {
        return map.get(key)
    } else {
        return null
    }
}

// add new entry to the hash table
// overwrite an old entry if there is one
// Returns true if a new entry was added
export function tableSet(map: Table, key: ObjString, value: Value): bool {
    const existed = map.has(key)
    map.set(key, value)
    return !existed
}

// if the key exists, deletes the entry and returns true
// otherwise returns false
export function tableDelete(map: Table, key: ObjString): bool {
    if (map.has(key)) {
        return map.delete(key)
    } else {
        return false
    }
}

// copy entries from one table to another
export function tableAddAll(from: Table, to: Table): void {
    const keys: ObjString[] = from.keys()
    for (let i = 0; i < keys.length; i++) {
        tableSet(to, keys[i], from.get(keys[i]))
    }
}

// This should return the key, not the value. Value is set as nil so cant cast to string
// returns null if the string is not a key
// otherwise returns the key as an ObjString
export function tableFindString(map: Table, myString: string): ObjString | null {
    debugLog(`searching for ${myString}`)
    let foundKey: ObjString | null = null
    const keys = map.keys()
    for (let i: i32 = 0; i < keys.length; i++) {
        if (keys[i].chars === myString) {
            debugLog(`found ${keys[i].chars}`)
            foundKey = keys[i]
        }
    }
    return foundKey
}

function tableRemoveWhite(map: Table): void {}

function markTable(map: Table): void {}

function printTable(map: Table, name: string): void {
    debugLog(`== table ${name} ==`)

    const keys: ObjString[] = map.keys()
    for (let i: i32 = 0; i < keys.length; i++) {
        const key = keys[i].chars
        const value = valToString(map.get(keys[i]))
        debugLog(`key: ${key} : value: ${value}`)
    }

    debugLog('')
}
