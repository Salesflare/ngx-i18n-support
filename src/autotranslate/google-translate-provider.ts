import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AutoTranslateService} from './auto-translate-service';
import {ITranslateProvider} from './i-translate-provider';
import {sanitizeTranslatorOutput} from './sanitize-output';

/**
 * Provider wrapper around existing Google Translate low-level service.
 */
export class GoogleTranslateProvider implements ITranslateProvider {

    private service: AutoTranslateService;

    constructor(apiKey: string) {
        this.service = new AutoTranslateService(apiKey);
    }

    translateMultipleStrings(messages: string[], from: string, to: string): Observable<string[]> {
        return this.service.translateMultipleStrings(messages, from, to)
            .pipe(map((translations: string[]) => translations.map((t, i) => sanitizeTranslatorOutput((t == null) ? '' : String(t), messages[i]))));
    }
}




