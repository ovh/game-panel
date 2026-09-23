import type { SettingDefinition, SettingValue } from './types.js';

const DEFAULT_MAX_STRING_LENGTH = 2048;

const CONTROL_CHARS_RE = /[\0\r\n]/;

export const LAUNCH_TOKEN_PATTERN = '^[^\\s"\'`$&;|<>(){}\\[\\]*?~#!\\\\]*$';
export const LAUNCH_TOKEN_MESSAGE =
    'Spaces and shell characters are not allowed in a launch parameter (the game server splits them into separate arguments).';

export const LAUNCH_PHRASE_PATTERN = '^[^"\'`$&;|<>(){}\\[\\]*?~#!\\\\]*$';
export const LAUNCH_PHRASE_MESSAGE =
    'Quotes and shell characters are not allowed in a launch parameter.';

export function invalidSettingInput(message: string): never {
    throw Object.assign(new Error(message), { statusCode: 400 });
}

function optionValues(definition: SettingDefinition): (string | number)[] {
    return (definition.options ?? []).map((option) => option.value);
}

function describeOptions(definition: SettingDefinition): string {
    return optionValues(definition)
        .map((value) => (value === '' ? '(default)' : String(value)))
        .join(', ');
}

function toNumber(definition: SettingDefinition, value: unknown): number {
    const numeric = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;

    if (!Number.isFinite(numeric)) invalidSettingInput(`${definition.key} must be a number`);
    if (definition.type === 'integer' && !Number.isInteger(numeric)) {
        invalidSettingInput(`${definition.key} must be an integer`);
    }
    if (definition.min !== undefined && numeric < definition.min) {
        invalidSettingInput(`${definition.key} must be greater than or equal to ${definition.min}`);
    }
    if (definition.max !== undefined && numeric > definition.max) {
        invalidSettingInput(`${definition.key} must be less than or equal to ${definition.max}`);
    }

    return numeric;
}

function checkString(definition: SettingDefinition, value: string): string {
    const maxLength = definition.maxLength ?? DEFAULT_MAX_STRING_LENGTH;

    if (CONTROL_CHARS_RE.test(value)) {
        invalidSettingInput(`${definition.key} contains invalid characters`);
    }
    if (value.length > maxLength) {
        invalidSettingInput(`${definition.key} must be at most ${maxLength} characters`);
    }
    if (definition.minLength !== undefined && value.length < definition.minLength) {
        invalidSettingInput(`${definition.key} must be at least ${definition.minLength} characters`);
    }
    if (definition.pattern && !new RegExp(definition.pattern).test(value)) {
        invalidSettingInput(definition.patternMessage ?? `${definition.key} contains invalid characters`);
    }

    return value;
}

export function coerceSettingValue(definition: SettingDefinition, input: unknown): SettingValue {
    if (definition.nullable && (input === null || input === '')) return '';

    switch (definition.type) {
        case 'boolean': {
            if (typeof input !== 'boolean') invalidSettingInput(`${definition.key} must be a boolean`);
            return input;
        }

        case 'integer':
        case 'float':
            return toNumber(definition, input);

        case 'select': {
            const values = optionValues(definition);
            const numericOptions = values.length > 0 && values.every((value) => typeof value === 'number');

            if (numericOptions) {
                const numeric = typeof input === 'number' ? input : Number(input);
                if (!Number.isInteger(numeric) || (!definition.freeform && !values.includes(numeric))) {
                    invalidSettingInput(`${definition.key} must be one of: ${describeOptions(definition)}`);
                }
                return numeric;
            }

            if (typeof input !== 'string') invalidSettingInput(`${definition.key} must be a string`);
            const normalized = input.trim();

            if (!definition.freeform && !values.includes(normalized)) {
                invalidSettingInput(`${definition.key} must be one of: ${describeOptions(definition)}`);
            }

            return checkString(definition, normalized);
        }

        case 'string': {
            if (typeof input !== 'string') invalidSettingInput(`${definition.key} must be a string`);
            return checkString(definition, input);
        }
    }
}

export function fallbackSettingValue(definition: SettingDefinition): SettingValue {
    if (definition.default !== undefined) return definition.default;

    switch (definition.type) {
        case 'boolean': return false;
        case 'integer':
        case 'float': return definition.min ?? 0;
        case 'select': return definition.options?.[0]?.value ?? '';
        case 'string': return '';
    }
}
