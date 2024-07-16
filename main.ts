import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, requestUrl, htmlToMarkdown, sanitizeHTMLToDom } from 'obsidian';
import TurndownService from 'turndown';
import { marked } from 'marked';
import { read } from 'fs';

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
      readmeContent = this.convertRelativeImageUrls(readmeContent, repoUrl);
      readmeContent = this.convertBr(readmeContent)
      readmeContent = this.removeEmptyHtmlTags(readmeContent)
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
    const lines = content.split('\n');
    const result: string[] = [];
    let currentHtmlTag: string | null = null;
    let isInMarkdown = false;

    const htmlOpenRegex = /^<(\w+)(?:\s+[^>]*)?>/;
    const htmlCloseRegex = /^<\/(\w+)>/;
    const markdownChars = new Set(['#', '-', '*', '>', '[', '!', '`', '|', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimStart();
        const firstChar = line[0];
        const openMatch = line.match(htmlOpenRegex);
        const closeMatch = line.match(htmlCloseRegex);

        if (openMatch && !currentHtmlTag) {
            // Start of a new HTML tag
            currentHtmlTag = openMatch[1];
            result.push(lines[i]);
            isInMarkdown = false;
        } else if (closeMatch && currentHtmlTag === closeMatch[1]) {
            // End of current HTML tag
            currentHtmlTag = null;
            result.push(lines[i]);
            isInMarkdown = false;
        } else if (currentHtmlTag) {
            // Inside an HTML tag
            if (markdownChars.has(firstChar)) {
                // Markdown content inside HTML
                if (!isInMarkdown) {
                    result.push(`</${currentHtmlTag}>`);
                    isInMarkdown = true;
                }
                result.push(lines[i]);
            } else {
                // Regular HTML content
                if (isInMarkdown) {
                    result.push(`<${currentHtmlTag}>`);
                    isInMarkdown = false;
                }
                result.push(this.sanitizeLine(lines[i]));
            }
        } else {
            // Outside any HTML tag
            result.push(lines[i]);
        }
    }

    return result.join('\n');
}

 sanitizeLine(line: string): string {
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(sanitizeHTMLToDom(line));
    return tempDiv.innerHTML;
}

removeEmptyHtmlTags(content: string): string {
  // Regular expression to match empty HTML tags
  const emptyTagRegex = /<([a-z]+)(?:\s+[^>]*)?>\s*<\/\1>/gi;
  
  // Replace empty tags with an empty string
  let result = content;
  let previousResult;
  
  do {
      previousResult = result;
      result = result.replace(emptyTagRegex, '');
  } while (result !== previousResult);
  
  return result;
}

  convertBr(content: string): string {
    return content.replace(/<\/?br\s*\/?>\s*/gi, htmlToMarkdown('</br>'));
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