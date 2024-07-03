import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, requestUrl, htmlToMarkdown } from 'obsidian';
import TurndownService from 'turndown';
import { marked } from 'marked';

export default class GitHubReadmeImporter extends Plugin {
  async onload() {
    this.addCommand({
      id: 'import-github-readme',
      name: 'Import GitHub README',
      editorCallback: (editor: Editor, view: MarkdownView) => {
        new GitHubRepoModal(this.app, (result) => {
          this.importReadme(result, editor);
        }).open();
      }
    });
  }

  async importReadme(repoUrl: string, editor: Editor) {
    try {
      let readmeContent = await this.fetchReadme(repoUrl);
      readmeContent = this.convertMarkdownToHTML(readmeContent);
      readmeContent = this.removeEmptyLinesInsideHtmlTags(readmeContent);
      readmeContent = this.removeBrAndDivTags(readmeContent);
      readmeContent = this.convertRelativeImageUrls(readmeContent, repoUrl);
      editor.replaceSelection(readmeContent);
      new Notice('README imported successfully!');
    } catch (error) {
      new Notice('Failed to import README. Please check the repository URL.');
      console.error(error);
    }
  }

  async fetchReadme(repoUrl: string): Promise<string> {
    const [owner, repo] = this.parseRepoUrl(repoUrl);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
    
    const response = await requestUrl({
      url: apiUrl,
      headers: { 'Accept': 'application/vnd.github.v3.raw' }
    });

    if (!response.status) {
      throw new Error(`Failed to fetch README: ${response.status}`);
    }

    return response.text;
  }

  parseRepoUrl(url: string): [string, string] {
    const parts = url.split('/');
    return [parts[parts.length - 2], parts[parts.length - 1]];
  }

  convertMarkdownToHTML(content: string): string {
    const regex = /<(\w+)(?:[^>]+)?>([\s\S]*?)<\/\1>/g;
  
    return content.replace(regex, (match, tag, text) => {
      // Check if the content inside the tag contains Markdown
      if (/<[^>]+>/.test(text)) {
        // Convert the Markdown content to HTML using marked.js
        const html = marked(text);
        // Return the HTML tag with the converted content
        return `<${tag}>${html}</${tag}>`;
      } else {
        // Return the original HTML tag
        return match;
      }
    });
  }

  removeEmptyLinesInsideHtmlTags(content: string): string {
    const regex = /<(\w+)[^>]*>([\s\S]*?)<\/\1>/g;

    return content.replace(regex, (match) => {
      return match.replace(/\n\s*/g, '');
    });
  }

  removeBrAndDivTags(content: string): string {
    return content.replace(/<br\s*\/?>/g, '').replace(/<\/?\s*div[^>]*>/g, '');
  }

  convertRelativeImageUrls(content: string, repoUrl: string): string {
    const [owner, repo] = this.parseRepoUrl(repoUrl);
    const baseUrl = `https://github.com/${owner}/${repo}/blob/main/`;
    
    // Convert Markdown image URLs
    content = content.replace(/!\[([^\]]*)\]\((?!http)([^)]+)\)/g, (match, alt, url) => {
      return `![${alt}](${this.resolveUrl(url, baseUrl)}?raw=true)`;
    });

    // Convert HTML image URLs
    content = content.replace(/<img.*?src=["'](?!http)([^"']+)["'].*?>/g, (match, url) => {
    return match.replace(url, this.resolveUrl(url, baseUrl) + '?raw=true');
    });

    return content;
  }

  resolveUrl(url: string, base: string): string {
    try {
      // Check if the URL is already absolute
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      // If it's not absolute, resolve it against the base URL
      return new URL(url, base).href;
    } catch (error) {
      console.warn(`Failed to resolve URL: ${url}`, error);
      return url; // Return the original URL if resolution fails
    }
  }
}

class GitHubRepoModal extends Modal {
  result: string;
  onSubmit: (result: string) => void;

  constructor(app: App, onSubmit: (result: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl("h1", { text: "Enter GitHub Repository URL" });

    new Setting(contentEl)
      .setName("Repository URL")
      .addText((text) =>
        text.onChange((value) => {
          this.result = value
        }));

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Import")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.result);
          }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}