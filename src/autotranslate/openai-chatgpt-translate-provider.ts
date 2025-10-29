import {Observable, of, throwError, forkJoin} from 'rxjs';
import {map, catchError} from 'rxjs/operators';
import * as request from 'request';
import {ITranslateProvider} from './i-translate-provider';
import {sanitizeTranslatorOutput} from './sanitize-output';

interface ChatMessage {
    role: 'system' | 'user';
    content: string;
}

interface ChatRequestBody {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    top_p?: number;
}

interface ChatChoiceMessage { content: string; }
interface ChatChoice { message: ChatChoiceMessage; }
interface ChatResponse { choices: ChatChoice[]; }

/**
 * ChatGPT translate provider using OpenAI Chat Completions API.
 */
export class OpenAIChatGPTTranslateProvider implements ITranslateProvider {

    private _request: request.RequestAPI<request.Request, request.CoreOptions, request.RequiredUriUrl>;
    private readonly apiKey: string;
    private readonly model: string;
    private readonly customPrompt: string;

    // conservative chunking to avoid context bloat and long completions
    private static readonly MAX_ITEMS_PER_REQUEST = 25;
    private static readonly MAX_CHARS_PER_REQUEST = 6000;

    constructor(apiKey: string, model: string, prompt?: string) {
        this._request = request;
        this.apiKey = apiKey;
        this.model = model || 'gpt-4o-mini';
        this.customPrompt = prompt || '';
    }

    translateMultipleStrings(messages: string[], from: string, to: string): Observable<string[]> {
        if (messages.length === 0) {
            return of([]);
        }
        if (!this.apiKey) {
            return throwError(new Error('cannot autotranslate: no OpenAI api key'));
        }
        if (!from || !to) {
            return throwError(new Error('cannot autotranslate: source and target language must be set'));
        }
        const chunks = this.chunk(messages);
        const calls = chunks.map((chunk) => this.callOpenAI(chunk, from, to));
        return forkJoin(calls).pipe(map((parts: string[][]) => {
            let all: string[] = [];
            parts.forEach(p => all = all.concat(p));
            return all;
        }));
    }

    private chunk(messages: string[]): string[][] {
        const result: string[][] = [];
        let current: string[] = [];
        let chars = 0;
        for (const m of messages) {
            const mlen = (m || '').length;
            if (current.length >= OpenAIChatGPTTranslateProvider.MAX_ITEMS_PER_REQUEST ||
                (chars + mlen) >= OpenAIChatGPTTranslateProvider.MAX_CHARS_PER_REQUEST) {
                if (current.length > 0) {
                    result.push(current);
                    current = [];
                    chars = 0;
                }
            }
            current.push(m);
            chars += mlen;
        }
        if (current.length > 0) {
            result.push(current);
        }
        return result;
    }

    private callOpenAI(messages: string[], from: string, to: string): Observable<string[]> {
        const system = this.customPrompt && this.customPrompt.trim().length > 0 ? this.customPrompt : this.defaultSystemPrompt();
        const userPayload = {
            sourceLanguage: from,
            targetLanguage: to,
            texts: messages
        };
        const body: ChatRequestBody = {
            model: this.model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: JSON.stringify(userPayload) }
            ],
            temperature: 0,
            top_p: 1
        };
        const uri = 'https://api.openai.com/v1/chat/completions';
        const options: request.CoreOptions = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: body,
            json: true
        };
        return this.post(uri, options).pipe(map((resp) => {
            const data: ChatResponse = resp.body;
            if (!data || !data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
                throw new Error('no result received');
            }
            let content = data.choices[0].message.content.trim();
            // strip code fences if present
            if (content.startsWith('```')) {
                content = content.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```\s*$/, '').trim();
            }
            // attempt to extract the JSON array if additional text surrounds it
            if (!content.startsWith('[')) {
                const firstBracket = content.indexOf('[');
                const lastBracket = content.lastIndexOf(']');
                if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
                    content = content.substring(firstBracket, lastBracket + 1).trim();
                }
            }
            let parsed: any;
            try {
                parsed = JSON.parse(content);
            } catch (e) {
                throw new Error('Unexpected response format from ChatGPT (not JSON)');
            }
            if (!Array.isArray(parsed)) {
                throw new Error('Unexpected response from ChatGPT (expected JSON array)');
            }
            if (parsed.length !== messages.length) {
                throw new Error(`Unexpected response length from ChatGPT: expected ${messages.length}, got ${parsed.length}`);
            }
            return parsed.map((s, i) => sanitizeTranslatorOutput((s == null) ? '' : String(s), messages[i]));
        }), catchError((err) => {
            if (err && err.statusCode === 401) {
                return throwError(new Error('OpenAI authentication failed'));
            }
            if (err && (err.statusCode === 429 || (err.statusCode >= 500 && err.statusCode < 600))) {
                return throwError(new Error('OpenAI rate limited or server error'));
            }
            const message = (err && err.message) ? err.message : 'OpenAI request failed';
            return throwError(new Error(message));
        }));
    }

    private post(uri: string, options?: request.CoreOptions): Observable<{ response: request.RequestResponse, body: any }> {
        return <Observable<{ response: request.RequestResponse, body: any }>> Observable.create((observer) => {
            this._request.post(uri, options, (error: any, response: request.RequestResponse, body: any) => {
                if (error) {
                    observer.error(error);
                } else {
                    observer.next({ response, body });
                    observer.complete();
                }
            });
        });
    }

    private defaultSystemPrompt(): string {
        return 'You translate UI strings for a CRM application. Return EXACTLY a JSON array with the same number of items as the input array "texts". Each output item MUST be the translation of the input item at the same index. Do not add, remove, merge, split, or reorder items. If any input item is empty, return an empty string at that index. Return ONLY the raw JSON array (no code fences or extra text). Preserve ICU message syntax, placeholders like <x id="..."/>, and any HTML/XML tags. Do not translate placeholders, IDs, or tag names. Do NOT introduce any new HTML/XML tags not present in the input. If the text mentions tag names (e.g., "head tag"), keep them as plain words without angle brackets. Keep similar length to the source.';
    }
}




