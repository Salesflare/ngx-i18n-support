import {Observable} from 'rxjs';

/**
 * Sanitize translator output by escaping tags introduced that were not present in the input.
 * Preserves any tags that already existed in the input string.
 */
export function sanitizeTranslatorOutput(output: string, input: string): string {
    // Match simple HTML/XML tags like <tag ...> or </tag>
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/g;
    const inputHasAngles = /</.test(input) && />/.test(input);

    // Collect allowed tag names from the input (preserve placeholders and real tags)
    const allowed = new Set<string>();
    if (inputHasAngles) {
        const inputTagRegex = new RegExp(tagRegex.source, 'g');
        let m: RegExpExecArray | null;
        while ((m = inputTagRegex.exec(input)) !== null) {
            const name = (m[1] || '').toLowerCase();
            if (name) {
                allowed.add(name);
            }
        }
    }

    const safe = (output || '').replace(tagRegex, (fullMatch: string, name: string) => {
        const tagName = (name || '').toLowerCase();
        if (!inputHasAngles) {
            return fullMatch.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        return allowed.has(tagName)
            ? fullMatch
            : fullMatch.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    return safe;
}


