/** Exported memory */
export declare const memory: WebAssembly.Memory;
/**
 * assembly/index/printout
 * @param myStr `~lib/string/String`
 */
export declare function printout(myStr: string): void;
/**
 * assembly/index/debugLog
 * @param line `~lib/string/String`
 */
export declare function debugLog(line: string): void;
/**
 * assembly/index/setDebugFlag
 * @param flag `bool`
 */
export declare function setDebugFlag(flag: boolean): void;
/**
 * assembly/index/getDebugFlag
 * @returns `bool`
 */
export declare function getDebugFlag(): boolean;
/**
 * assembly/index/main
 * @param code `~lib/string/String`
 * @returns `~lib/string/String`
 */
export declare function main(code: string): string;
