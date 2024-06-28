declare module 'marked' {
  export interface MarkedOptions {
    // Define any options for the marked library here
  }

  export interface MarkedCallback {
    (err: any, data?: string): void;
  }

  export function marked(markdown: string, callback?: MarkedCallback): string;
  export function marked(markdown: string, options?: MarkedOptions, callback?: MarkedCallback): string;
  export function setOptions(options: MarkedOptions): void;
}