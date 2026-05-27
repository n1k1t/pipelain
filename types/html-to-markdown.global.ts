declare module '@aiquants/html-to-markdown' {
  export function htmlToMarkdown(url: string): Promise<{ markdown: string }>;
}
