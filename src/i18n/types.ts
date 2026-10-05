/** Shared i18n types. The English catalogue is the source of truth for keys and {params}. */
import type { en } from './messages/en';

export type Lang = 'en' | 'fr' | 'es' | 'it' | 'pt';

/** A message is a plain string or, for counted nouns, one string per plural form (selected by the `count` param). */
export type Message = string | { readonly one: string; readonly other: string };

export type MessageKey = keyof typeof en;

/** A full catalogue: a missing (or extra) key fails typecheck. */
export type Catalogue = { readonly [K in MessageKey]: Message };

type MessageText<M> = M extends string ? M : M extends { readonly one: infer A; readonly other: infer B } ? A | B : never;
type ParamNames<S> = S extends `${string}{${infer P}}${infer Rest}` ? P | ParamNames<Rest> : never;

/** The {param} names a key takes, read from the English text. */
export type ParamsOf<K extends MessageKey> = ParamNames<MessageText<(typeof en)[K]>>;
export type ParamValues = string | number;

/** Rest arguments of `t(key, ...)`: required only when the English text has {params}. */
export type TArgs<K extends MessageKey> = [ParamsOf<K>] extends [never] ? [] : [params: { readonly [P in ParamsOf<K>]: ParamValues }];
