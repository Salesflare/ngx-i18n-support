import {Observable} from 'rxjs';

/**
 * Abstraction for translation providers.
 */
export interface ITranslateProvider {
    /**
     * Translate an array of messages at once.
     * Implementations should preserve order and lengths.
     * @param messages the messages to be translated
     * @param from source language code
     * @param to target language code
     */
    translateMultipleStrings(messages: string[], from: string, to: string): Observable<string[]>;
}




