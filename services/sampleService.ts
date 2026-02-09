
import { GitHubService } from './gitHubService';

export interface SampleAgent {
  name: string;
  path: string;
  description?: string; // Fetched from README or hardcoded list if needed
}

export interface SampleFile {
  path: string;
  content: string; // Base64 or text
  encoding: 'base64' | 'utf-8';
}

export class SampleService {
  private baseUrl = 'https://api.github.com/repos/google/adk-samples/contents/python/agents';
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private getHeaders() {
    return this.token ? { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github.v3+json' } : { Accept: 'application/vnd.github.v3+json' };
  }

  async getSamples(): Promise<SampleAgent[]> {
    try {
      const response = await fetch(this.baseUrl, { headers: this.getHeaders() });
      if (!response.ok) throw new Error(`Failed to fetch samples: ${response.statusText}`);

      const data = await response.json();
      // Filter for directories only and exclude 'README.md' or other files
      return data
        .filter((item: any) => item.type === 'dir')
        .map((item: any) => ({
          name: item.name,
          path: item.path,
        }));
    } catch (error) {
      console.error('Error fetching samples:', error);
      throw error;
    }
  }

  // Recursive fetch of all files in a directory
  async getSampleFiles(sampleName: string): Promise<SampleFile[]> {
    const files: SampleFile[] = [];
    await this.fetchRecursive(`${this.baseUrl}/${sampleName}`, '', files);
    return files;
  }

  private async fetchRecursive(url: string, basePath: string, files: SampleFile[]) {
    const response = await fetch(url, { headers: this.getHeaders() });
    if (!response.ok) throw new Error(`Failed to fetch files at ${url}: ${response.statusText}`);

    const data = await response.json();

    for (const item of data) {
      if (item.type === 'file') {
        const fileResponse = await fetch(item.url, { headers: this.getHeaders() }); // Fetch blob/content
        if (!fileResponse.ok) continue;
        const fileData = await fileResponse.json();
        // GitHub API returns content in base64
        const isText = /\.(py|md|txt|json|yaml|yml|toml|lock|sh|gitignore|env|example)$/i.test(item.name);
        let content = fileData.content;
        let encoding: 'base64' | 'utf-8' = 'base64';

        if (isText && content) {
          try {
            // Decode base64 to utf-8 string for editing
            content = atob(content.replace(/\n/g, ''));
            encoding = 'utf-8';
          } catch (e) {
            console.warn(`Failed to decode ${item.name}, keeping as base64`);
          }
        }

        files.push({
          path: basePath ? `${basePath}/${item.name}` : item.name,
          content: content,
          encoding: encoding
        });
      } else if (item.type === 'dir') {
        await this.fetchRecursive(item.url, basePath ? `${basePath}/${item.name}` : item.name, files);
      }
    }
  }
}
