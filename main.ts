import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import axios from 'axios';

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
      const readmeContent = await this.fetchReadme(repoUrl);
      const updatedContent = await this.handleEmbeddedAssets(readmeContent, repoUrl);
      editor.replaceSelection(updatedContent);
      new Notice('README imported successfully!');
    } catch (error) {
      new Notice('Failed to import README. Please check the repository URL.');
      console.error(error);
    }
  }

  async fetchReadme(repoUrl: string): Promise<string> {
    const [owner, repo] = this.parseRepoUrl(repoUrl);
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
    
    const response = await axios.get(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3.raw' }
    });

    return response.data;
  }

  parseRepoUrl(url: string): [string, string] {
    const parts = url.split('/');
    return [parts[parts.length - 2], parts[parts.length - 1]];
  }

  async handleEmbeddedAssets(content: string, repoUrl: string): Promise<string> {
    const assetUrls = this.extractAssetUrls(content, repoUrl);
    for (const assetUrl of assetUrls) {
      const localPath = await this.downloadAsset(assetUrl);
      content = content.replace(assetUrl, localPath);
    }
    return content;
  }

  extractAssetUrls(content: string, repoUrl: string): string[] {
    const assetUrls: string[] = [];
    const regex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const assetUrl = new URL(match[1], repoUrl).href;
        assetUrls.push(assetUrl);
      } catch (error) {
        console.error(`Failed to construct URL for ${match[1]}:`, error);
      }
    }
    return assetUrls;
  }

  async downloadAsset(url: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const assetName = url.split('/').pop();
    const assetFolderPath = 'assets';
    const assetFilePath = `${assetFolderPath}/${assetName}`;

    // Ensure the assets folder exists
    const folderExists = await this.app.vault.adapter.exists(assetFolderPath);
    if (!folderExists) {
      await this.app.vault.createFolder(assetFolderPath);
    }

    // Save the asset to the vault
    await this.app.vault.createBinary(assetFilePath, response.data);
    return assetFilePath;
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